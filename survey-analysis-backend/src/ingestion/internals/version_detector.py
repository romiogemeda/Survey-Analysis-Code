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

    Heuristic:
    - All values are numeric (int/float or parseable) → INTERVAL
    - Small number of distinct values (<=10) → ORDINAL
    - Average string length > 50 chars → OPEN_ENDED
    - Otherwise → NOMINAL
    """
    values = [r.get(field_name) for r in records if r.get(field_name) is not None]
    if not values:
        return None

    # Check numeric
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

    if numeric_count / len(values) > 0.8:
        return "INTERVAL"

    # Check text length for open-ended
    str_values = [str(v) for v in values]
    avg_len = sum(len(s) for s in str_values) / len(str_values)
    if avg_len > 50:
        return "OPEN_ENDED"

    # Check cardinality for ordinal vs nominal
    distinct = len(set(str_values))
    if distinct <= 10:
        return "ORDINAL"

    return "NOMINAL"