"""
Shared Kernel — Domain Types.
Canonical types shared across ALL modules. Changes here MUST be backward-compatible.
"""

from datetime import datetime, timezone
from enum import StrEnum
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Enums ─────────────────────────────────────────────

class QualityGrade(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class DataType(StrEnum):
    NOMINAL = "NOMINAL"
    ORDINAL = "ORDINAL"
    INTERVAL = "INTERVAL"
    OPEN_ENDED = "OPEN_ENDED"
    IDENTIFIER = "IDENTIFIER"
    BOOLEAN = "BOOLEAN"
    DATETIME = "DATETIME"
    MULTI_SELECT = "MULTI_SELECT"


class CorrelationMethod(StrEnum):
    CHI_SQUARE = "CHI_SQUARE"
    PEARSON = "PEARSON"
    SPEARMAN = "SPEARMAN"


class InsightSeverity(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class IngestionStatus(StrEnum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    PARTIAL = "PARTIAL"


class SourceFormat(StrEnum):
    JSON = "JSON"
    CSV = "CSV"


class PersonaType(StrEnum):
    PREDEFINED = "PREDEFINED"
    CUSTOM = "CUSTOM"
    EXTRACTED = "EXTRACTED"


class JobStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ChatSessionType(StrEnum):
    DATA_QUERY = "DATA_QUERY"
    PERSONA_INTERVIEW = "PERSONA_INTERVIEW"


class ChatRole(StrEnum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"


# ── Value Objects ────────────────────────────────────

class QuestionDefinition(BaseModel):
    question_id: str
    text: str
    data_type: DataType
    options: list[str] | None = None
    is_required: bool = True


# ── Canonical Records ────────────────────────────────

class SurveySchemaRecord(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    title: str
    version_id: int = 1
    question_definitions: list[QuestionDefinition] = []
    created_at: datetime = Field(default_factory=utcnow)


class SubmissionRecord(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    survey_schema_id: UUID
    raw_responses: dict
    source_format: SourceFormat
    started_at: datetime | None = None
    completed_at: datetime | None = None
    received_at: datetime = Field(default_factory=utcnow)
    is_valid: bool = True


class QualityScoreRecord(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    submission_id: UUID
    grade: QualityGrade
    speed_score: float
    variance_score: float
    gibberish_score: float
    composite_score: float
    scored_at: datetime = Field(default_factory=utcnow)


class CorrelationResultRecord(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    survey_schema_id: UUID
    independent_variable: str
    dependent_variable: str
    method: CorrelationMethod
    statistic_value: float
    p_value: float
    is_significant: bool
    analyzed_at: datetime = Field(default_factory=utcnow)


class InsightRecord(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    survey_schema_id: UUID
    correlation_result_id: UUID | None = None
    insight_text: str
    severity: InsightSeverity
    generated_at: datetime = Field(default_factory=utcnow)