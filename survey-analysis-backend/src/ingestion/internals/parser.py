"""Ingestion — Internal Parser. FR-02: Real-time parsing of JSON/CSV."""

import csv
import io
import json
import logging
from fastapi import UploadFile

logger = logging.getLogger(__name__)


async def parse_upload(file: UploadFile) -> list[dict]:
    """Parse an uploaded file into a list of response dicts."""
    content = await file.read()
    decoded = content.decode("utf-8")

    filename = file.filename or ""
    if filename.lower().endswith(".csv"):
        records = _parse_csv(decoded)
    else:
        records = _parse_json(decoded)

    logger.info("Parsed %d records from %s", len(records), filename)
    return records


def _parse_json(content: str) -> list[dict]:
    data = json.loads(content)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    raise ValueError(f"Expected JSON array or object, got {type(data).__name__}")


def _parse_csv(content: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(content))
    return [dict(row) for row in reader]
