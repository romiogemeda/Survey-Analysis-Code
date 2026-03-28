"""Shared Kernel — Public API. The ONLY import path other modules should use."""

from src.shared_kernel.database import (
    Base, get_db_session, async_session_factory, create_all_tables, drop_all_tables, engine,
)
from src.shared_kernel.domain_types import (
    ChatRole, ChatSessionType, CorrelationMethod, CorrelationResultRecord,
    DataType, IngestionStatus, InsightRecord, InsightSeverity, PersonaType,
    QualityGrade, QualityScoreRecord, QuestionDefinition, SourceFormat,
    SubmissionRecord, SurveySchemaRecord, utcnow,
)
from src.shared_kernel.llm_gateway import LLMGateway, LLMRequest, LLMResponse, llm_gateway

__all__ = [
    "Base", "get_db_session", "async_session_factory", "create_all_tables",
    "drop_all_tables", "engine",
    "ChatRole", "ChatSessionType", "CorrelationMethod", "CorrelationResultRecord",
    "DataType", "IngestionStatus", "InsightRecord", "InsightSeverity",
    "PersonaType", "QualityGrade", "QualityScoreRecord", "QuestionDefinition",
    "SourceFormat", "SubmissionRecord", "SurveySchemaRecord", "utcnow",
    "LLMGateway", "LLMRequest", "LLMResponse", "llm_gateway",
]