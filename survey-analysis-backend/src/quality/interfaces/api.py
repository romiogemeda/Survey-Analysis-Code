"""
Quality Module — Public Interface.
FR-04 (Quality Scoring), FR-05 (Quality Toggle).
Called synchronously by Ingestion during ingest. Read by Analytics, Visualization, Chat.
"""

import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import QualityGrade, QualityScoreRecord, SubmissionRecord, get_db_session
from src.quality.internals.scorer import QualityScorer
from src.quality.internals.repository import QualityRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/quality", tags=["Quality"])


class QualityService:
    """Public quality service. Called by other modules through this interface only."""

    def __init__(self, session: AsyncSession) -> None:
        self._scorer = QualityScorer()
        self._repo = QualityRepository(session)

    async def score_submission(
        self, submission: SubmissionRecord, completion_time_seconds: float | None = None
    ) -> QualityScoreRecord:
        """FR-04: Score a submission and persist the result."""
        scores = self._scorer.score_submission(
            raw_responses=submission.raw_responses,
            completion_time_seconds=completion_time_seconds,
        )
        await self._repo.save_score(submission.id, scores)
        logger.info("Scored submission %s → %s (%.3f)",
                     submission.id, scores["grade"], scores["composite_score"])
        return QualityScoreRecord(
            submission_id=submission.id, **scores
        )

    async def score_submissions_batch(
        self, submissions: list[SubmissionRecord]
    ) -> list[QualityScoreRecord]:
        """Score a batch of submissions (called after bulk ingestion)."""
        results = []
        for sub in submissions:
            result = await self.score_submission(sub)
            results.append(result)
        return results

    async def get_score(self, submission_id: UUID) -> QualityScoreRecord | None:
        return await self._repo.get_score(submission_id)

    async def get_scores_for_survey(self, submission_ids: list[UUID]) -> list[QualityScoreRecord]:
        return await self._repo.get_scores_for_survey(submission_ids)

    async def get_scores_for_schema(self, schema_id: UUID) -> list[QualityScoreRecord]:
        """Fetch all quality scores for a given schema."""
        return await self._repo.get_scores_for_schema(schema_id)

    async def filter_by_quality(
        self, submission_ids: list[UUID], min_grade: QualityGrade = QualityGrade.MEDIUM
    ) -> list[UUID]:
        """FR-05: Return only submission IDs that meet the quality threshold."""
        return await self._repo.get_submission_ids_by_min_grade(submission_ids, min_grade)


# ── Routes ────────────────────────────────────────

@router.get("/score/{submission_id}")
async def get_quality_score(
    submission_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = QualityService(session)
    score = await service.get_score(submission_id)
    if score is None:
        raise HTTPException(404, "Quality score not found")
    return score.model_dump(mode="json")


@router.post("/score-batch/{survey_schema_id}")
async def score_batch(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    """Score all unscored submissions for a survey."""
    from src.ingestion.interfaces.api import IngestionService
    ing_service = IngestionService(session)
    submissions = await ing_service.get_submissions(survey_schema_id, valid_only=True)

    quality_service = QualityService(session)
    results = await quality_service.score_submissions_batch(submissions)
    return {
        "scored": len(results),
        "grades": {
            "HIGH": sum(1 for r in results if r.grade == QualityGrade.HIGH),
            "MEDIUM": sum(1 for r in results if r.grade == QualityGrade.MEDIUM),
            "LOW": sum(1 for r in results if r.grade == QualityGrade.LOW),
        }
    }