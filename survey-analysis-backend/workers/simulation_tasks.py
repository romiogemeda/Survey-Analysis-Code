"""Simulation async tasks — synthetic response generation."""

import asyncio
import logging
from uuid import UUID
from workers.celery_app import celery_app
from src.shared_kernel import async_session_factory, JobStatus

logger = logging.getLogger(__name__)


@celery_app.task(name="simulation.generate", bind=True, max_retries=2)
def generate_simulation_task(
    self, survey_schema_id: str, persona_id: str, num_responses: int = 1
):
    """Legacy task for single/small batch simulation."""
    logger.info("Async simulation: persona=%s, count=%d", persona_id, num_responses)
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            _run_simulation(UUID(survey_schema_id), UUID(persona_id), num_responses)
        )
        return {"status": "complete", "responses_generated": num_responses}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)
    finally:
        loop.close()


@celery_app.task(name="simulation.bulk_generate", bind=True)
def bulk_generate_simulation_task(
    self, survey_schema_id: str, persona_id: str, job_id: str
):
    """Modern bulk simulation task with progress tracking."""
    logger.info("Bulk simulation starting: job=%s", job_id)
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            _run_bulk_simulation(UUID(survey_schema_id), UUID(persona_id), UUID(job_id))
        )
        return {"status": "complete", "job_id": job_id}
    except Exception as exc:
        logger.error("Bulk simulation failed: %s", str(exc))
        # Update job status to FAILED
        loop.run_until_complete(_mark_job_failed(UUID(job_id), str(exc)))
        return {"status": "failed", "error": str(exc)}
    finally:
        loop.close()


async def _run_simulation(survey_schema_id: UUID, persona_id: UUID, num_responses: int):
    from src.ingestion.interfaces.api import IngestionService
    from src.simulation.interfaces.api import SimulationService
    async with async_session_factory() as session:
        ing = IngestionService(session)
        schema = await ing.get_survey_schema(survey_schema_id)
        questions = [q.model_dump() if hasattr(q, 'model_dump') else q
                     for q in (schema.question_definitions if schema else [])]
        sim = SimulationService(session)
        await sim.run_simulation(survey_schema_id, persona_id, questions, num_responses)
        await session.commit()


async def _run_bulk_simulation(survey_schema_id: UUID, persona_id: UUID, job_id: UUID):
    from src.ingestion.interfaces.api import IngestionService
    from src.simulation.interfaces.api import SimulationService
    from src.simulation.internals.repository import SimulationRepository

    async with async_session_factory() as session:
        repo = SimulationRepository(session)
        job = await repo.get_job(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        # Update status to PROCESSING
        await repo.update_job_progress(job_id, 0, status=JobStatus.PROCESSING)
        await session.commit()

        ing = IngestionService(session)
        schema = await ing.get_survey_schema(survey_schema_id)
        questions = [q.model_dump() if hasattr(q, 'model_dump') else q
                     for q in (schema.question_definitions if schema else [])]

        sim = SimulationService(session)
        
        # We run in batches to report progress
        batch_size = 5
        total = job.total_requested
        processed = 0

        while processed < total:
            current_batch = min(batch_size, total - processed)
            await sim.run_simulation(survey_schema_id, persona_id, questions, current_batch)
            processed += current_batch
            
            # Update progress
            await repo.update_job_progress(job_id, processed, status=JobStatus.PROCESSING)
            await session.commit()
            logger.info("Job %s progress: %d/%d", job_id, processed, total)

        await repo.update_job_progress(job_id, total, status=JobStatus.COMPLETED)
        await session.commit()


async def _mark_job_failed(job_id: UUID, error: str):
    from src.simulation.internals.repository import SimulationRepository
    async with async_session_factory() as session:
        repo = SimulationRepository(session)
        await repo.mark_job_failed(job_id, error)
        await session.commit()