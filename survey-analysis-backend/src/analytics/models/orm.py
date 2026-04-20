import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from src.shared_kernel import Base


class CorrelationResultModel(Base):
    __tablename__ = "correlation_results"
    __table_args__ = {"schema": "analytics"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_schema_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    independent_variable: Mapped[str] = mapped_column(String(255), nullable=False)
    dependent_variable: Mapped[str] = mapped_column(String(255), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    statistic_value: Mapped[float] = mapped_column(Float, nullable=False)
    p_value: Mapped[float] = mapped_column(Float, nullable=False)
    is_significant: Mapped[bool] = mapped_column(Boolean, default=False)
    analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class InsightModel(Base):
    __tablename__ = "insights"
    __table_args__ = {"schema": "analytics"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_schema_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    correlation_result_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    insight_text: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ExecutiveSummaryModel(Base):
    __tablename__ = "executive_summaries"
    __table_args__ = {"schema": "analytics"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_schema_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    llm_model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    quality_filter_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class PinnedInsightModel(Base):
    __tablename__ = 'pinned_insights'
    __table_args__ = {'schema': 'analytics'}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_schema_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    # The user's question that generated this response
    source_question: Mapped[str] = mapped_column(Text, nullable=False)

    # The assistant's text content (always present)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Optional chart data — preserved verbatim from the chat response
    chart_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    chart_data: Mapped[list | None] = mapped_column(JSON, nullable=True)
    chart_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # User-provided note (optional, for Phase 6 — users can annotate pins)
    user_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    pinned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class ReportModel(Base):
    __tablename__ = 'reports'
    __table_args__ = {'schema': 'analytics'}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_schema_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)

    # Section contents stored as JSON: {section_key: markdown_string}
    # Keys: title_page, executive_summary, methodology, key_findings,
    #       descriptive_statistics, quality_assessment, pinned_insights,
    #       recommendations, conclusion
    sections: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Snapshot of the analysis data used to generate this report (for regeneration)
    source_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Chart images captured as base64 data URLs, keyed by pin ID or finding ID
    chart_images: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default='DRAFT')
    # Values: DRAFT, FINALIZED

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )