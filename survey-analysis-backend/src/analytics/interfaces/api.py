"""
Analytics Module — Public Interface.
FR-06 (Correlation), FR-07 (Insights), FR-08 (Executive Summary).
"""

import logging
from itertools import combinations
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import (
    CorrelationResultRecord, InsightRecord, InsightSeverity,
    LLMRequest, get_db_session, llm_gateway,
)
from src.analytics.internals.correlation_engine import CorrelationEngine
from src.analytics.internals.repository import AnalyticsRepository
from src.analytics.internals.findings_generator import (
    generate_findings, generate_findings_summary_for_llm,
)
from src.analytics.internals.descriptive_stats import generate_descriptive_stats
from src.analytics.internals.quality_summary import generate_quality_summary

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics"])


class AnalyticsService:
    """Public analytics service. Called by other modules and routes."""

    def __init__(self, session: AsyncSession) -> None:
        self._db = session
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

    async def analyze_full(self, survey_schema_id: UUID) -> dict:
        """
        Single-action analysis: run correlations → generate findings → produce summary.
        Returns everything a non-technical user needs in one response.
        """
        from src.ingestion.interfaces.api import IngestionService
        ing = IngestionService(self._db)

        subs = await ing.get_submissions(survey_schema_id, valid_only=True)
        raw_data = [s.raw_responses for s in subs]
        schema = await ing.get_survey_schema(survey_schema_id)

        if not raw_data:
            return {
                "survey_schema_id": str(survey_schema_id),
                "summary": "No survey responses found. Upload data first to run analysis.",
                "findings": [],
                "descriptive_stats": [],
                "quality_summary": {
                    "scored": False,
                    "message": "No submissions found to analyze quality."
                },
                "pinned_insights": [],
                "stats": {
                    "total_responses": 0,
                    "pairs_analyzed": 0,
                    "significant_findings": 0,
                },
            }

        # Step 1: Run correlations
        correlations = await self.run_correlation_analysis(survey_schema_id, raw_data)

        # Step 2: Generate plain-language findings
        findings = await generate_findings(correlations)

        # Step 3: Compute descriptive stats and quality summary
        descriptive_stats = generate_descriptive_stats(
            raw_data,
            schema.question_definitions if schema else []
        )
        quality_summary = await generate_quality_summary(survey_schema_id, self._db)

        # Step 3.5: Fetch Pinned Insights
        pins = await self._repo.get_pins(survey_schema_id)
        pinned_insights = [
            {
                'id': str(p.id),
                'source_question': p.source_question,
                'content': p.content,
                'chart_code': p.chart_code,
                'chart_data': p.chart_data,
                'chart_type': p.chart_type,
                'user_note': p.user_note,
                'pinned_at': p.pinned_at.isoformat(),
            }
            for p in pins
        ]

        # Step 4: Generate executive summary using plain-language findings
        findings_text = generate_findings_summary_for_llm(findings)
        prompt = (
            f"Survey has {len(raw_data)} responses.\n\n"
            f"Key findings:\n{findings_text}\n\n"
            f"Response fields: {list(raw_data[0].keys()) if raw_data else 'N/A'}\n\n"
            "Write a clear, non-technical executive summary (3-5 paragraphs). "
            "Explain the findings in plain language. Avoid statistical jargon like "
            "p-values, correlation coefficients, or significance levels. "
            "Focus on what the patterns mean and what actions could be taken."
        )

        summary_response = await llm_gateway.complete(LLMRequest(
            system_prompt=(
                "You are a senior analyst writing for non-technical readers. "
                "Write a clear executive summary covering key patterns, their meaning, "
                "and practical recommendations. Use simple language."
            ),
            user_prompt=prompt,
        ))

        significant_count = sum(1 for c in correlations if c.is_significant)

        return {
            "survey_schema_id": str(survey_schema_id),
            "summary": summary_response.content,
            "findings": findings,
            "descriptive_stats": descriptive_stats,
            "quality_summary": quality_summary,
            "pinned_insights": pinned_insights,
            "stats": {
                "total_responses": len(raw_data),
                "pairs_analyzed": len(correlations),
                "significant_findings": significant_count,
            },
        }


# ── Routes ────────────────────────────────────────

@router.post("/analyze/{survey_schema_id}")
async def analyze_survey(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    """Single-action analysis for non-technical users.
    Runs correlations, generates plain-language findings, produces executive summary."""
    service = AnalyticsService(session)
    return await service.analyze_full(survey_schema_id)


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


# ── Pinned Insights ───────────────────────────────

class CreatePinRequest(BaseModel):
    survey_schema_id: UUID
    source_question: str
    content: str
    chart_code: str | None = None
    chart_data: list | None = None
    chart_type: str | None = None
    user_note: str | None = None

class PinResponse(BaseModel):
    id: UUID
    survey_schema_id: UUID
    source_question: str
    content: str
    chart_code: str | None
    chart_data: list | None
    chart_type: str | None
    user_note: str | None
    pinned_at: datetime

    model_config = {"from_attributes": True}

class UpdatePinNoteRequest(BaseModel):
    user_note: str | None

@router.post("/pins", response_model=PinResponse)
async def create_pin(
    request: CreatePinRequest, session: AsyncSession = Depends(get_db_session)
):
    repo = AnalyticsRepository(session)
    return await repo.create_pin(
        survey_schema_id=request.survey_schema_id,
        source_question=request.source_question,
        content=request.content,
        chart_code=request.chart_code,
        chart_data=request.chart_data,
        chart_type=request.chart_type,
        user_note=request.user_note,
    )

@router.get("/pins/{survey_schema_id}", response_model=list[PinResponse])
async def get_pins(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    repo = AnalyticsRepository(session)
    return await repo.get_pins(survey_schema_id)

@router.delete("/pins/{pin_id}")
async def delete_pin(
    pin_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    repo = AnalyticsRepository(session)
    deleted = await repo.delete_pin(pin_id)
    if not deleted:
        raise HTTPException(404, "Pin not found")
    return {"deleted": True, "id": str(pin_id)}

@router.patch("/pins/{pin_id}/note", response_model=PinResponse)
async def update_pin_note(
    pin_id: UUID, request: UpdatePinNoteRequest, session: AsyncSession = Depends(get_db_session)
):
    repo = AnalyticsRepository(session)
    updated = await repo.update_pin_note(pin_id, request.user_note)
    if not updated:
        raise HTTPException(404, "Pin not found")
    return updated