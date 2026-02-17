"""
Analytics — Findings Generator.
Translates raw CorrelationResultRecords into plain-language finding cards
suitable for non-technical users.

Each finding has:
  - headline:         "Strong connection: Higher anxiety is linked to poorer sleep quality"
  - explanation:      "Students who reported higher anxiety also tended to report lower sleep..."
  - recommendation:   LLM-generated actionable recommendation (one sentence)
  - strength:         "strong" / "moderate" / "weak"
  - direction:        "positive" / "negative" / "association" (chi-square has no direction)
  - variables:        [var_a, var_b]
  - importance_score: numeric (for sorting)
  - technical:        {method, statistic, p_value}
"""

import logging
from src.shared_kernel import CorrelationMethod, CorrelationResultRecord, LLMRequest, llm_gateway

logger = logging.getLogger(__name__)


# ── Strength thresholds ──────────────────────────

def _classify_strength(method: str, statistic: float) -> str:
    """Map raw statistic to human-readable strength."""
    abs_val = abs(statistic)
    if method == CorrelationMethod.CHI_SQUARE:
        # Chi-square values aren't bounded by [-1, 1] — use p-value proximity instead
        # But we classify by the statistic magnitude relative to typical ranges
        if abs_val > 20:
            return "strong"
        if abs_val > 10:
            return "moderate"
        return "weak"
    else:
        # Pearson / Spearman: bounded [-1, 1]
        if abs_val >= 0.7:
            return "strong"
        if abs_val >= 0.4:
            return "moderate"
        return "weak"


def _classify_direction(method: str, statistic: float) -> str:
    """Determine the direction of the relationship."""
    if method == CorrelationMethod.CHI_SQUARE:
        return "association"  # chi-square doesn't have positive/negative
    return "positive" if statistic >= 0 else "negative"


def _compute_importance(strength: str, p_value: float, n_observations: int | None = None) -> float:
    """
    Score for sorting findings by importance.
    Higher = more important. Combines effect size with significance.
    """
    strength_scores = {"strong": 3.0, "moderate": 2.0, "weak": 1.0}
    base = strength_scores.get(strength, 1.0)

    # Lower p-value = more significant = higher score
    sig_bonus = max(0, 2.0 - (p_value * 100))  # p=0.001 → +1.9, p=0.04 → +0.0

    return round(base + sig_bonus, 2)


# ── Headline & Explanation Templates ─────────────

def _format_variable(var_name: str) -> str:
    """Clean up column names for display: snake_case → Title Case."""
    return var_name.replace("_", " ").replace("-", " ").title()


def _generate_headline(var_a: str, var_b: str, strength: str, direction: str) -> str:
    a = _format_variable(var_a)
    b = _format_variable(var_b)

    if direction == "positive":
        if strength == "strong":
            return f"Strong connection: {a} and {b} tend to increase together"
        if strength == "moderate":
            return f"Moderate connection: {a} and {b} are related"
        return f"Weak connection: A slight link between {a} and {b}"

    if direction == "negative":
        if strength == "strong":
            return f"Strong connection: Higher {a} is linked to lower {b}"
        if strength == "moderate":
            return f"Moderate connection: {a} tends to go in the opposite direction of {b}"
        return f"Weak connection: A slight inverse link between {a} and {b}"

    # association (chi-square)
    if strength == "strong":
        return f"Strong association between {a} and {b}"
    if strength == "moderate":
        return f"Moderate association between {a} and {b}"
    return f"Weak association between {a} and {b}"


def _generate_explanation(
    var_a: str, var_b: str, strength: str, direction: str,
    method: str, statistic: float, p_value: float,
) -> str:
    a = _format_variable(var_a)
    b = _format_variable(var_b)

    confidence = "very high" if p_value < 0.001 else "high" if p_value < 0.01 else "good"

    if direction == "positive":
        return (
            f"Respondents who scored higher on {a} also tended to score higher on {b}. "
            f"This is a {strength} {direction} pattern with {confidence} statistical confidence."
        )
    if direction == "negative":
        return (
            f"Respondents who scored higher on {a} tended to score lower on {b}. "
            f"This is a {strength} inverse pattern with {confidence} statistical confidence."
        )
    # association
    return (
        f"The way respondents answered {a} is connected to how they answered {b}. "
        f"This is a {strength} association with {confidence} statistical confidence."
    )


