"""
Chat Assistant — Intent Router & Chart Generator.
FR-21: Classifies user intent, generates query specs, and produces React chart code.

Three pipelines:
  text_answer → query spec → executor → LLM summary
  chart       → query spec → executor → LLM React component code
  both        → query spec → executor → LLM summary + React component code
"""

import json
import logging
import re

from src.shared_kernel import LLMRequest, llm_gateway

logger = logging.getLogger(__name__)


# ── Intent Classification ────────────────────────

INTENT_SYSTEM_PROMPT = """You are an intent classifier for a survey analysis chat assistant.
Given a user message and the survey schema, classify the intent as one of:
- "text_answer": User wants a factual answer, count, comparison, or explanation.
- "chart": User explicitly wants a visual chart, graph, plot, or diagram.
- "both": User wants data insight that would benefit from both text AND a chart.

Also produce a structured query spec to fetch the data needed.

Available filter operators: eq, ne, gt, lt, gte, lte, in, not_in, contains
Available operations: count, sum, mean, median, min, max, distinct, distribution

Output STRICTLY as JSON:
{
    "intent": "text_answer" | "chart" | "both",
    "query_spec": {
        "operation": "<operation>",
        "column": "<column_name or null>",
        "filters": [{"column": "<col>", "op": "<operator>", "value": "<value>"}],
        "group_by": "<column_name or null>"
    },
    "chart_hint": "<suggested chart type if intent is chart or both, e.g. bar, pie, scatter, line, radar, area, histogram, donut, box, treemap, funnel, stacked_bar>"
}

If prior conversation context is provided, use it to interpret ambiguous references
(e.g., 'show it as a pie chart' refers to the previous chart or topic discussed).
Return ONLY valid JSON. No markdown, no explanation."""


CHART_CODE_SYSTEM_PROMPT = """You are a React/Recharts code generator for a survey data chat assistant.
You will receive:
1. The user's original question
2. The computed data (array of objects)
3. A chart type hint

Generate a SINGLE self-contained React arrow function component that renders a Recharts visualization.

RULES:
- The component receives a single prop: { data } which is an array of objects.
- Use Recharts components. Available: ResponsiveContainer, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, AreaChart, Area,
  ComposedChart, ReferenceLine, Label, Treemap, FunnelChart, Funnel, LabelList,
  RadialBarChart, RadialBar.
- All these are available as global variables. Do NOT use import statements.
- Wrap everything in <ResponsiveContainer width="100%" height={350}>.
- Use pleasant colors. Here's a palette: ["#4c6ef5","#37b24d","#f59f00","#f03e3e","#7950f2","#1c7ed6","#e64980","#0ca678","#fd7e14","#845ef7"].
- For pie/donut charts, use <Cell> with different fill colors from the palette.
- Make the chart readable: include axis labels, tooltips, legend where appropriate.
- DO NOT use import/require/fetch/eval/window/document/localStorage.
- DO NOT include markdown backticks or explanation. Output ONLY the function code.

Example output:
({ data }) => {
  const COLORS = ["#4c6ef5","#37b24d","#f59f00","#f03e3e","#7950f2"];
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill="#4c6ef5" radius={[4,4,0,0]}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

Output ONLY the function expression starting with ({ data }) =>. No other text."""


TEXT_ANSWER_SYSTEM_PROMPT = """You are a survey data analyst assistant.
Given the user's question and the computed query results, provide a clear, helpful answer.
Be specific with numbers. If the data shows a distribution or grouped result, mention the key findings.
Keep it concise — 2-4 sentences. Do not use markdown formatting."""


# ── Dangerous code patterns ──────────────────────

BLOCKED_PATTERNS = re.compile(
    r"\b(import|require|fetch|eval|exec|Function|window|document|localStorage"
    r"|sessionStorage|XMLHttpRequest|WebSocket|process|global|module\.exports"
    r"|__proto__|constructor)\b",
    re.IGNORECASE,
)


