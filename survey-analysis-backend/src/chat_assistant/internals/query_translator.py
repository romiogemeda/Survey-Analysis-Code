"""Chat Assistant — NL Query Translator. FR-21: Natural language → data operations."""

import json
import logging
from src.shared_kernel import LLMRequest, llm_gateway

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a data query translator for a survey analysis system.
Given a natural language question, translate it into structured JSON:
{
    "intent": "filter" | "aggregate" | "compare" | "count",
    "filters": [{"field": "<question_id>", "operator": "eq|neq|gt|lt|in|contains", "value": "<value>"}],
    "aggregation": {"type": "count|distribution|average|sentiment", "field": "<question_id>"} | null,
    "group_by": "<question_id>" | null,
    "visualization": "bar|pie|histogram|table|number" | null
}
Return ONLY valid JSON, no explanation."""


class QueryTranslator:
    async def translate(
        self, user_query: str, available_fields: list[dict],
        active_filters: dict | None = None,
    ) -> dict:
        context = (
            f"Available fields: {json.dumps(available_fields)}\n"
            f"Active filters: {json.dumps(active_filters or {})}\n"
            f"Question: {user_query}"
        )
        response = await llm_gateway.complete(LLMRequest(
            system_prompt=SYSTEM_PROMPT, user_prompt=context,
        ))
        try:
            parsed = json.loads(response.content)
            logger.info("Translated query: intent=%s", parsed.get("intent"))
            return parsed
        except json.JSONDecodeError:
            return {"intent": "error", "error": "Could not parse query. Please rephrase."}