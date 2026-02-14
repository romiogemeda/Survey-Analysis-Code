"""
Chat Assistant Module — Public Interface.
FR-20 (NL Querying), FR-21 (Dynamic Query), FR-22 (Context), FR-23 (Persona Interview).

Flow:
  User message → Intent Router (classify_intent) → Query Executor → Pipeline:
    text_answer: executor result → LLM text summary
    chart:       executor result → LLM React/Recharts component code
    both:        executor result → LLM text summary + LLM chart code
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
from src.chat_assistant.internals.query_executor import QueryExecutor
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
    chart_code: str | None = None
    chart_data: list[dict] | None = None
    chart_type: str | None = None
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
            chart_code=response.chart_code,
            chart_data=response.chart_data,
            chart_type=response.chart_type,
        )
        return response

    async def get_history(self, session_id: UUID) -> list[dict]:
        messages = await self._repo.get_messages(session_id)
        return [
            {
                "role": m.role, "content": m.content,
                "chart_code": m.chart_code,
                "chart_data": m.chart_data,
                "chart_type": m.chart_type,
                "executed_query": m.executed_query,
                "result_snapshot": m.result_snapshot,
                "sent_at": m.sent_at.isoformat(),
            }
            for m in messages
        ]

    # ── Data Query Pipeline ───────────────────────

    async def _handle_data_query(
        self, query: str, survey_schema_id: UUID, active_filters: dict
    ) -> MessageResponse:
        """FR-20/21: Intent routing → query execution → text/chart generation."""
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

        # Build field context for the LLM
        fields = self._build_field_context(schema, raw_data)

        # Step 1: Classify intent + get query spec
        classification = await self._translator.classify_intent(
            query, fields, active_filters
        )
        intent = classification.get("intent", "text_answer")
        query_spec = classification.get("query_spec", {"operation": "count", "filters": []})
        chart_hint = classification.get("chart_hint", "bar")

        # Step 2: Execute query
        executor = QueryExecutor(raw_data)
        query_result = executor.execute(query_spec)

        # Step 3: Route to pipeline
        if intent == "text_answer":
            return await self._text_answer_pipeline(
                query, query_spec, query_result
            )
        elif intent == "chart":
            return await self._chart_pipeline(
                query, query_spec, query_result, executor, chart_hint
            )
        else:  # "both"
            return await self._both_pipeline(
                query, query_spec, query_result, executor, chart_hint
            )

    async def _text_answer_pipeline(
        self, query: str, query_spec: dict, query_result: dict
    ) -> MessageResponse:
        """Generate a text-only answer."""
        text = await self._translator.generate_text_answer(query, query_result)
        return MessageResponse(
            role=ChatRole.ASSISTANT,
            content=text,
            executed_query=query_spec,
            result_snapshot=query_result,
        )

    async def _chart_pipeline(
        self, query: str, query_spec: dict, query_result: dict,
        executor: QueryExecutor, chart_hint: str,
    ) -> MessageResponse:
        """Generate a chart with brief text explanation."""
        chart_data = executor.prepare_chart_data(query_result)

        if not chart_data:
            # Fallback to text if no chartable data
            text = await self._translator.generate_text_answer(query, query_result)
            return MessageResponse(
                role=ChatRole.ASSISTANT,
                content=text + "\n\n(No chartable data was produced for this query.)",
                executed_query=query_spec,
                result_snapshot=query_result,
            )

        chart_code = await self._translator.generate_chart_code(
            query, chart_data, chart_hint
        )

        if chart_code:
            # Generate a brief text to accompany the chart
            text = await self._translator.generate_text_answer(query, query_result)
            return MessageResponse(
                role=ChatRole.ASSISTANT,
                content=text,
                chart_code=chart_code,
                chart_data=chart_data,
                chart_type=chart_hint,
                executed_query=query_spec,
                result_snapshot=query_result,
            )
        else:
            # Chart generation failed — fall back to text
            text = await self._translator.generate_text_answer(query, query_result)
            return MessageResponse(
                role=ChatRole.ASSISTANT,
                content=text + "\n\n(I tried to generate a chart but encountered an error.)",
                executed_query=query_spec,
                result_snapshot=query_result,
            )

    async def _both_pipeline(
        self, query: str, query_spec: dict, query_result: dict,
        executor: QueryExecutor, chart_hint: str,
    ) -> MessageResponse:
        """Generate text + chart together."""
        text = await self._translator.generate_text_answer(query, query_result)
        chart_data = executor.prepare_chart_data(query_result)

        if chart_data:
            chart_code = await self._translator.generate_chart_code(
                query, chart_data, chart_hint
            )
            if chart_code:
                return MessageResponse(
                    role=ChatRole.ASSISTANT,
                    content=text,
                    chart_code=chart_code,
                    chart_data=chart_data,
                    chart_type=chart_hint,
                    executed_query=query_spec,
                    result_snapshot=query_result,
                )

        # Fallback: text only
        return MessageResponse(
            role=ChatRole.ASSISTANT,
            content=text,
            executed_query=query_spec,
            result_snapshot=query_result,
        )

    def _build_field_context(
        self, schema, raw_data: list[dict]
    ) -> list[dict]:
        """Build field metadata for the LLM, including sample values and stats."""
        fields = []
        if schema and schema.question_definitions:
            for q in schema.question_definitions:
                field_info = {
                    "question_id": q.question_id,
                    "text": q.text,
                    "data_type": q.data_type,
                }
                # Add sample values
                values = [r.get(q.question_id) for r in raw_data if r.get(q.question_id) is not None]
                if values:
                    distinct = list(set(str(v) for v in values))[:8]
                    field_info["sample_values"] = distinct
                    field_info["total_non_null"] = len(values)
                fields.append(field_info)
        else:
            if raw_data:
                for k in raw_data[0].keys():
                    values = [r.get(k) for r in raw_data if r.get(k) is not None]
                    distinct = list(set(str(v) for v in values))[:8]
                    fields.append({
                        "question_id": k, "text": k, "data_type": "NOMINAL",
                        "sample_values": distinct, "total_non_null": len(values),
                    })
        return fields

    # ── Persona Interview (unchanged) ─────────────

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
            await websocket.send_json({
                "role": "ASSISTANT",
                "content": f"Processing: {content}",
                "session_id": str(session_id),
            })
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", session_id)