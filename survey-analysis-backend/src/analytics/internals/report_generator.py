"""
Analytics — Report Generator.
Generates structured survey analysis report sections via LLM calls.

Each report section has a dedicated async generator function with its own
tailored prompt.  The orchestrator runs them concurrently (capped at 4) and
returns a dict mapping section key → markdown body.

Context dict expected keys:
  survey_title, survey_description, total_responses, generated_date,
  significant_findings_count, analysis_summary, findings, descriptive_stats,
  quality_summary, pinned_insights
"""

import asyncio
import logging
from datetime import datetime, timezone

from src.shared_kernel import LLMRequest, llm_gateway

logger = logging.getLogger(__name__)


# ── Section ordering and display names ────────────

SECTION_KEYS = [
    'title_page',
    'executive_summary',
    'methodology',
    'key_findings',
    'descriptive_statistics',
    'quality_assessment',
    'pinned_insights',
    'recommendations',
    'conclusion',
]

SECTION_TITLES = {
    'title_page': 'Title Page',
    'executive_summary': 'Executive Summary',
    'methodology': 'Methodology',
    'key_findings': 'Key Findings',
    'descriptive_statistics': 'Descriptive Statistics',
    'quality_assessment': 'Quality Assessment',
    'pinned_insights': 'Additional Insights',
    'recommendations': 'Recommendations',
    'conclusion': 'Conclusion',
}

_SYSTEM_PROMPT = 'You are a professional survey-analysis report writer.'
_FALLBACK = 'This section could not be generated. Please try regenerating it.'


# ── Helper ────────────────────────────────────────

async def _llm_section(prompt: str, max_tokens: int = 1200) -> str:
    """Call the LLM gateway and return trimmed content, or _FALLBACK on error."""
    try:
        response = await llm_gateway.complete(LLMRequest(
            system_prompt=_SYSTEM_PROMPT,
            user_prompt=prompt,
            max_tokens=max_tokens,
        ))
        text = response.content.strip()
        return text if text else _FALLBACK
    except Exception as exc:
        logger.error('Report section LLM call failed: %s', exc)
        return _FALLBACK


# ── Title Page ────────────────────────────────────

async def _generate_title_page(context: dict) -> str:
    now = context.get('generated_date', datetime.now(timezone.utc).strftime('%B %d, %Y'))
    prompt = f"""
You are writing the Title Page of a formal survey analysis report.
Produce a short markdown block that includes:
  - The survey title as a bold heading
  - The date of the report
  - Total number of responses analyzed
  - A one-line executive description of what this survey investigates

Survey title: {context.get('survey_title', 'Untitled Survey')}
Date: {now}
Total responses: {context.get('total_responses', 'N/A')}
Survey description: {context.get('survey_description', 'No description provided.')}

Output ONLY the title-page body as clean markdown. Do NOT include a heading like
'# Title Page' — the heading is added separately.
""".strip()
    return await _llm_section(prompt, max_tokens=400)


# ── Executive Summary ─────────────────────────────

async def _generate_executive_summary(context: dict) -> str:
    prompt = f"""
You are writing the Executive Summary section of a survey analysis report.
Write 2-3 short paragraphs. Avoid statistical jargon.

Survey: {context.get('survey_title', 'Untitled Survey')}
Total responses: {context.get('total_responses', 'N/A')}
Key findings identified: {context.get('significant_findings_count', 0)}

The analysis produced this summary:
{context.get('analysis_summary', 'No summary available.')}

Write a polished executive summary that a non-technical reader can immediately
understand.  Use clear, confident language.
Output only the section body as markdown (no heading — the heading is added separately).
""".strip()
    return await _llm_section(prompt, max_tokens=800)


# ── Methodology ───────────────────────────────────

async def _generate_methodology(context: dict) -> str:
    stats = context.get('descriptive_stats', {})
    question_count = len(stats) if isinstance(stats, (dict, list)) else 'multiple'

    prompt = f"""
You are writing the Methodology section of a survey analysis report.
Write 1-2 concise paragraphs explaining how the analysis was conducted.
Mention ALL of the following points:

  - The survey collected {context.get('total_responses', 'N/A')} responses.
  - {question_count} questions were analyzed.
  - Data types analyzed include numeric, categorical, free-text, and date fields
    where present.
  - Correlation analysis was performed to identify statistically significant
    relationships between variables.
  - Quality scoring was applied to individual responses to assess data integrity.
  - Descriptive statistics were computed for each question.

Write for a general audience. Keep it factual.
Output only the section body as markdown (no heading).
""".strip()
    return await _llm_section(prompt, max_tokens=600)


