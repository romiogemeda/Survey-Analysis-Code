"""Analytics — Internal Repository. Data access for analytics-owned tables."""

import logging
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import CorrelationResultRecord, InsightRecord, InsightSeverity
from src.analytics.models.orm import (
    CorrelationResultModel, ExecutiveSummaryModel, InsightModel,
    PinnedInsightModel, ReportModel,
)

logger = logging.getLogger(__name__)


class AnalyticsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Correlations ─────────────────────────────

    async def save_correlation(self, record: CorrelationResultRecord) -> None:
        model = CorrelationResultModel(
            id=record.id,
            survey_schema_id=record.survey_schema_id,
            independent_variable=record.independent_variable,
            dependent_variable=record.dependent_variable,
            method=record.method,
            statistic_value=record.statistic_value,
            p_value=record.p_value,
            is_significant=record.is_significant,
        )
        self._session.add(model)
        await self._session.flush()

    async def get_correlations(self, survey_schema_id: UUID) -> list[CorrelationResultRecord]:
        stmt = select(CorrelationResultModel).where(
            CorrelationResultModel.survey_schema_id == survey_schema_id
        )
        result = await self._session.execute(stmt)
        return [
            CorrelationResultRecord(
                id=r.id, survey_schema_id=r.survey_schema_id,
                independent_variable=r.independent_variable,
                dependent_variable=r.dependent_variable,
                method=r.method, statistic_value=r.statistic_value,
                p_value=r.p_value, is_significant=r.is_significant,
                analyzed_at=r.analyzed_at,
            ) for r in result.scalars().all()
        ]

    async def get_significant_correlations(self, survey_schema_id: UUID) -> list[CorrelationResultRecord]:
        stmt = select(CorrelationResultModel).where(
            CorrelationResultModel.survey_schema_id == survey_schema_id,
            CorrelationResultModel.is_significant.is_(True),
        )
        result = await self._session.execute(stmt)
        return [
            CorrelationResultRecord(
                id=r.id, survey_schema_id=r.survey_schema_id,
                independent_variable=r.independent_variable,
                dependent_variable=r.dependent_variable,
                method=r.method, statistic_value=r.statistic_value,
                p_value=r.p_value, is_significant=r.is_significant,
                analyzed_at=r.analyzed_at,
            ) for r in result.scalars().all()
        ]

    # ── Insights ─────────────────────────────────

    async def save_insight(self, record: InsightRecord) -> None:
        model = InsightModel(
            id=record.id,
            survey_schema_id=record.survey_schema_id,
            correlation_result_id=record.correlation_result_id,
            insight_text=record.insight_text,
            severity=record.severity,
        )
        self._session.add(model)
        await self._session.flush()

    async def get_insights(self, survey_schema_id: UUID) -> list[InsightRecord]:
        stmt = select(InsightModel).where(
            InsightModel.survey_schema_id == survey_schema_id
        ).order_by(InsightModel.generated_at.desc())
        result = await self._session.execute(stmt)
        return [
            InsightRecord(
                id=r.id, survey_schema_id=r.survey_schema_id,
                correlation_result_id=r.correlation_result_id,
                insight_text=r.insight_text,
                severity=InsightSeverity(r.severity),
                generated_at=r.generated_at,
            ) for r in result.scalars().all()
        ]

    # ── Executive Summary ────────────────────────

    async def save_summary(
        self, survey_schema_id: UUID, summary_text: str,
        llm_model_used: str, quality_filter_applied: bool
    ) -> None:
        model = ExecutiveSummaryModel(
            survey_schema_id=survey_schema_id,
            summary_text=summary_text,
            llm_model_used=llm_model_used,
            quality_filter_applied=quality_filter_applied,
        )
        self._session.add(model)
        await self._session.flush()

    async def get_latest_summary(self, survey_schema_id: UUID) -> dict | None:
        stmt = (
            select(ExecutiveSummaryModel)
            .where(ExecutiveSummaryModel.survey_schema_id == survey_schema_id)
            .order_by(ExecutiveSummaryModel.generated_at.desc())
            .limit(1)
        )
        result = await self._session.execute(stmt)
        r = result.scalar_one_or_none()
        if r is None:
            return None
        return {
            "id": str(r.id),
            "survey_schema_id": str(r.survey_schema_id),
            "summary_text": r.summary_text,
            "llm_model_used": r.llm_model_used,
            "quality_filter_applied": r.quality_filter_applied,
            "generated_at": r.generated_at.isoformat(),
        }

    # ── Pinned Insights ──────────────────────────

    async def create_pin(
        self,
        survey_schema_id: UUID,
        source_question: str,
        content: str,
        chart_code: str | None = None,
        chart_data: list | None = None,
        chart_type: str | None = None,
        user_note: str | None = None,
    ) -> PinnedInsightModel:
        """Insert a new pinned insight and return the saved model."""
        model = PinnedInsightModel(
            survey_schema_id=survey_schema_id,
            source_question=source_question,
            content=content,
            chart_code=chart_code,
            chart_data=chart_data,
            chart_type=chart_type,
            user_note=user_note,
        )
        self._session.add(model)
        await self._session.flush()
        return model

    async def get_pins(self, survey_schema_id: UUID) -> list[PinnedInsightModel]:
        """Fetch all pinned insights for a survey, newest first."""
        stmt = select(PinnedInsightModel).where(
            PinnedInsightModel.survey_schema_id == survey_schema_id
        ).order_by(PinnedInsightModel.pinned_at.desc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def delete_pin(self, pin_id: UUID) -> bool:
        """Delete a pinned insight by its ID. Returns True if deleted, False if not found."""
        stmt = delete(PinnedInsightModel).where(PinnedInsightModel.id == pin_id)
        result = await self._session.execute(stmt)
        await self._session.flush()
        return result.rowcount > 0

    async def update_pin_note(self, pin_id: UUID, user_note: str | None) -> PinnedInsightModel | None:
        """Update the user_note field of a pinned insight."""
        stmt = select(PinnedInsightModel).where(PinnedInsightModel.id == pin_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if not model:
            return None
        model.user_note = user_note
        await self._session.flush()
        return model

    # ── Reports ──────────────────────────────────

    async def create_report(
        self,
        survey_schema_id: UUID,
        title: str,
        sections: dict,
        source_data: dict,
        chart_images: dict,
    ) -> ReportModel:
        """Insert a new report and return the saved model."""
        model = ReportModel(
            survey_schema_id=survey_schema_id,
            title=title,
            sections=sections,
            source_data=source_data,
            chart_images=chart_images,
        )
        self._session.add(model)
        await self._session.flush()
        return model

    async def get_report(self, report_id: UUID) -> ReportModel | None:
        """Fetch a single report by its primary key."""
        stmt = select(ReportModel).where(ReportModel.id == report_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_latest_report(self, survey_schema_id: UUID) -> ReportModel | None:
        """Fetch the most recent report for a survey (ordered by generated_at DESC)."""
        stmt = (
            select(ReportModel)
            .where(ReportModel.survey_schema_id == survey_schema_id)
            .order_by(ReportModel.generated_at.desc())
            .limit(1)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_report_section(
        self,
        report_id: UUID,
        section_key: str,
        content: str,
    ) -> ReportModel | None:
        """Update a single section's content. Also updates updated_at timestamp."""
        stmt = select(ReportModel).where(ReportModel.id == report_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if not model:
            return None
        updated_sections = dict(model.sections)
        updated_sections[section_key] = content
        model.sections = updated_sections
        model.updated_at = datetime.now(timezone.utc)
        await self._session.flush()
        return model

    async def update_report_chart_images(
        self,
        report_id: UUID,
        chart_images: dict,
    ) -> ReportModel | None:
        """Replace the chart_images dict on a report."""
        stmt = select(ReportModel).where(ReportModel.id == report_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if not model:
            return None
        model.chart_images = chart_images
        model.updated_at = datetime.now(timezone.utc)
        await self._session.flush()
        return model

    async def delete_report(self, report_id: UUID) -> bool:
        """Delete a report by its ID. Returns True if deleted, False if not found."""
        stmt = delete(ReportModel).where(ReportModel.id == report_id)
        result = await self._session.execute(stmt)
        await self._session.flush()
        return result.rowcount > 0