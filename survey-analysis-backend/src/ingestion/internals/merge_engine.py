"""
Ingestion — Internal Merge Engine.

FR-19: Merge submissions from different schema versions into a unified view.
Builds a field mapping across versions and produces a reconciled dataset.

This module is INTERNAL. No external module may import from here (FF-01).
"""

import logging
from src.shared_kernel import QuestionDefinition, SurveySchemaRecord, SubmissionRecord

logger = logging.getLogger(__name__)


class FieldMapping:
    """Maps question_ids across two schema versions."""

    def __init__(self) -> None:
        # field_name → field_name (identity for shared, renamed for matched)
        self.matched: dict[str, str] = {}  # old_id → new_id
        self.only_in_source: list[str] = []
        self.only_in_target: list[str] = []

    def to_dict(self) -> dict:
        return {
            "matched": self.matched,
            "only_in_source": self.only_in_source,
            "only_in_target": self.only_in_target,
        }


def build_field_mapping(
    source_schema: SurveySchemaRecord,
    target_schema: SurveySchemaRecord,
) -> FieldMapping:
    """
    Build a field mapping between two schema versions.

    Matching strategy:
    1. Exact question_id match → direct mapping.
    2. Same question text (case-insensitive) → treat as renamed field.
    3. Remaining → only_in_source / only_in_target.
    """
    mapping = FieldMapping()

    source_qs: dict[str, QuestionDefinition] = {
        q.question_id: q for q in source_schema.question_definitions
    }
    target_qs: dict[str, QuestionDefinition] = {
        q.question_id: q for q in target_schema.question_definitions
    }

    # Pass 1: exact ID match
    matched_source_ids: set[str] = set()
    matched_target_ids: set[str] = set()

    for src_id in source_qs:
        if src_id in target_qs:
            mapping.matched[src_id] = src_id
            matched_source_ids.add(src_id)
            matched_target_ids.add(src_id)

    # Pass 2: text-based fuzzy match for unmatched fields
    unmatched_source = {
        sid: q for sid, q in source_qs.items() if sid not in matched_source_ids
    }
    unmatched_target = {
        tid: q for tid, q in target_qs.items() if tid not in matched_target_ids
    }

    # Build text→id index for target
    target_text_index: dict[str, str] = {
        q.text.strip().lower(): tid
        for tid, q in unmatched_target.items()
    }

    for src_id, src_q in unmatched_source.items():
        normalized_text = src_q.text.strip().lower()
        if normalized_text in target_text_index:
            tgt_id = target_text_index.pop(normalized_text)
            mapping.matched[src_id] = tgt_id
            matched_source_ids.add(src_id)
            matched_target_ids.add(tgt_id)

    # Pass 3: collect leftovers
    mapping.only_in_source = sorted(
        sid for sid in source_qs if sid not in matched_source_ids
    )
    mapping.only_in_target = sorted(
        tid for tid in target_qs if tid not in matched_target_ids
    )

    logger.info(
        "Field mapping built: %d matched, %d source-only, %d target-only",
        len(mapping.matched), len(mapping.only_in_source), len(mapping.only_in_target),
    )
    return mapping


def merge_submissions(
    source_submissions: list[SubmissionRecord],
    target_submissions: list[SubmissionRecord],
    field_mapping: FieldMapping,
    target_schema: SurveySchemaRecord,
) -> list[dict]:
    """
    Merge submissions from two schema versions into a unified list of dicts.

    Each output row uses the target schema's field names. Source submissions
    are remapped using the field_mapping. Fields only in source are preserved
    with a 'v{N}_' prefix. Fields only in target get None for source records.

    Returns a list of unified response dicts (not persisted — caller decides).
    """
    target_field_ids = {q.question_id for q in target_schema.question_definitions}
    unified: list[dict] = []

    # Process source submissions: remap field names
    for sub in source_submissions:
        row: dict = {
            "_submission_id": str(sub.id),
            "_source_version": "source",
            "_received_at": sub.received_at.isoformat(),
        }
        raw = sub.raw_responses

        for old_id, new_id in field_mapping.matched.items():
            if old_id in raw:
                row[new_id] = raw[old_id]

        # Preserve source-only fields with prefix
        for field in field_mapping.only_in_source:
            if field in raw:
                row[f"_src_{field}"] = raw[field]

        # Fill target-only fields with None
        for field in field_mapping.only_in_target:
            row.setdefault(field, None)

        unified.append(row)

    # Process target submissions: pass through directly
    for sub in target_submissions:
        row = {
            "_submission_id": str(sub.id),
            "_source_version": "target",
            "_received_at": sub.received_at.isoformat(),
        }
        row.update(sub.raw_responses)

        # Fill source-only fields with None
        for field in field_mapping.only_in_source:
            row.setdefault(f"_src_{field}", None)

        unified.append(row)

    logger.info(
        "Merged %d submissions (%d source + %d target)",
        len(unified), len(source_submissions), len(target_submissions),
    )
    return unified