# ── Key Findings ──────────────────────────────────

async def _generate_key_findings(context: dict) -> str:
    findings = context.get('findings', [])
    if not findings:
        return '_No statistically significant findings were identified in this analysis._'

    # Cap at 10 findings
    findings = findings[:10]

    findings_text = ''
    for i, f in enumerate(findings, 1):
        headline = f.get('headline', f'Finding {i}')
        explanation = f.get('explanation', '')
        recommendation = f.get('recommendation', '')
        findings_text += f"""
Finding {i}:
  Headline: {headline}
  Explanation: {explanation}
  Recommendation: {recommendation}
"""

    prompt = f"""
You are writing the Key Findings section of a survey analysis report.
For each finding below, create a readable subsection with:
  - The headline as a markdown subheading (### level)
  - The explanation as the paragraph body
  - The recommendation in italics at the end

Format as clean, professional markdown. Keep the language accessible.
Do NOT add a top-level heading — the heading is added separately.

{findings_text.strip()}
""".strip()
    return await _llm_section(prompt, max_tokens=2000)


# ── Descriptive Statistics ────────────────────────

async def _generate_descriptive_statistics(context: dict) -> str:
    stats = context.get('descriptive_stats', {})
    if not stats:
        return '_No descriptive statistics were computed for this survey._'

    # Build a simplified table payload — skip IDENTIFIER and DATETIME types
    skip_types = {'IDENTIFIER', 'DATETIME'}
    rows = []

    if isinstance(stats, dict):
        items = stats.items()
    elif isinstance(stats, list):
        items = [(s.get('question', s.get('variable', f'Q{i}')), s)
                 for i, s in enumerate(stats)]
    else:
        items = []

    for key, stat in items:
        if isinstance(stat, dict):
            q_type = stat.get('type', stat.get('data_type', ''))
            if q_type.upper() in skip_types:
                continue
            total = stat.get('total_responses', stat.get('count', 'N/A'))
            missing = stat.get('missing_count', stat.get('missing', 0))
            missing_rate = stat.get('missing_rate', '')
            if not missing_rate and total and total != 'N/A':
                try:
                    missing_rate = f"{(int(missing) / int(total)) * 100:.1f}%"
                except (ValueError, ZeroDivisionError):
                    missing_rate = 'N/A'
            rows.append({
                'question': key if isinstance(key, str) else str(key),
                'type': q_type,
                'responses': total,
                'missing_rate': missing_rate,
            })

    if not rows:
        return '_All questions were of types excluded from descriptive statistics._'

    table_text = '| Question | Type | Responses | Missing Rate |\n'
    table_text += '|----------|------|-----------|-------------|\n'
    for r in rows:
        q_display = r['question'][:60] + ('…' if len(r['question']) > 60 else '')
        table_text += f"| {q_display} | {r['type']} | {r['responses']} | {r['missing_rate']} |\n"

    prompt = f"""
You are writing the Descriptive Statistics section of a survey analysis report.
Write a brief introductory paragraph (2-3 sentences) explaining that the table
below summarizes response volumes and missing-data rates for each question.
Then include the following markdown table exactly as-is (do NOT modify it):

{table_text.strip()}

Do NOT add a top-level heading — the heading is added separately.
Output the prose intro followed by the table.
""".strip()
    return await _llm_section(prompt, max_tokens=1500)


# ── Quality Assessment ────────────────────────────

async def _generate_quality_assessment(context: dict) -> str:
    quality = context.get('quality_summary', None)
    if not quality:
        return (
            '_Quality scoring was not performed for this survey. '
            'Run the quality analysis module to include this section in future reports._'
        )

    prompt = f"""
You are writing the Quality Assessment section of a survey analysis report.
Write 1-2 paragraphs describing the quality of the dataset.

Quality data:
  - Overall pass rate: {quality.get('pass_rate', 'N/A')}
  - Grade breakdown: {quality.get('grade_breakdown', 'N/A')}
  - Top issues identified: {quality.get('top_issues', 'None reported')}
  - Responses flagged for low quality: {quality.get('flagged_count', 'N/A')}

If the scores are generally high, say so with confidence. If there are concerns,
note them clearly but diplomatically.
Output only the section body as markdown (no heading).
""".strip()
    return await _llm_section(prompt, max_tokens=600)


# ── Pinned Insights ───────────────────────────────