class QueryTranslator:
    """Intent router + query spec generator + chart code generator."""

    async def classify_intent(
        self,
        user_query: str,
        fields: list[dict],
        active_filters: dict | None = None,
        history: list[dict] | None = None,
    ) -> dict:
        """Classify intent and generate a query spec."""
        context = (
            f"Available fields: {json.dumps(fields)}\n"
            f"Active filters: {json.dumps(active_filters or {})}\n"
            f"User message: {user_query}"
        )
        response = await llm_gateway.complete(LLMRequest(
            system_prompt=INTENT_SYSTEM_PROMPT,
            user_prompt=context,
            messages=history,
        ))
        try:
            cleaned = response.content.strip()
            # Strip markdown code fences if present
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```\w*\n?", "", cleaned)
                cleaned = re.sub(r"\n?```$", "", cleaned)
            parsed = json.loads(cleaned)
            logger.info(
                "Intent classified: %s, operation=%s",
                parsed.get("intent"),
                parsed.get("query_spec", {}).get("operation"),
            )
            return parsed
        except json.JSONDecodeError as e:
            logger.warning("Failed to parse intent response: %s", e)
            return {
                "intent": "text_answer",
                "query_spec": {"operation": "count", "filters": []},
            }

    async def generate_text_answer(
        self, user_query: str, query_result: dict
    ) -> str:
        """Generate a natural language answer from query results."""
        context = (
            f"User question: {user_query}\n"
            f"Query result summary: {query_result.get('summary', '')}\n"
            f"Result data: {json.dumps(query_result.get('data', {}))}\n"
            f"Total matching rows: {query_result.get('count', 0)}"
        )
        response = await llm_gateway.complete(LLMRequest(
            system_prompt=TEXT_ANSWER_SYSTEM_PROMPT,
            user_prompt=context,
        ))
        return response.content.strip()

    async def generate_chart_code(
        self,
        user_query: str,
        chart_data: list[dict],
        chart_hint: str = "bar",
    ) -> str | None:
        """
        Generate a React component string for rendering a chart.
        Returns None if generation or validation fails after retry.
        """
        context = (
            f"User question: {user_query}\n"
            f"Chart type hint: {chart_hint}\n"
            f"Data: {json.dumps(chart_data[:50])}"  # cap at 50 for token limit
        )

        for attempt in range(2):
            response = await llm_gateway.complete(LLMRequest(
                system_prompt=CHART_CODE_SYSTEM_PROMPT,
                user_prompt=context if attempt == 0 else (
                    f"{context}\n\nPREVIOUS ATTEMPT FAILED VALIDATION. "
                    f"Do not use import/require/fetch/eval/window/document. "
                    f"Output ONLY the arrow function starting with ({{ data }}) =>."
                ),
            ))

            code = response.content.strip()
            # Strip markdown fences
            if code.startswith("```"):
                code = re.sub(r"^```\w*\n?", "", code)
                code = re.sub(r"\n?```$", "", code)
            code = code.strip()

            if self._validate_chart_code(code):
                logger.info("Chart code generated (attempt %d)", attempt + 1)
                return code
            else:
                logger.warning("Chart code validation failed (attempt %d)", attempt + 1)

        logger.error("Chart code generation failed after 2 attempts")
        return None

    def _validate_chart_code(self, code: str) -> bool:
        """Validate generated chart code for safety and basic structure."""
        if not code:
            return False

        # Must be a function expression
        if not code.startswith("("):
            return False

        # Must not contain dangerous patterns
        if BLOCKED_PATTERNS.search(code):
            logger.warning("Blocked pattern found in chart code")
            return False

        # Must reference data prop
        if "data" not in code:
            return False

        # Must use ResponsiveContainer or at least some Recharts component
        recharts_refs = [
            "ResponsiveContainer", "BarChart", "LineChart", "PieChart",
            "ScatterChart", "RadarChart", "AreaChart", "ComposedChart",
            "Treemap", "FunnelChart", "RadialBarChart",
        ]
        if not any(ref in code for ref in recharts_refs):
            return False

        return True