"""Quality Module — ORM Models. Schema: quality."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from src.shared_kernel import Base


class QualityScoreModel(Base):
    __tablename__ = "quality_scores"
    __table_args__ = {"schema": "quality"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    grade: Mapped[str] = mapped_column(String(10), nullable=False)
    speed_score: Mapped[float] = mapped_column(Float, nullable=False)
    variance_score: Mapped[float] = mapped_column(Float, nullable=False)
    gibberish_score: Mapped[float] = mapped_column(Float, nullable=False)
    composite_score: Mapped[float] = mapped_column(Float, nullable=False)
    scored_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
