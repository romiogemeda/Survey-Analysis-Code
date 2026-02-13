"""Ingestion — Internal Validator. FR-03: Validate incoming data structure."""

import logging
from uuid import UUID

logger = logging.getLogger(__name__)


def validate_structure(record: dict, survey_schema_id: UUID) -> bool:
    """Validate a single raw response record."""
    if not isinstance(record, dict) or len(record) == 0:
        return False

    for key, value in record.items():
        if not isinstance(key, str):
            return False
        if value is not None and not isinstance(value, (str, int, float, bool, list)):
            return False

    return True