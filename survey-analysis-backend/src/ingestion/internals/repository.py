"""Ingestion — Internal Repository. Data access for ingestion-owned tables."""

import json
import logging
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import SubmissionRecord, SurveySchemaRecord
from src.ingestion.models.orm import IngestionLogModel, SubmissionModel, SurveySchemaModel

logger = logging.getLogger(__name__)


class IngestionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Survey Schema ────────────────────────────

    async def save_survey_schema(self, schema: SurveySchemaRecord) -> SurveySchemaModel:
        model = SurveySchemaModel(
            id=schema.id,
            title=schema.title,
            version_id=schema.version_id,
            question_definitions=[q.model_dump() for q in schema.question_definitions],
            created_at=schema.created_at,
        )
        self._session.add(model)
        await self._session.flush()
        return model

    async def get_survey_schema(self, schema_id: UUID) -> SurveySchemaRecord | None:
        stmt = select(SurveySchemaModel).where(SurveySchemaModel.id == schema_id)
        result = await self._session.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return SurveySchemaRecord(
            id=row.id, title=row.title, version_id=row.version_id,
            question_definitions=row.question_definitions, created_at=row.created_at,
        )

    async def list_survey_schemas(self) -> list[SurveySchemaRecord]:
        stmt = select(SurveySchemaModel).order_by(SurveySchemaModel.created_at.desc())
        result = await self._session.execute(stmt)
        return [
            SurveySchemaRecord(
                id=r.id, title=r.title, version_id=r.version_id,
                question_definitions=r.question_definitions, created_at=r.created_at,
            ) for r in result.scalars().all()
        ]

    # ── Submissions ──────────────────────────────

    async def save_submissions(self, submissions: list[SubmissionRecord]) -> None:
        models = [
            SubmissionModel(
                id=s.id, survey_schema_id=s.survey_schema_id,
                raw_responses=s.raw_responses, source_format=s.source_format,
                started_at=s.started_at, completed_at=s.completed_at,
                received_at=s.received_at, is_valid=s.is_valid,
            ) for s in submissions
        ]
        self._session.add_all(models)
        await self._session.flush()

    async def get_submissions(
        self, survey_schema_id: UUID, valid_only: bool = True
    ) -> list[SubmissionRecord]:
        stmt = select(SubmissionModel).where(
            SubmissionModel.survey_schema_id == survey_schema_id
        )
        if valid_only:
            stmt = stmt.where(SubmissionModel.is_valid.is_(True))
        result = await self._session.execute(stmt)
        return [
            SubmissionRecord(
                id=r.id, survey_schema_id=r.survey_schema_id,
                raw_responses=r.raw_responses, source_format=r.source_format,
                started_at=r.started_at, completed_at=r.completed_at,
                received_at=r.received_at, is_valid=r.is_valid,
            ) for r in result.scalars().all()
        ]

    async def get_submission(self, submission_id: UUID) -> SubmissionRecord | None:
        stmt = select(SubmissionModel).where(SubmissionModel.id == submission_id)
        result = await self._session.execute(stmt)
        r = result.scalar_one_or_none()
        if r is None:
            return None
        return SubmissionRecord(
            id=r.id, survey_schema_id=r.survey_schema_id,
            raw_responses=r.raw_responses, source_format=r.source_format,
            started_at=r.started_at, completed_at=r.completed_at,
            received_at=r.received_at, is_valid=r.is_valid,
        )

    # ── Schema Version Chain ────────────────────

    async def get_schemas_by_title(self, title: str) -> list[SurveySchemaRecord]:
        """Get all versions of a schema by title, ordered by version_id."""
        stmt = (
            select(SurveySchemaModel)
            .where(SurveySchemaModel.title == title)
            .order_by(SurveySchemaModel.version_id.asc())
        )
        result = await self._session.execute(stmt)
        return [
            SurveySchemaRecord(
                id=r.id, title=r.title, version_id=r.version_id,
                question_definitions=r.question_definitions, created_at=r.created_at,
            ) for r in result.scalars().all()
        ]

    async def get_latest_version(self, title: str) -> SurveySchemaRecord | None:
        """Get the highest version_id schema for a given title."""
        stmt = (
            select(SurveySchemaModel)
            .where(SurveySchemaModel.title == title)
            .order_by(SurveySchemaModel.version_id.desc())
            .limit(1)
        )
        result = await self._session.execute(stmt)
        r = result.scalar_one_or_none()
        if r is None:
            return None
        return SurveySchemaRecord(
            id=r.id, title=r.title, version_id=r.version_id,
            question_definitions=r.question_definitions, created_at=r.created_at,
        )

    # ── Ingestion Logs ───────────────────────────

    async def log_ingestion(
        self, survey_schema_id: UUID, records_received: int, records_valid: int, status: str
    ) -> None:
        log = IngestionLogModel(
            survey_schema_id=survey_schema_id, status=status,
            records_received=records_received, records_valid=records_valid,
        )
        self._session.add(log)
        await self._session.flush()