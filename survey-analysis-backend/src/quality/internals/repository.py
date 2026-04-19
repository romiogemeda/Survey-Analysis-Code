"""Quality — Internal Repository. Data access for quality-owned tables."""

import logging
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.shared_kernel import QualityGrade, QualityScoreRecord
from src.quality.models.orm import QualityScoreModel

logger = logging.getLogger(__name__)


class QualityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save_score(self, submission_id: UUID, scores: dict) -> QualityScoreModel:
        # Upsert: update the existing row if already scored, insert otherwise.
        # Prevents IntegrityError from the unique constraint on submission_id
        # when the batch is run more than once.
        stmt = select(QualityScoreModel).where(QualityScoreModel.submission_id == submission_id)
        result = await self._session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.grade = scores["grade"]
            existing.speed_score = scores["speed_score"]
            existing.variance_score = scores["variance_score"]
            existing.gibberish_score = scores["gibberish_score"]
            existing.composite_score = scores["composite_score"]
            await self._session.flush()
            return existing

        model = QualityScoreModel(
            submission_id=submission_id,
            grade=scores["grade"],
            speed_score=scores["speed_score"],
            variance_score=scores["variance_score"],
            gibberish_score=scores["gibberish_score"],
            composite_score=scores["composite_score"],
        )
        self._session.add(model)
        await self._session.flush()
        return model

    async def get_score(self, submission_id: UUID) -> QualityScoreRecord | None:
        stmt = select(QualityScoreModel).where(QualityScoreModel.submission_id == submission_id)
        result = await self._session.execute(stmt)
        r = result.scalar_one_or_none()
        if r is None:
            return None
        return QualityScoreRecord(
            id=r.id, submission_id=r.submission_id, grade=QualityGrade(r.grade),
            speed_score=r.speed_score, variance_score=r.variance_score,
            gibberish_score=r.gibberish_score, composite_score=r.composite_score,
            scored_at=r.scored_at,
        )

    async def get_scores_for_survey(self, submission_ids: list[UUID]) -> list[QualityScoreRecord]:
        if not submission_ids:
            return []
        stmt = select(QualityScoreModel).where(
            QualityScoreModel.submission_id.in_(submission_ids)
        )
        result = await self._session.execute(stmt)
        return [
            QualityScoreRecord(
                id=r.id, submission_id=r.submission_id, grade=QualityGrade(r.grade),
                speed_score=r.speed_score, variance_score=r.variance_score,
                gibberish_score=r.gibberish_score, composite_score=r.composite_score,
                scored_at=r.scored_at,
            ) for r in result.scalars().all()
        ]

    async def get_submission_ids_by_min_grade(
        self, submission_ids: list[UUID], min_grade: QualityGrade
    ) -> list[UUID]:
        grade_levels = {QualityGrade.HIGH: 3, QualityGrade.MEDIUM: 2, QualityGrade.LOW: 1}
        min_level = grade_levels[min_grade]
        allowed = [g for g, lv in grade_levels.items() if lv >= min_level]
        stmt = select(QualityScoreModel.submission_id).where(
            QualityScoreModel.submission_id.in_(submission_ids),
            QualityScoreModel.grade.in_(allowed),
        )
        result = await self._session.execute(stmt)
        return [row[0] for row in result.all()]