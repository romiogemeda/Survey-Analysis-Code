"""
Analytics Module — Public Interface.
FR-06 (Correlation), FR-07 (Insights), FR-08 (Executive Summary).
"""

import logging
from itertools import combinations
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import (
    CorrelationResultRecord, InsightRecord, InsightSeverity,
    LLMRequest, get_db_session, llm_gateway,
)
from src.analytics.internals.correlation_engine import CorrelationEngine
from src.analytics.internals.repository import AnalyticsRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


class AnalyticsService:
    """Public analytics service. Called by other modules and routes."""

    def __init__(self, session: AsyncSession) -> None:
        self._repo = AnalyticsRepository(session)
        self._engine = CorrelationEngine()

    async def run_correlation_analysis(
        self, survey_schema_id: UUID, submissions: list[dict]
    ) -> list[CorrelationResultRecord]:
        """
        FR-06: Run pairwise correlation analysis on all question variables.
        Takes a list of raw_responses dicts.
        """
        if len(submissions) < 3:
            logger.warning("Not enough submissions for analysis (%d)", len(submissions))
            return []

        # Collect all question keys from submissions
        all_keys: set[str] = set()
        for sub in submissions:
            all_keys.update(sub.keys())
        keys = sorted(all_keys)

        if len(keys) < 2:
            return []

        results: list[CorrelationResultRecord] = []
        for var_a, var_b in combinations(keys, 2):
            # Extract paired values (skip if either is missing)
            x_vals, y_vals = [], []
            for sub in submissions:
                if var_a in sub and var_b in sub and sub[var_a] is not None and sub[var_b] is not None:
                    x_vals.append(sub[var_a])
                    y_vals.append(sub[var_b])

            if len(x_vals) < 3:
                continue

            # Detect types: if all values are numeric → INTERVAL, else NOMINAL
            x_type = self._detect_type(x_vals)
            y_type = self._detect_type(y_vals)

            analysis = self._engine.analyze_pair(x_vals, y_vals, x_type, y_type)
            if analysis.get("method") is None:
                continue

            record = CorrelationResultRecord(
                survey_schema_id=survey_schema_id,
                independent_variable=var_a,
                dependent_variable=var_b,
                method=analysis["method"],
                statistic_value=analysis["statistic_value"],
                p_value=analysis["p_value"],
                is_significant=analysis["is_significant"],
            )
            await self._repo.save_correlation(record)
            results.append(record)

            # FR-07: Auto-generate insight for significant correlations
            if record.is_significant:
                insight = InsightRecord(
                    survey_schema_id=survey_schema_id,
                    correlation_result_id=record.id,
                    insight_text=(
                        f"Significant {record.method} correlation found between "
                        f"'{var_a}' and '{var_b}' "
                        f"(statistic={record.statistic_value}, p={record.p_value})"
                    ),
                    severity=InsightSeverity.HIGH if record.p_value < 0.01 else InsightSeverity.MEDIUM,
                )
                await self._repo.save_insight(insight)

        logger.info(
            "Correlation analysis complete: %d pairs, %d significant",
            len(results), sum(1 for r in results if r.is_significant),
        )
        return results

    async def get_correlations(self, survey_schema_id: UUID) -> list[CorrelationResultRecord]:
        return await self._repo.get_correlations(survey_schema_id)

    async def get_insights(self, survey_schema_id: UUID) -> list[InsightRecord]:
        return await self._repo.get_insights(survey_schema_id)

    async def generate_executive_summary(
        self, survey_schema_id: UUID, submissions: list[dict],
        insights: list[InsightRecord], quality_filter_applied: bool = False,
    ) -> dict:
        """FR-08: LLM-powered executive summary."""
        insight_text = "\n".join(f"- {i.insight_text}" for i in insights) or "No significant insights found."
        prompt = (
            f"Survey has {len(submissions)} responses. "
            f"Quality filter applied: {quality_filter_applied}.\n\n"
            f"Key insights:\n{insight_text}\n\n"
            f"Sample response keys: {list(submissions[0].keys()) if submissions else 'N/A'}\n\n"
            "Generate a concise executive summary with actionable recommendations."
        )

        response = await llm_gateway.complete(LLMRequest(
            system_prompt=(
                "You are a senior survey analyst. Write a concise executive summary "
                "(3-5 paragraphs) covering response quality, key patterns, significant "
                "correlations, and recommendations."
            ),
            user_prompt=prompt,
        ))

        await self._repo.save_summary(
            survey_schema_id, response.content,
            response.model_used, quality_filter_applied,
        )

        return {
            "survey_schema_id": str(survey_schema_id),
            "summary_text": response.content,
            "llm_model_used": response.model_used,
            "quality_filter_applied": quality_filter_applied,
        }

    async def get_latest_summary(self, survey_schema_id: UUID) -> dict | None:
        return await self._repo.get_latest_summary(survey_schema_id)

    def _detect_type(self, values: list) -> str:
        """Simple type detection: numeric → INTERVAL, else NOMINAL."""
        numeric_count = 0
        for v in values:
            try:
                float(v)
                numeric_count += 1
            except (ValueError, TypeError):
                pass
        return "INTERVAL" if numeric_count / len(values) > 0.8 else "NOMINAL"


# ── Routes ────────────────────────────────────────

@router.post("/correlations/{survey_schema_id}")
async def run_correlations(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    """Trigger correlation analysis on all submissions for a survey."""
    from src.ingestion.interfaces.api import IngestionService
    ing = IngestionService(session)
    subs = await ing.get_submissions(survey_schema_id, valid_only=True)
    raw_data = [s.raw_responses for s in subs]

    service = AnalyticsService(session)
    results = await service.run_correlation_analysis(survey_schema_id, raw_data)
    return {
        "total_pairs_analyzed": len(results),
        "significant": sum(1 for r in results if r.is_significant),
        "results": [r.model_dump(mode="json") for r in results],
    }


@router.get("/correlations/{survey_schema_id}")
async def get_correlations(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = AnalyticsService(session)
    results = await service.get_correlations(survey_schema_id)
    return [r.model_dump(mode="json") for r in results]


@router.get("/insights/{survey_schema_id}")
async def get_insights(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = AnalyticsService(session)
    insights = await service.get_insights(survey_schema_id)
    return [i.model_dump(mode="json") for i in insights]


@router.post("/summary/{survey_schema_id}")
async def generate_summary(
    survey_schema_id: UUID,
    quality_filter: bool = Query(default=False),
    session: AsyncSession = Depends(get_db_session),
):
    """Generate an AI executive summary."""
    from src.ingestion.interfaces.api import IngestionService
    ing = IngestionService(session)
    subs = await ing.get_submissions(survey_schema_id, valid_only=True)

    service = AnalyticsService(session)
    insights = await service.get_insights(survey_schema_id)
    return await service.generate_executive_summary(
        survey_schema_id, [s.raw_responses for s in subs], insights, quality_filter
    )


@router.get("/summary/{survey_schema_id}")
async def get_summary(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = AnalyticsService(session)
    summary = await service.get_latest_summary(survey_schema_id)
    if not summary:
        raise HTTPException(404, "No summary found. Generate one first via POST.")
    return summary