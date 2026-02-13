"""
Visualization Module — Public Interface.
FR-09 (Data Type Detection), FR-10 (Graph Mapping), FR-11 (Sentiment Analysis).
Stateless — owns no persistent data.
"""

import logging
from collections import Counter
from uuid import UUID

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from textblob import TextBlob

from src.shared_kernel import DataType, get_db_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/visualization", tags=["Visualization"])


# ── Chart Mapping Rules (FR-10) ──────────────────

CHART_MAP: dict[DataType, str] = {
    DataType.NOMINAL: "PIE",
    DataType.ORDINAL: "BAR",
    DataType.INTERVAL: "HISTOGRAM",
    DataType.OPEN_ENDED: "WORD_CLOUD",
}


# ── DTOs ──────────────────────────────────────────

class ChartPayload(BaseModel):
    question_id: str
    question_text: str
    data_type: str
    chart_type: str
    labels: list[str]
    values: list[float | int]
    metadata: dict = {}


class SentimentResult(BaseModel):
    text: str
    polarity: float
    subjectivity: float
    label: str


class SurveyVisualizationRequest(BaseModel):
    survey_schema_id: str
    question_id: str
    question_text: str = ""
    data_type: DataType = DataType.NOMINAL
    values: list


class SentimentRequest(BaseModel):
    texts: list[str]


# ── Service ───────────────────────────────────────

class VisualizationService:
    """Stateless service: transforms data into chart-ready payloads."""

    def get_chart_type(self, data_type: DataType) -> str:
        return CHART_MAP.get(data_type, "BAR")

    def build_chart_payload(
        self, question_id: str, question_text: str, data_type: DataType, values: list
    ) -> ChartPayload:
        chart_type = self.get_chart_type(data_type)

        if data_type in (DataType.NOMINAL, DataType.ORDINAL):
            labels, counts = self._aggregate_categorical(values)
        elif data_type == DataType.INTERVAL:
            labels, counts = self._build_histogram(values)
        elif data_type == DataType.OPEN_ENDED:
            sentiments = [self.analyze_sentiment(str(v)) for v in values if v]
            labels = ["POSITIVE", "NEUTRAL", "NEGATIVE"]
            counts = [
                sum(1 for s in sentiments if s.label == "POSITIVE"),
                sum(1 for s in sentiments if s.label == "NEUTRAL"),
                sum(1 for s in sentiments if s.label == "NEGATIVE"),
            ]
        else:
            labels, counts = self._aggregate_categorical(values)

        return ChartPayload(
            question_id=question_id, question_text=question_text,
            data_type=data_type, chart_type=chart_type,
            labels=labels, values=counts,
        )

    def analyze_sentiment(self, text: str) -> SentimentResult:
        """FR-11: Sentiment analysis on open-ended text."""
        blob = TextBlob(text)
        polarity = blob.sentiment.polarity
        subjectivity = blob.sentiment.subjectivity
        if polarity > 0.1:
            label = "POSITIVE"
        elif polarity < -0.1:
            label = "NEGATIVE"
        else:
            label = "NEUTRAL"
        return SentimentResult(
            text=text, polarity=round(polarity, 3),
            subjectivity=round(subjectivity, 3), label=label,
        )

    def build_full_dashboard(
        self, questions: list[dict], submissions: list[dict]
    ) -> list[ChartPayload]:
        """Build chart payloads for all questions in a survey."""
        charts = []
        for q in questions:
            qid = q.get("question_id", "")
            values = [sub.get(qid) for sub in submissions if sub.get(qid) is not None]
            if not values:
                continue
            data_type = DataType(q.get("data_type", "NOMINAL"))
            chart = self.build_chart_payload(qid, q.get("text", qid), data_type, values)
            charts.append(chart)
        return charts

    def _aggregate_categorical(self, values: list) -> tuple[list[str], list[int]]:
        counts = Counter(str(v) for v in values if v is not None)
        sorted_items = counts.most_common()
        return [i[0] for i in sorted_items], [i[1] for i in sorted_items]

    def _build_histogram(self, values: list, bins: int = 10) -> tuple[list[str], list[int]]:
        numeric = []
        for v in values:
            try:
                numeric.append(float(v))
            except (ValueError, TypeError):
                pass
        if not numeric:
            return [], []
        counts, edges = np.histogram(numeric, bins=bins)
        labels = [f"{edges[i]:.1f}-{edges[i+1]:.1f}" for i in range(len(counts))]
        return labels, counts.tolist()


# ── Routes ────────────────────────────────────────

@router.post("/chart")
async def build_chart(req: SurveyVisualizationRequest):
    service = VisualizationService()
    return service.build_chart_payload(
        req.question_id, req.question_text, req.data_type, req.values
    ).model_dump()


@router.post("/sentiment")
async def batch_sentiment(req: SentimentRequest):
    service = VisualizationService()
    return [service.analyze_sentiment(t).model_dump() for t in req.texts]


@router.post("/dashboard/{survey_schema_id}")
async def build_dashboard(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    """Build chart payloads for all questions in a survey."""
    from src.ingestion.interfaces.api import IngestionService
    ing = IngestionService(session)
    schema = await ing.get_survey_schema(survey_schema_id)
    if not schema:
        return {"error": "Schema not found"}
    subs = await ing.get_submissions(survey_schema_id, valid_only=True)

    service = VisualizationService()
    questions = [q.model_dump() if hasattr(q, 'model_dump') else q
                 for q in schema.question_definitions]
    raw_data = [s.raw_responses for s in subs]
    charts = service.build_full_dashboard(questions, raw_data)
    return [c.model_dump() for c in charts]