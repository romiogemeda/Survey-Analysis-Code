"""
Ingestion Module — Public Interface.
The ONLY entry point other modules use. FR-01, FR-02, FR-03, FR-18, FR-19.
"""

import logging
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import (
    SubmissionRecord, SurveySchemaRecord, QuestionDefinition,
    IngestionStatus, get_db_session,
)
from src.ingestion.internals.parser import parse_upload
from src.ingestion.internals.validator import validate_structure
from src.ingestion.internals.version_detector import detect_version_change, VersionChange
from src.ingestion.internals.merge_engine import build_field_mapping, merge_submissions
from src.ingestion.internals.repository import IngestionRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ingestion", tags=["Ingestion"])


# ── DTOs ──────────────────────────────────────────

class CreateSurveySchemaRequest(BaseModel):
    title: str
    version_id: int = 1
    question_definitions: list[QuestionDefinition] = []


class MergeSchemasRequest(BaseModel):
    source_schema_id: str
    target_schema_id: str


# ── Service ───────────────────────────────────────

class IngestionService:
    """Public service interface. Other modules call this, never the internals."""

    def __init__(self, session: AsyncSession) -> None:
        self._repo = IngestionRepository(session)

    async def create_survey_schema(self, req: CreateSurveySchemaRequest) -> SurveySchemaRecord:
        schema = SurveySchemaRecord(
            title=req.title,
            version_id=req.version_id,
            question_definitions=req.question_definitions,
        )
        await self._repo.save_survey_schema(schema)
        logger.info("Survey schema created: %s (v%d)", schema.title, schema.version_id)
        return schema

    async def get_survey_schema(self, schema_id: UUID) -> SurveySchemaRecord | None:
        return await self._repo.get_survey_schema(schema_id)

    async def list_survey_schemas(self) -> list[SurveySchemaRecord]:
        return await self._repo.list_survey_schemas()

    async def ingest_file(
        self, survey_schema_id: UUID, file: UploadFile
    ) -> dict:
        # FR-02: Parse immediately
        raw_records = await parse_upload(file)
        if not raw_records:
            raise ValueError("File contains no records")

        # FR-18: Detect version changes
        schema = await self._repo.get_survey_schema(survey_schema_id)
        version_change = None
        new_version_schema = None
        if schema and schema.question_definitions:
            change = detect_version_change(schema, raw_records)
            if change.has_changes:
                version_change = change.to_dict()
                # Auto-create a new schema version
                new_version_id = schema.version_id + 1
                new_questions = _build_updated_questions(schema, change)
                new_version_schema = SurveySchemaRecord(
                    title=schema.title,
                    version_id=new_version_id,
                    question_definitions=new_questions,
                )
                await self._repo.save_survey_schema(new_version_schema)
                survey_schema_id = new_version_schema.id
                logger.info(
                    "Auto-created schema v%d (%s) due to version change",
                    new_version_id, new_version_schema.id,
                )

        # FR-03: Validate structure
        submissions: list[SubmissionRecord] = []
        invalid_count = 0
        is_csv = (file.filename or "").lower().endswith(".csv")

        for record in raw_records:
            is_valid = validate_structure(record, survey_schema_id)
            # Extract respondent timestamps from Module 1's export
            started_at = _parse_timestamp(record.pop("started_at", None))
            completed_at = _parse_timestamp(record.pop("completed_at", None))
            submission = SubmissionRecord(
                survey_schema_id=survey_schema_id,
                raw_responses=record,
                source_format="CSV" if is_csv else "JSON",
                started_at=started_at,
                completed_at=completed_at,
                is_valid=is_valid,
            )
            submissions.append(submission)
            if not is_valid:
                invalid_count += 1

        # Persist
        await self._repo.save_submissions(submissions)

        status = (
            IngestionStatus.SUCCESS if invalid_count == 0
            else IngestionStatus.PARTIAL
        )
        await self._repo.log_ingestion(
            survey_schema_id=survey_schema_id,
            records_received=len(raw_records),
            records_valid=len(raw_records) - invalid_count,
            status=status,
        )

        logger.info(
            "Ingested %d records (%d valid) for schema %s",
            len(raw_records), len(raw_records) - invalid_count, survey_schema_id,
        )

        result = {
            "submissions": submissions,
            "total_records": len(submissions),
            "valid_records": len(submissions) - invalid_count,
        }
        if version_change:
            result["version_change"] = version_change
            result["new_schema_id"] = str(new_version_schema.id)
            result["new_version_id"] = new_version_schema.version_id
        return result

    # ── FR-18: Detect version change (standalone) ──

    async def detect_version(
        self, schema_id: UUID, records: list[dict]
    ) -> dict:
        """Detect whether incoming records diverge from the given schema."""
        schema = await self._repo.get_survey_schema(schema_id)
        if not schema:
            raise ValueError(f"Schema {schema_id} not found")
        change = detect_version_change(schema, records)
        return change.to_dict()

    # ── FR-19: Merge across versions ──────────────

    async def merge_versions(
        self, source_schema_id: UUID, target_schema_id: UUID
    ) -> dict:
        """Merge submissions from two schema versions into a unified dataset."""
        source_schema = await self._repo.get_survey_schema(source_schema_id)
        target_schema = await self._repo.get_survey_schema(target_schema_id)
        if not source_schema:
            raise ValueError(f"Source schema {source_schema_id} not found")
        if not target_schema:
            raise ValueError(f"Target schema {target_schema_id} not found")

        field_mapping = build_field_mapping(source_schema, target_schema)
        source_subs = await self._repo.get_submissions(source_schema_id, valid_only=True)
        target_subs = await self._repo.get_submissions(target_schema_id, valid_only=True)
        merged = merge_submissions(source_subs, target_subs, field_mapping, target_schema)

        return {
            "source_schema": {"id": str(source_schema_id), "version": source_schema.version_id},
            "target_schema": {"id": str(target_schema_id), "version": target_schema.version_id},
            "field_mapping": field_mapping.to_dict(),
            "total_merged_records": len(merged),
            "source_records": len(source_subs),
            "target_records": len(target_subs),
            "merged_data": merged,
        }

    async def get_version_chain(self, title: str) -> list[dict]:
        """Return all schema versions for a given survey title."""
        schemas = await self._repo.get_schemas_by_title(title)
        return [s.model_dump(mode="json") for s in schemas]

    async def get_submissions(
        self, survey_schema_id: UUID, valid_only: bool = True
    ) -> list[SubmissionRecord]:
        return await self._repo.get_submissions(survey_schema_id, valid_only)

    async def get_submission(self, submission_id: UUID) -> SubmissionRecord | None:
        return await self._repo.get_submission(submission_id)

    async def auto_ingest(self, file: UploadFile) -> dict:
        """
        Upload-first flow: parse file, infer a schema from the data, create it,
        then ingest all records against it. Returns the new schema + ingestion stats.
        """
        raw_records = await parse_upload(file)
        if not raw_records:
            raise ValueError("File contains no records")

        # Derive title from filename (strip extension)
        filename = file.filename or "Untitled Survey"
        title = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
        if not title:
            title = "Untitled Survey"

        # Reserved fields that are metadata, not survey questions
        reserved = {"started_at", "completed_at", "received_at", "id", "submission_id"}

        # Infer question definitions from the data
        from src.ingestion.internals.version_detector import _infer_data_type

        all_fields: set[str] = set()
        for record in raw_records:
            all_fields.update(record.keys())

        question_defs: list[QuestionDefinition] = []
        for field_name in sorted(all_fields - reserved):
            inferred_type = _infer_data_type(field_name, raw_records) or "NOMINAL"
            question_defs.append(QuestionDefinition(
                question_id=field_name,
                text=field_name.replace("_", " ").title(),
                data_type=inferred_type,
            ))

        # Create the schema
        schema = SurveySchemaRecord(
            title=title,
            version_id=1,
            question_definitions=question_defs,
        )
        await self._repo.save_survey_schema(schema)
        logger.info(
            "Auto-created schema '%s' with %d questions from %s",
            title, len(question_defs), filename,
        )

        # Ingest records against the new schema
        submissions: list[SubmissionRecord] = []
        invalid_count = 0
        is_csv = (file.filename or "").lower().endswith(".csv")

        for record in raw_records:
            is_valid = validate_structure(record, schema.id)
            started_at = _parse_timestamp(record.pop("started_at", None))
            completed_at = _parse_timestamp(record.pop("completed_at", None))
            submission = SubmissionRecord(
                survey_schema_id=schema.id,
                raw_responses=record,
                source_format="CSV" if is_csv else "JSON",
                started_at=started_at,
                completed_at=completed_at,
                is_valid=is_valid,
            )
            submissions.append(submission)
            if not is_valid:
                invalid_count += 1

        await self._repo.save_submissions(submissions)

        status = (
            IngestionStatus.SUCCESS if invalid_count == 0
            else IngestionStatus.PARTIAL
        )
        await self._repo.log_ingestion(
            survey_schema_id=schema.id,
            records_received=len(raw_records),
            records_valid=len(raw_records) - invalid_count,
            status=status,
        )

        logger.info(
            "Auto-ingested %d records (%d valid) into schema %s",
            len(raw_records), len(raw_records) - invalid_count, schema.id,
        )

        return {
            "schema": schema,
            "total_records": len(submissions),
            "valid_records": len(submissions) - invalid_count,
        }


# ── Routes ────────────────────────────────────────

@router.post("/schemas", status_code=201)
async def create_schema(
    req: CreateSurveySchemaRequest,
    session: AsyncSession = Depends(get_db_session),
):
    service = IngestionService(session)
    schema = await service.create_survey_schema(req)
    return schema.model_dump(mode="json")


@router.get("/schemas")
async def list_schemas(session: AsyncSession = Depends(get_db_session)):
    service = IngestionService(session)
    schemas = await service.list_survey_schemas()
    return [s.model_dump(mode="json") for s in schemas]


@router.get("/schemas/{schema_id}")
async def get_schema(schema_id: UUID, session: AsyncSession = Depends(get_db_session)):
    service = IngestionService(session)
    schema = await service.get_survey_schema(schema_id)
    if not schema:
        raise HTTPException(404, "Survey schema not found")
    return schema.model_dump(mode="json")


@router.post("/upload/{survey_schema_id}")
async def upload_data(
    survey_schema_id: UUID, file: UploadFile,
    session: AsyncSession = Depends(get_db_session),
):
    service = IngestionService(session)
    result = await service.ingest_file(survey_schema_id, file)
    response = {
        "status": "ingested",
        "total_records": result["total_records"],
        "valid_records": result["valid_records"],
    }
    if "version_change" in result:
        response["version_change"] = result["version_change"]
        response["new_schema_id"] = result["new_schema_id"]
        response["new_version_id"] = result["new_version_id"]
    return response


@router.post("/auto-ingest", status_code=201)
async def auto_ingest(
    file: UploadFile,
    session: AsyncSession = Depends(get_db_session),
):
    """Upload a file without a pre-existing schema. The system infers the schema
    from the data columns and types, creates it, then ingests all records."""
    service = IngestionService(session)
    result = await service.auto_ingest(file)
    return {
        "status": "auto_ingested",
        "schema": result["schema"].model_dump(mode="json"),
        "total_records": result["total_records"],
        "valid_records": result["valid_records"],
    }


@router.get("/submissions/{survey_schema_id}")
async def get_submissions(
    survey_schema_id: UUID, valid_only: bool = True,
    session: AsyncSession = Depends(get_db_session),
):
    service = IngestionService(session)
    subs = await service.get_submissions(survey_schema_id, valid_only)
    return [s.model_dump(mode="json") for s in subs]


@router.get("/submission/{submission_id}")
async def get_submission(
    submission_id: UUID, session: AsyncSession = Depends(get_db_session),
):
    service = IngestionService(session)
    sub = await service.get_submission(submission_id)
    if not sub:
        raise HTTPException(404, "Submission not found")
    return sub.model_dump(mode="json")


# ── FR-18: Version Detection ────────────────────

@router.get("/versions/{title}")
async def get_version_chain(
    title: str, session: AsyncSession = Depends(get_db_session),
):
    """FR-18: Get all schema versions for a survey title."""
    service = IngestionService(session)
    return await service.get_version_chain(title)


# ── FR-19: Merge Versions ───────────────────────

@router.post("/merge")
async def merge_schemas(
    req: MergeSchemasRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """FR-19: Merge submissions from two schema versions."""
    service = IngestionService(session)
    return await service.merge_versions(UUID(req.source_schema_id), UUID(req.target_schema_id))


# ── Helpers ──────────────────────────────────────

def _build_updated_questions(
    schema: SurveySchemaRecord, change: VersionChange
) -> list[QuestionDefinition]:
    """Build an updated question list from an existing schema + detected changes."""
    from src.ingestion.internals.version_detector import VersionChange as _VC

    # Start from existing questions, excluding removed ones
    updated: list[QuestionDefinition] = [
        q for q in schema.question_definitions
        if q.question_id not in change.removed_fields
    ]

    # Apply type changes
    for q in updated:
        if q.question_id in change.type_changes:
            _, new_type = change.type_changes[q.question_id]
            q = q.model_copy(update={"data_type": new_type})

    # Add new fields with inferred types
    for field in change.added_fields:
        updated.append(QuestionDefinition(
            question_id=field,
            text=field.replace("_", " ").title(),
            data_type="NOMINAL",  # default; version_detector inferred it already
        ))

    return updated


def _parse_timestamp(value: str | None) -> datetime | None:
    """Parse an ISO-format timestamp string from Module 1's export."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except (ValueError, TypeError):
        logger.warning("Could not parse timestamp: %s", value)
        return None