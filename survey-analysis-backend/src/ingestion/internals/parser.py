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

    # Filter out completely empty records (e.g. trailing newlines in CSV)
    filtered = [r for r in records if any(v is not None and str(v).strip() != "" for v in r.values())]

    logger.info("Parsed %d records (filtered from %d) from %s", len(filtered), len(records), filename)
    return filtered


def _parse_json(content: str) -> list[dict]:
    data = json.loads(content)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    raise ValueError(f"Expected JSON array or object, got {type(data).__name__}")


def _parse_csv(content: str) -> list[dict]:
    # Use io.StringIO to treat the string as a file
    f = io.StringIO(content)
    reader = csv.DictReader(f)
    
    # Clean headers: strip whitespace and double-quotes
    if reader.fieldnames:
        reader.fieldnames = [name.strip().strip('"').strip("'") for name in reader.fieldnames]
    
    records = []
    for row in reader:
        # Clean values: strip whitespace and quotes
        cleaned_row = {
            k: (v.strip().strip('"').strip("'") if isinstance(v, str) else v)
            for k, v in row.items()
        }
        records.append(cleaned_row)
    return records