# ── LLM Recommendation Generation ────────────────

BATCH_RECOMMENDATION_PROMPT = """You are an advisor for survey data insights.
For each finding below, write ONE concise, actionable recommendation sentence.
Do not use statistical jargon. Write as if advising a school administrator or project manager.

Findings:
{findings_list}

Output STRICTLY as a JSON array of strings, one recommendation per finding, in the same order.
Example: ["Recommendation for finding 1", "Recommendation for finding 2"]
Output ONLY the JSON array. No markdown, no explanation."""

MAX_FINDINGS = 10


async def _generate_recommendations_batch(findings: list[dict]) -> list[str]:
    """Generate recommendations for all findings in a SINGLE LLM call."""
    if not findings:
        return []

    fallback = "Review this finding and consider how it might inform your next steps."

    findings_text = "\n".join(
        f"{i+1}. {f['headline']} (Direction: {f['direction']}, Strength: {f['strength']})"
        for i, f in enumerate(findings)
    )

    try:
        import json as _json
        response = await llm_gateway.complete(LLMRequest(
            system_prompt="You are a concise data advisor. Output only a JSON array of recommendation strings.",
            user_prompt=BATCH_RECOMMENDATION_PROMPT.format(findings_list=findings_text),
            max_tokens=1500,
        ))

        content = response.content.strip()
        # Strip markdown fences if present
        if content.startswith("```"):
            import re
            content = re.sub(r"^```\w*\n?", "", content)
            content = re.sub(r"\n?```$", "", content)
            content = content.strip()

        recommendations = _json.loads(content)
        if isinstance(recommendations, list) and len(recommendations) >= len(findings):
            return [str(r).strip().strip('"') for r in recommendations[:len(findings)]]

        # Partial result — pad with fallback
        result = [str(r).strip().strip('"') for r in recommendations]
        while len(result) < len(findings):
            result.append(fallback)
        return result

    except Exception as e:
        logger.warning("Batch recommendation generation failed: %s", e)
        return [fallback] * len(findings)


# ── Main Generator ────────────────────────────────

async def generate_findings(
    correlations: list[CorrelationResultRecord],
) -> list[dict]:
    """
    Convert raw correlation results into plain-language finding cards.
    Only significant results are included. Capped at top MAX_FINDINGS by importance.
    Uses a SINGLE batched LLM call for all recommendations.
    """
    significant = [c for c in correlations if c.is_significant]

    if not significant:
        return []

    # Build findings without recommendations first (no LLM calls)
    raw_findings = []
    for corr in significant:
        strength = _classify_strength(corr.method, corr.statistic_value)
        direction = _classify_direction(corr.method, corr.statistic_value)
        importance = _compute_importance(strength, corr.p_value)
        headline = _generate_headline(
            corr.independent_variable, corr.dependent_variable,
            strength, direction,
        )
        explanation = _generate_explanation(
            corr.independent_variable, corr.dependent_variable,
            strength, direction, corr.method,
            corr.statistic_value, corr.p_value,
        )

        raw_findings.append({
            "headline": headline,
            "explanation": explanation,
            "recommendation": "",  # filled after batch call
            "strength": strength,
            "direction": direction,
            "variables": [corr.independent_variable, corr.dependent_variable],
            "importance_score": importance,
            "technical": {
                "method": str(corr.method),
                "statistic": corr.statistic_value,
                "p_value": corr.p_value,
            },
        })

    # Sort by importance and cap
    raw_findings.sort(key=lambda f: f["importance_score"], reverse=True)
    raw_findings = raw_findings[:MAX_FINDINGS]

    # Single batched LLM call for all recommendations
    recommendations = await _generate_recommendations_batch(raw_findings)
    for i, finding in enumerate(raw_findings):
        finding["recommendation"] = recommendations[i]

    return raw_findings


def generate_findings_summary_for_llm(findings: list[dict]) -> str:
    """Format findings as plain text for the executive summary LLM prompt."""
    if not findings:
        return "No significant patterns were detected in the data."

    lines = []
    for f in findings:
        lines.append(f"- {f['headline']}")
    return "\n".join(lines)