import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column
from src.shared_kernel import Base


class PersonaModel(Base):
    __tablename__ = "personas"
    __table_args__ = {"schema": "simulation"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    description_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_parameters: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class SimulatedResponseModel(Base):
    __tablename__ = "simulated_responses"
    __table_args__ = {"schema": "simulation"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_schema_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    persona_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    synthetic_answers: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    llm_model_used: Mapped[str] = mapped_column(String(100), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )