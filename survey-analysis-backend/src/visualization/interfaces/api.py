"""
Visualization Module — Public Interface.
FR-09 (Data Type Detection), FR-10 (Graph Mapping), FR-11 (Sentiment Analysis).
Stateless — owns no persistent data.

Chart type selection is data-driven:
- NOMINAL  → DONUT (≤6 categories) or H_BAR (7+, top 10 + Other)
- ORDINAL  → LIKERT_BAR (Likert scale detected) or BAR (general)
- INTERVAL → HISTOGRAM (>20 pts) or BOX_PLOT (≤20 pts), with summary stats
- OPEN_ENDED → SENTIMENT_DONUT + WORD_FREQ_BAR (two charts per question)
- BOOLEAN  → DONUT (two-segment)
- IDENTIFIER → skipped (no chart)
- DATETIME → skipped (no chart)
"""

import logging
import re
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


# ── Stopwords for word frequency ─────────────────

STOPWORDS = frozenset(
    "a about above after again against all am an and any are aren't as at be because "
    "been before being below between both but by can't cannot could couldn't did didn't "
    "do does doesn't doing don't down during each few for from further get got had hadn't "
    "has hasn't have haven't having he her here hers herself him himself his how i i'm if "
    "in into is isn't it it's its itself just let's me more most mustn't my myself no nor "
    "not of off on once only or other ought our ours ourselves out over own really same "
    "shan't she should shouldn't so some such than that the their theirs them themselves "
    "then there these they this those through to too under until up upon us very was wasn't "
    "we were weren't what when where which while who whom why will with won't would "
    "wouldn't yes yet you your yours yourself yourselves also been being could did does "
    "doing done each even every few go goes going gone got gotten had has have having "
    "here how i'll i've just know let like look make many might much must need new now "
    "one only or other our out over own part put quite rather really right said say see "
    "seem she since so some still such take tell than that the them then there things think "
    "this those time to two us use very want way we well what when where which while who "
    "will with work would year".split()
)


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

    # ── Public API ──

    def build_chart_payloads(
        self, question_id: str, question_text: str, data_type: DataType, values: list
    ) -> list[ChartPayload]:
        """
        Build one or more chart payloads for a single question.
        Returns a list because OPEN_ENDED produces two charts.
        Returns empty list for non-chartable types.
        """
        if data_type in (DataType.IDENTIFIER, DataType.DATETIME):
            return []

        if data_type == DataType.BOOLEAN:
            return [self._build_boolean(question_id, question_text, values)]

        if data_type == DataType.NOMINAL:
            return [self._build_nominal(question_id, question_text, values)]

        if data_type == DataType.ORDINAL:
            return [self._build_ordinal(question_id, question_text, values)]

        if data_type == DataType.INTERVAL:
            return [self._build_interval(question_id, question_text, values)]

        if data_type == DataType.OPEN_ENDED:
            return self._build_open_ended(question_id, question_text, values)

        # Fallback: treat as nominal
        return [self._build_nominal(question_id, question_text, values)]

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
        charts: list[ChartPayload] = []
        for q in questions:
            qid = q.get("question_id", "")
            values = [sub.get(qid) for sub in submissions if sub.get(qid) is not None]
            if not values:
                continue
            data_type = DataType(q.get("data_type", "NOMINAL"))
            payloads = self.build_chart_payloads(qid, q.get("text", qid), data_type, values)
            charts.extend(payloads)
        return charts

    # ── BOOLEAN ──

    def _build_boolean(
        self, qid: str, text: str, values: list
    ) -> ChartPayload:
        labels, counts = self._aggregate_categorical(values)
        return ChartPayload(
            question_id=qid, question_text=text,
            data_type="BOOLEAN", chart_type="DONUT",
            labels=labels, values=counts,
        )

    # ── NOMINAL ──

    def _build_nominal(
        self, qid: str, text: str, values: list
    ) -> ChartPayload:
        labels, counts = self._aggregate_categorical(values)
        n_distinct = len(labels)

        if n_distinct <= 6:
            return ChartPayload(
                question_id=qid, question_text=text,
                data_type="NOMINAL", chart_type="DONUT",
                labels=labels, values=counts,
            )
        else:
            # Top 10 + "Other"
            top_labels = labels[:10]
            top_counts = counts[:10]
            other_count = sum(counts[10:])
            if other_count > 0:
                top_labels.append("Other")
                top_counts.append(other_count)
            return ChartPayload(
                question_id=qid, question_text=text,
                data_type="NOMINAL", chart_type="H_BAR",
                labels=top_labels, values=top_counts,
                metadata={"total_categories": n_distinct},
            )

    # ── ORDINAL ──

    def _build_ordinal(
        self, qid: str, text: str, values: list
    ) -> ChartPayload:
        labels, counts = self._aggregate_categorical(values)

        # Detect Likert scale: all values are integers within a small sequential range
        is_likert = False
        try:
            int_vals = [int(v) for v in values]
            min_v, max_v = min(int_vals), max(int_vals)
            span = max_v - min_v + 1
            if span <= 10 and min_v >= 0:
                is_likert = True
                # Re-sort labels numerically for Likert
                label_count = dict(zip(labels, counts))
                labels = [str(i) for i in range(min_v, max_v + 1)]
                counts = [label_count.get(str(i), 0) for i in range(min_v, max_v + 1)]
        except (ValueError, TypeError):
            pass

        chart_type = "LIKERT_BAR" if is_likert else "BAR"
        metadata = {}
        if is_likert:
            metadata["scale_min"] = min_v
            metadata["scale_max"] = max_v

        return ChartPayload(
            question_id=qid, question_text=text,
            data_type="ORDINAL", chart_type=chart_type,
            labels=labels, values=counts,
            metadata=metadata,
        )

    # ── INTERVAL ──

    def _build_interval(
        self, qid: str, text: str, values: list
    ) -> ChartPayload:
        numeric = []
        for v in values:
            try:
                numeric.append(float(v))
            except (ValueError, TypeError):
                pass

        if not numeric:
            return ChartPayload(
                question_id=qid, question_text=text,
                data_type="INTERVAL", chart_type="BAR",
                labels=[], values=[],
            )

        arr = np.array(numeric)
        stats = {
            "mean": round(float(np.mean(arr)), 2),
            "median": round(float(np.median(arr)), 2),
            "std_dev": round(float(np.std(arr)), 2),
            "min": round(float(np.min(arr)), 2),
            "max": round(float(np.max(arr)), 2),
            "count": len(numeric),
        }

        if len(numeric) > 20:
            # Histogram
            bin_count = min(10, max(5, len(numeric) // 5))
            hist_counts, edges = np.histogram(numeric, bins=bin_count)
            labels = [f"{edges[i]:.1f}–{edges[i+1]:.1f}" for i in range(len(hist_counts))]
            return ChartPayload(
                question_id=qid, question_text=text,
                data_type="INTERVAL", chart_type="HISTOGRAM",
                labels=labels, values=hist_counts.tolist(),
                metadata=stats,
            )
        else:
            # Box plot: [min, Q1, median, Q3, max]
            q1 = round(float(np.percentile(arr, 25)), 2)
            q3 = round(float(np.percentile(arr, 75)), 2)
            box_values = [stats["min"], q1, stats["median"], q3, stats["max"]]
            return ChartPayload(
                question_id=qid, question_text=text,
                data_type="INTERVAL", chart_type="BOX_PLOT",
                labels=["Min", "Q1", "Median", "Q3", "Max"],
                values=box_values,
                metadata=stats,
            )

    # ── OPEN_ENDED (produces two charts) ──

    def _build_open_ended(
        self, qid: str, text: str, values: list
    ) -> list[ChartPayload]:
        charts: list[ChartPayload] = []
        str_values = [str(v).strip() for v in values if v]

        if not str_values:
            return charts

        # 1) Sentiment donut
        sentiments = [self.analyze_sentiment(v) for v in str_values]
        pos = sum(1 for s in sentiments if s.label == "POSITIVE")
        neu = sum(1 for s in sentiments if s.label == "NEUTRAL")
        neg = sum(1 for s in sentiments if s.label == "NEGATIVE")
        total = pos + neu + neg
        avg_polarity = round(
            sum(s.polarity for s in sentiments) / max(1, total), 3
        )

        charts.append(ChartPayload(
            question_id=f"{qid}__sentiment",
            question_text=f"{text} — Sentiment",
            data_type="OPEN_ENDED", chart_type="SENTIMENT_DONUT",
            labels=["Positive", "Neutral", "Negative"],
            values=[
                round(pos / max(1, total) * 100, 1),
                round(neu / max(1, total) * 100, 1),
                round(neg / max(1, total) * 100, 1),
            ],
            metadata={
                "avg_polarity": avg_polarity,
                "counts": {"positive": pos, "neutral": neu, "negative": neg},
                "total": total,
            },
        ))

        # 2) Word frequency bar
        words: list[str] = []
        for v in str_values:
            tokens = re.findall(r"[a-zA-Z]{2,}", v.lower())
            words.extend(t for t in tokens if t not in STOPWORDS)

        if words:
            freq = Counter(words).most_common(15)
            w_labels = [w for w, _ in freq]
            w_counts = [c for _, c in freq]
            charts.append(ChartPayload(
                question_id=f"{qid}__words",
                question_text=f"{text} — Top Words",
                data_type="OPEN_ENDED", chart_type="WORD_FREQ_BAR",
                labels=w_labels, values=w_counts,
                metadata={"total_words": len(words), "unique_words": len(set(words))},
            ))

        return charts

    # ── Helpers ──

    def _aggregate_categorical(self, values: list) -> tuple[list[str], list[int]]:
        counts = Counter(str(v) for v in values if v is not None)
        sorted_items = counts.most_common()
        return [i[0] for i in sorted_items], [i[1] for i in sorted_items]


# ── Routes ────────────────────────────────────────

@router.post("/chart")
async def build_chart(req: SurveyVisualizationRequest):
    service = VisualizationService()
    payloads = service.build_chart_payloads(
        req.question_id, req.question_text, req.data_type, req.values
    )
    return [p.model_dump() for p in payloads]


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