async def _generate_pinned_insights(context: dict) -> str:
    pins = context.get('pinned_insights', [])
    if not pins:
        return 'No additional insights were pinned during exploration.'

    pins_text = ''
    for i, pin in enumerate(pins, 1):
        question = pin.get('source_question', f'Insight {i}')
        content = pin.get('content', '')
        note = pin.get('user_note', '')
        pins_text += f"""
Insight {i}:
  Question: {question}
  Content: {content}
  User note: {note if note else '(none)'}
"""

    prompt = f"""
You are writing the Additional Insights section of a survey analysis report.
These are insights pinned by the analyst during interactive exploration.

For each insight below, create a subsection with:
  - The source question as a markdown subheading (### level)
  - The content as body text
  - If the user provided a note, include it at the end in italics prefixed with
    "Analyst note: "

Format as clean markdown. Do NOT add a top-level heading.

{pins_text.strip()}
""".strip()
    return await _llm_section(prompt, max_tokens=1500)


# ── Recommendations ───────────────────────────────

async def _generate_recommendations(context: dict) -> str:
    findings = context.get('findings', [])
    pins = context.get('pinned_insights', [])

    findings_summary = ''
    if findings:
        findings_summary = '\n'.join(
            f"- {f.get('headline', 'Finding')}: {f.get('recommendation', '')}"
            for f in findings[:10]
        )
    else:
        findings_summary = 'No significant findings were identified.'

    pins_summary = ''
    if pins:
        pins_summary = '\n'.join(
            f"- {p.get('source_question', 'Insight')}: {p.get('content', '')[:200]}"
            for p in pins[:5]
        )
    else:
        pins_summary = 'No pinned insights available.'

    prompt = f"""
You are writing the Recommendations section of a survey analysis report.
Synthesize the key findings and pinned insights below into 3-5 concrete,
actionable recommendations.  Present them as a numbered list.

Key findings and their individual recommendations:
{findings_summary}

Pinned insights from analyst exploration:
{pins_summary}

Each recommendation should be specific, practical, and written for a decision-maker.
Avoid statistical jargon. Output only the numbered list as markdown (no heading).
""".strip()
    return await _llm_section(prompt, max_tokens=1000)


# ── Conclusion ────────────────────────────────────

async def _generate_conclusion(context: dict) -> str:
    prompt = f"""
You are writing the Conclusion section of a survey analysis report.
Write ONE short paragraph (3-5 sentences) that:
  - Restates the main takeaway from the analysis
  - Acknowledges the scope of the survey ({context.get('total_responses', 'N/A')} responses)
  - Invites the reader to explore specific findings or reach out with follow-up
    questions

Survey: {context.get('survey_title', 'Untitled Survey')}
Number of significant findings: {context.get('significant_findings_count', 0)}
Analysis summary: {context.get('analysis_summary', 'No summary available.')}

Output only the paragraph as markdown (no heading).
""".strip()
    return await _llm_section(prompt, max_tokens=400)


# ── Generator mapping ────────────────────────────

_GENERATORS: dict[str, callable] = {
    'title_page': _generate_title_page,
    'executive_summary': _generate_executive_summary,
    'methodology': _generate_methodology,
    'key_findings': _generate_key_findings,
    'descriptive_statistics': _generate_descriptive_statistics,
    'quality_assessment': _generate_quality_assessment,
    'pinned_insights': _generate_pinned_insights,
    'recommendations': _generate_recommendations,
    'conclusion': _generate_conclusion,
}


# ── Orchestrators ─────────────────────────────────

async def generate_full_report(context: dict) -> dict[str, str]:
    """
    Generate all report sections concurrently.
    Returns {section_key: markdown_string} for all sections in SECTION_KEYS.

    Concurrency is capped at 4 simultaneous LLM calls via a semaphore to avoid
    rate-limiting and to keep request latency manageable.
    """
    semaphore = asyncio.Semaphore(4)

    async def _run_with_sem(key: str, fn) -> tuple[str, str]:
        async with semaphore:
            logger.info('Generating report section: %s', key)
            result = await fn(context)
            logger.info('Completed report section: %s (%d chars)', key, len(result))
            return key, result

    results = await asyncio.gather(
        *[_run_with_sem(k, fn) for k, fn in _GENERATORS.items()]
    )
    return dict(results)


async def regenerate_section(section_key: str, context: dict) -> str:
    """
    Regenerate a single section by key.
    Raises ValueError if the section key is unknown.
    """
    if section_key not in _GENERATORS:
        raise ValueError(f'Unknown section: {section_key}')

    logger.info('Regenerating report section: %s', section_key)
    return await _GENERATORS[section_key](context)
