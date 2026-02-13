"""Analytics async tasks — correlation analysis and summary generation."""

import asyncio
import logging
from uuid import UUID
from workers.celery_app import celery_app
from src.shared_kernel import async_session_factory

logger = logging.getLogger(__name__)


@celery_app.task(name="analytics.run_correlation", bind=True, max_retries=3)
def run_correlation_task(self, survey_schema_id: str):
    logger.info("Async correlation for %s", survey_schema_id)
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run_correlation(UUID(survey_schema_id)))
        return {"status": "complete", "survey_schema_id": survey_schema_id}
    except Exception as exc:
        logger.error("Correlation failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
    finally:
        loop.close()


async def _run_correlation(survey_schema_id: UUID):
    from src.ingestion.interfaces.api import IngestionService
    from src.analytics.interfaces.api import AnalyticsService
    async with async_session_factory() as session:
        ing = IngestionService(session)
        subs = await ing.get_submissions(survey_schema_id, valid_only=True)
        service = AnalyticsService(session)
        await service.run_correlation_analysis(
            survey_schema_id, [s.raw_responses for s in subs]
        )
        await session.commit()


@celery_app.task(name="analytics.generate_summary", bind=True, max_retries=2)
def generate_summary_task(self, survey_schema_id: str, quality_filter: bool = False):
    logger.info("Async summary for %s", survey_schema_id)
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_generate_summary(UUID(survey_schema_id), quality_filter))
        return {"status": "complete"}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)
    finally:
        loop.close()


async def _generate_summary(survey_schema_id: UUID, quality_filter: bool):
    from src.ingestion.interfaces.api import IngestionService
    from src.analytics.interfaces.api import AnalyticsService
    async with async_session_factory() as session:
        ing = IngestionService(session)
        subs = await ing.get_submissions(survey_schema_id)
        service = AnalyticsService(session)
        insights = await service.get_insights(survey_schema_id)
        await service.generate_executive_summary(
            survey_schema_id, [s.raw_responses for s in subs], insights, quality_filter
        )
        await session.commit()