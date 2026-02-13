"""
Chat Assistant Module — Public Interface.
FR-20 (NL Querying), FR-21 (Dynamic Query), FR-22 (Context), FR-23 (Persona Interview).
"""

import json
import logging
from collections import Counter
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import (
    ChatRole, ChatSessionType, LLMRequest,
    get_db_session, llm_gateway,
)
from src.chat_assistant.internals.query_translator import QueryTranslator
from src.chat_assistant.internals.repository import ChatRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/chat", tags=["Chat Assistant"])


# ── DTOs ──────────────────────────────────────────

class StartSessionRequest(BaseModel):
    survey_schema_id: UUID
    session_type: ChatSessionType = ChatSessionType.DATA_QUERY
    persona_id: UUID | None = None


class SendMessageRequest(BaseModel):
    session_id: UUID
    content: str


class MessageResponse(BaseModel):
    role: str
    content: str
    executed_query: dict | None = None
    result_snapshot: dict | None = None


# ── Service ───────────────────────────────────────

class ChatAssistantService:
    def __init__(self, session: AsyncSession) -> None:
        self._db = session
        self._repo = ChatRepository(session)
        self._translator = QueryTranslator()

    async def start_session(self, req: StartSessionRequest) -> dict:
        model = await self._repo.create_session(
            survey_schema_id=req.survey_schema_id,
            session_type=req.session_type,
            persona_id=req.persona_id,
        )
        return {
            "session_id": str(model.id),
            "survey_schema_id": str(model.survey_schema_id),
            "session_type": model.session_type,
        }

    async def send_message(self, session_id: UUID, content: str) -> MessageResponse:
        session = await self._repo.get_session(session_id)
        if not session:
            raise ValueError("Session not found")

        # Save user message
        await self._repo.add_message(session_id, ChatRole.USER, content)

        # Route to handler
        if session.session_type == ChatSessionType.DATA_QUERY:
            response = await self._handle_data_query(
                content, session.survey_schema_id, session.active_filters_snapshot,
            )
        else:
            response = await self._handle_persona_interview(
                content, session.active_persona_id,
            )

        # Save assistant response
        await self._repo.add_message(
            session_id, ChatRole.ASSISTANT, response.content,
            executed_query=response.executed_query,
            result_snapshot=response.result_snapshot,
        )
        return response

    async def get_history(self, session_id: UUID) -> list[dict]:
        messages = await self._repo.get_messages(session_id)
        return [
            {"role": m.role, "content": m.content,
             "executed_query": m.executed_query,
             "result_snapshot": m.result_snapshot,
             "sent_at": m.sent_at.isoformat()}
            for m in messages
        ]

    async def _handle_data_query(
        self, query: str, survey_schema_id: UUID, active_filters: dict
    ) -> MessageResponse:
        """FR-20/21: Translate NL → structured query → execute on data."""
        from src.ingestion.interfaces.api import IngestionService
        ing = IngestionService(self._db)

        schema = await ing.get_survey_schema(survey_schema_id)
        subs = await ing.get_submissions(survey_schema_id, valid_only=True)
        raw_data = [s.raw_responses for s in subs]

        if not raw_data:
            return MessageResponse(
                role=ChatRole.ASSISTANT,
                content="No submissions found for this survey yet.",
            )

        # Build field list from data
        fields = []
        if schema and schema.question_definitions:
            fields = [{"question_id": q.question_id, "text": q.text,
                       "data_type": q.data_type}
                      for q in schema.question_definitions]
        else:
            # Infer from first submission
            fields = [{"question_id": k, "text": k, "data_type": "NOMINAL"}
                      for k in raw_data[0].keys()]

        # Translate to structured query
        structured = await self._translator.translate(query, fields, active_filters)

        if structured.get("intent") == "error":
            return MessageResponse(
                role=ChatRole.ASSISTANT,
                content=structured.get("error", "Sorry, I couldn't understand that."),
            )

        # Execute query on in-memory data
        result = self._execute_query(structured, raw_data)

        return MessageResponse(
            role=ChatRole.ASSISTANT,
            content=result["summary"],
            executed_query=structured,
            result_snapshot=result,
        )

    async def _handle_persona_interview(
        self, message: str, persona_id: UUID | None
    ) -> MessageResponse:
        """FR-23: Chat with a simulated persona."""
        persona_context = "a typical survey respondent"
        if persona_id:
            from src.simulation.interfaces.api import SimulationService
            sim = SimulationService(self._db)
            persona = await sim.get_persona(persona_id)
            if persona:
                persona_context = json.dumps(persona.get("parsed_parameters", {}))

        response = await llm_gateway.complete(LLMRequest(
            system_prompt=(
                f"You are a simulated survey respondent with these traits:\n{persona_context}\n\n"
                "Answer questions in character about why you responded the way you did. "
                "Be authentic to the persona's personality and demographics."
            ),
            user_prompt=message,
        ))
        return MessageResponse(role=ChatRole.ASSISTANT, content=response.content)

    def _execute_query(self, query: dict, data: list[dict]) -> dict:
        """Execute a structured query against in-memory submission data."""
        filtered = data

        # Apply filters
        for f in query.get("filters", []):
            field = f.get("field", "")
            op = f.get("operator", "eq")
            value = f.get("value")
            filtered = [
                row for row in filtered
                if self._apply_filter(row.get(field), op, value)
            ]

        # Apply aggregation
        agg = query.get("aggregation")
        if agg:
            agg_field = agg.get("field", "")
            agg_type = agg.get("type", "count")
            values = [row.get(agg_field) for row in filtered if row.get(agg_field) is not None]

            if agg_type == "count":
                result_data = {"count": len(values)}
                summary = f"Found {len(values)} matching responses."
            elif agg_type == "distribution":
                dist = dict(Counter(str(v) for v in values))
                result_data = {"distribution": dist}
                top = Counter(str(v) for v in values).most_common(3)
                summary = f"Distribution of '{agg_field}': " + ", ".join(
                    f"{k}: {v}" for k, v in top
                )
            elif agg_type == "average":
                nums = []
                for v in values:
                    try:
                        nums.append(float(v))
                    except (ValueError, TypeError):
                        pass
                avg = sum(nums) / len(nums) if nums else 0
                result_data = {"average": round(avg, 2)}
                summary = f"Average '{agg_field}': {round(avg, 2)} (n={len(nums)})"
            else:
                result_data = {"values": values[:20]}
                summary = f"Found {len(values)} values for '{agg_field}'."
        else:
            result_data = {"matching_count": len(filtered)}
            summary = f"Found {len(filtered)} matching submissions out of {len(data)} total."

        return {"summary": summary, "data": result_data, "filtered_count": len(filtered)}

    def _apply_filter(self, actual, operator: str, expected) -> bool:
        if actual is None:
            return False
        actual_str = str(actual).lower()
        expected_str = str(expected).lower() if expected else ""
        if operator == "eq":
            return actual_str == expected_str
        if operator == "neq":
            return actual_str != expected_str
        if operator == "contains":
            return expected_str in actual_str
        if operator == "in":
            return actual_str in [str(v).lower() for v in (expected if isinstance(expected, list) else [expected])]
        try:
            a, e = float(actual), float(expected)
            if operator == "gt":
                return a > e
            if operator == "lt":
                return a < e
        except (ValueError, TypeError):
            pass
        return False


# ── Routes ────────────────────────────────────────

@router.post("/sessions")
async def start_session(
    req: StartSessionRequest, session: AsyncSession = Depends(get_db_session)
):
    service = ChatAssistantService(session)
    return await service.start_session(req)


@router.post("/messages")
async def send_message(
    req: SendMessageRequest, session: AsyncSession = Depends(get_db_session)
):
    service = ChatAssistantService(session)
    try:
        response = await service.send_message(req.session_id, req.content)
        return response.model_dump()
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/sessions/{session_id}/history")
async def get_history(
    session_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = ChatAssistantService(session)
    return await service.get_history(session_id)


@router.websocket("/ws/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: UUID):
    await websocket.accept()
    logger.info("WebSocket connected: %s", session_id)
    try:
        while True:
            data = await websocket.receive_json()
            content = data.get("content", "")
            # In production, get a DB session from the WebSocket scope
            # For now, echo back with acknowledgment
            await websocket.send_json({
                "role": "ASSISTANT",
                "content": f"Processing: {content}",
                "session_id": str(session_id),
            })
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", session_id)