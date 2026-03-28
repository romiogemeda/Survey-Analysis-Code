"""Simulation async tasks — synthetic response generation."""

import asyncio
import logging
from uuid import UUID
from workers.celery_app import celery_app
from src.shared_kernel import async_session_factory

logger = logging.getLogger(__name__)


@celery_app.task(name="simulation.generate", bind=True, max_retries=2)
def generate_simulation_task(
    self, survey_schema_id: str, persona_id: str, num_responses: int = 1
):
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