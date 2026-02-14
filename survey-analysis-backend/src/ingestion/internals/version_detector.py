"""
Ingestion — Internal Version Detector.

FR-18: Automatically detect when incoming data diverges from the current
survey schema (new questions, removed questions, type changes).

This module is INTERNAL. No external module may import from here (FF-01).
"""

import logging
from src.shared_kernel import QuestionDefinition, SurveySchemaRecord

logger = logging.getLogger(__name__)


class VersionChange:
    """Describes how an incoming dataset differs from the active schema."""

    def __init__(self) -> None:
        self.added_fields: list[str] = []
        self.removed_fields: list[str] = []
        self.type_changes: dict[str, tuple[str, str]] = {}  # field → (old_type, new_type)

    @property
    def has_changes(self) -> bool:
        return bool(self.added_fields or self.removed_fields or self.type_changes)

    def to_dict(self) -> dict:
        return {
            "has_changes": self.has_changes,
            "added_fields": self.added_fields,
            "removed_fields": self.removed_fields,
            "type_changes": {
                k: {"old": v[0], "new": v[1]} for k, v in self.type_changes.items()
            },
        }


def detect_version_change(
    schema: SurveySchemaRecord,
    incoming_records: list[dict],
) -> VersionChange:
    """
    Compare the fields present in incoming records against the schema's
    question_definitions. Returns a VersionChange describing the diff.

    Detection logic:
    1. Collect all unique field names from the incoming batch.
    2. Compare against question_ids in the current schema.
    3. Fields in the data but not the schema → added_fields.
    4. Fields in the schema but absent from ALL records → removed_fields.
    5. Fields whose inferred type disagrees with the schema → type_changes.
    """
    change = VersionChange()

    if not schema.question_definitions or not incoming_records:
        return change

    # Build lookup from current schema
    schema_fields: dict[str, QuestionDefinition] = {
        q.question_id: q for q in schema.question_definitions
    }

    # Collect all unique field names across incoming records
    incoming_field_names: set[str] = set()
    for record in incoming_records:
        incoming_field_names.update(record.keys())

    # Added: in data but not in schema
    for field in sorted(incoming_field_names - schema_fields.keys()):
        change.added_fields.append(field)

    # Removed: in schema but absent from ALL records
    for field in sorted(schema_fields.keys() - incoming_field_names):
        change.removed_fields.append(field)

    # Type changes: infer type from data and compare to schema declaration
    for field_name, definition in schema_fields.items():
        if field_name not in incoming_field_names:
            continue  # already captured as removed
        inferred = _infer_data_type(field_name, incoming_records)
        if inferred and inferred != definition.data_type:
            change.type_changes[field_name] = (definition.data_type, inferred)

    if change.has_changes:
        logger.info(
            "Version change detected for schema '%s' v%d: "
            "+%d added, -%d removed, ~%d type changes",
            schema.title, schema.version_id,
            len(change.added_fields), len(change.removed_fields),
            len(change.type_changes),
        )

    return change


def _infer_data_type(field_name: str, records: list[dict]) -> str | None:
    """
    Infer the DataType of a field by sampling values from the records.

    Detection order (most specific first):
    1. BOOLEAN  — exactly 2 distinct values (yes/no, true/false, 0/1, etc.)
    2. DATETIME — >80% of values parse as ISO dates or common date formats
    3. IDENTIFIER — >85% of values are unique (names, emails, IDs)
    4. INTERVAL — >80% of values are numeric
    5. OPEN_ENDED — average string length > 50 chars
    6. ORDINAL — ≤10 distinct values
    7. NOMINAL — default fallback
    """
    import re
    from datetime import datetime as _dt

    values = [r.get(field_name) for r in records if r.get(field_name) is not None]
    if not values:
        return None

    str_values = [str(v).strip() for v in values]
    non_empty = [s for s in str_values if s]
    if not non_empty:
        return None

    distinct = set(non_empty)
    n = len(non_empty)

    # ── BOOLEAN: exactly 2 distinct values ──
    if len(distinct) == 2:
        # Confirm they look boolean-ish (not just 2 long paragraphs)
        avg_len = sum(len(s) for s in distinct) / 2
        if avg_len < 20:
            return "BOOLEAN"

    # ── DATETIME: try parsing common date formats ──
    date_count = 0
    _date_patterns = [
        r"^\d{4}-\d{2}-\d{2}",          # ISO: 2025-01-15...
        r"^\d{2}/\d{2}/\d{4}",           # US: 01/15/2025
        r"^\d{2}-\d{2}-\d{4}",           # EU: 15-01-2025
        r"^\d{4}/\d{2}/\d{2}",           # Alt ISO: 2025/01/15
    ]
    _date_re = re.compile("|".join(_date_patterns))
    for s in non_empty:
        if _date_re.match(s):
            date_count += 1
    if n > 0 and date_count / n > 0.8:
        return "DATETIME"

    # ── IDENTIFIER: high uniqueness ratio ──
    # Also catches emails and UUIDs via pattern check
    _email_re = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    email_count = sum(1 for s in non_empty if _email_re.match(s))
    if n > 0 and email_count / n > 0.5:
        return "IDENTIFIER"

    if n >= 5 and len(distinct) / n > 0.85:
        # High cardinality — likely an identifier column
        return "IDENTIFIER"

    # ── INTERVAL: mostly numeric ──
    numeric_count = 0
    for v in values:
        if isinstance(v, (int, float)):
            numeric_count += 1
        elif isinstance(v, str):
            try:
                float(v)
                numeric_count += 1
            except ValueError:
                pass
    if n > 0 and numeric_count / n > 0.8:
        return "INTERVAL"

    # ── OPEN_ENDED: long text ──
    avg_len = sum(len(s) for s in non_empty) / len(non_empty)
    if avg_len > 50:
        return "OPEN_ENDED"

    # ── ORDINAL: few distinct values ──
    if len(distinct) <= 10:
        return "ORDINAL"

    # ── NOMINAL: default ──
    return "NOMINAL"