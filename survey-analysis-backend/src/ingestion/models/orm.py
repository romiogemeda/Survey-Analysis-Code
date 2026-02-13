"""Ingestion Module — ORM Models. Schema: ingestion."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column
from src.shared_kernel import Base


class SurveySchemaModel(Base):
    __tablename__ = "survey_schemas"
    __table_args__ = {"schema": "ingestion"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    version_id: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    question_definitions: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class SubmissionModel(Base):
    __tablename__ = "submissions"
    __table_args__ = {"schema": "ingestion"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_schema_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    raw_responses: Mapped[dict] = mapped_column(JSON, nullable=False)
    source_format: Mapped[str] = mapped_column(String(10), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)


class IngestionLogModel(Base):
    __tablename__ = "ingestion_logs"
    __table_args__ = {"schema": "ingestion"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_schema_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    records_received: Mapped[int] = mapped_column(Integer, nullable=False)
    records_valid: Mapped[int] = mapped_column(Integer, nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )