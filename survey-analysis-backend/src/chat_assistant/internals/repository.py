"""Chat Assistant — Internal Repository. Data access for chat-owned tables."""

import logging
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.chat_assistant.models.orm import ChatMessageModel, ChatSessionModel

logger = logging.getLogger(__name__)


class ChatRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_session(
        self, survey_schema_id: UUID, session_type: str,
        persona_id: UUID | None = None,
        active_filters: dict | None = None,
    ) -> ChatSessionModel:
        model = ChatSessionModel(
            survey_schema_id=survey_schema_id,
            session_type=session_type,
            active_persona_id=persona_id,
            active_filters_snapshot=active_filters or {},
        )
        self._session.add(model)
        await self._session.flush()
        return model

    async def get_session(self, session_id: UUID) -> ChatSessionModel | None:
        stmt = select(ChatSessionModel).where(ChatSessionModel.id == session_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def add_message(
        self, session_id: UUID, role: str, content: str,
        executed_query: dict | None = None,
        result_snapshot: dict | None = None,
    ) -> ChatMessageModel:
        model = ChatMessageModel(
            chat_session_id=session_id,
            role=role, content=content,
            executed_query=executed_query,
            result_snapshot=result_snapshot,
        )
        self._session.add(model)
        await self._session.flush()
        return model

    async def get_messages(self, session_id: UUID) -> list[ChatMessageModel]:
        stmt = (
            select(ChatMessageModel)
            .where(ChatMessageModel.chat_session_id == session_id)
            .order_by(ChatMessageModel.sent_at.asc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())