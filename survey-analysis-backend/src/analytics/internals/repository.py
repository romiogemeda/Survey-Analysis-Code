"""Analytics — Internal Repository. Data access for analytics-owned tables."""

import logging
from uuid import UUID
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import CorrelationResultRecord, InsightRecord, InsightSeverity
from src.analytics.models.orm import (
    CorrelationResultModel, ExecutiveSummaryModel, InsightModel, PinnedAnalysisItemModel
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

    # ── Pinned Items ─────────────────────────────

    async def save_pinned_item(
        self, survey_schema_id: UUID, item_type: str, content_json: dict, display_order: int = 0
    ) -> PinnedAnalysisItemModel:
        model = PinnedAnalysisItemModel(
            survey_schema_id=survey_schema_id,
            item_type=item_type,
            content_json=content_json,
            display_order=display_order,
        )
        self._session.add(model)
        await self._session.flush()
        return model

    async def get_pinned_items(self, survey_schema_id: UUID) -> list[PinnedAnalysisItemModel]:
        stmt = select(PinnedAnalysisItemModel).where(
            PinnedAnalysisItemModel.survey_schema_id == survey_schema_id
        ).order_by(PinnedAnalysisItemModel.display_order.asc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def delete_pinned_item(self, item_id: UUID) -> None:
        stmt = delete(PinnedAnalysisItemModel).where(PinnedAnalysisItemModel.id == item_id)
        await self._session.execute(stmt)
        await self._session.flush()