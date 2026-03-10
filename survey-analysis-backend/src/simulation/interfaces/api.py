"""
Simulation Module — Public Interface.
FR-14 (Predefined Personas), FR-15 (Custom Personas),
FR-16 (Prompt Parsing), FR-17 (Simulation Output).
"""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import LLMRequest, PersonaType, JobStatus, get_db_session, llm_gateway
from src.simulation.internals.repository import SimulationRepository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/simulation", tags=["Simulation"])


def _extract_json(text: str) -> dict:
    """Strip markdown code fences (```json ... ```) and parse JSON."""
    import re
    # Remove ```json ... ``` or ``` ... ``` wrappers if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())
    return json.loads(cleaned)


# ── DTOs ──────────────────────────────────────────

class CreatePersonaRequest(BaseModel):
    name: str
    description_prompt: str


class RunSimulationRequest(BaseModel):
    survey_schema_id: UUID
    persona_id: UUID
    num_responses: int = 1


class BulkSimulationRequest(BaseModel):
    survey_schema_id: UUID
    persona_id: UUID
    num_responses: int


# ── Default Persona Library (FR-14) ──────────────

DEFAULT_PERSONAS = [
    {"name": "Average User", "type": PersonaType.PREDEFINED, "parsed_parameters": {
        "age": 35, "patience_level": 6, "tech_savviness": 5,
        "personality_traits": ["moderate", "practical"],
    }},
    {"name": "Impatient Millennial", "type": PersonaType.PREDEFINED, "parsed_parameters": {
        "age": 28, "patience_level": 2, "tech_savviness": 8,
        "personality_traits": ["impatient", "tech-savvy", "opinionated"],
    }},
    {"name": "Careful Senior", "type": PersonaType.PREDEFINED, "parsed_parameters": {
        "age": 68, "patience_level": 9, "tech_savviness": 3,
        "personality_traits": ["thorough", "cautious", "detailed"],
    }},
    {"name": "Disengaged Respondent", "type": PersonaType.PREDEFINED, "parsed_parameters": {
        "age": 22, "patience_level": 1, "tech_savviness": 7,
        "personality_traits": ["rushed", "disinterested"],
    }},
]


class SimulationService:
    """Public simulation service."""

    def __init__(self, session: AsyncSession) -> None:
        self._db = session
        self._repo = SimulationRepository(session)

    async def seed_default_personas(self) -> list[dict]:
        """Seed the predefined persona library into the database."""
        results = []
        for p in DEFAULT_PERSONAS:
            model = await self._repo.save_persona(
                name=p["name"], persona_type=p["type"],
                description_prompt=None,
                parsed_parameters=p["parsed_parameters"],
            )
            results.append({"id": str(model.id), "name": model.name, "type": model.type})
        return results

    async def create_custom_persona(self, req: CreatePersonaRequest) -> dict:
        """FR-15/FR-16: Parse NL persona description via LLM, then persist."""
        response = await llm_gateway.complete(LLMRequest(
            system_prompt=(
                "Parse the persona description into structured JSON. Include: "
                "age (int), gender (str), personality_traits (list[str]), "
                "patience_level (1-10), tech_savviness (1-10). "
                "Return ONLY valid JSON, no explanation."
            ),
            user_prompt=f"Parse this persona: {req.description_prompt}",
        ))

        try:
            parsed = _extract_json(response.content)
        except (json.JSONDecodeError, ValueError):
            logger.warning("Failed to parse persona JSON from LLM response")
            parsed = {"raw_description": req.description_prompt}

        model = await self._repo.save_persona(
            name=req.name, persona_type=PersonaType.CUSTOM,
            description_prompt=req.description_prompt,
            parsed_parameters=parsed,
        )
        return {
            "id": str(model.id), "name": model.name, "type": model.type,
            "parsed_parameters": model.parsed_parameters,
        }

    async def list_personas(self) -> list[dict]:
        models = await self._repo.list_personas()
        return [
            {"id": str(m.id), "name": m.name, "type": m.type,
             "description_prompt": m.description_prompt,
             "parsed_parameters": m.parsed_parameters}
            for m in models
        ]

    async def get_persona(self, persona_id: UUID) -> dict | None:
        m = await self._repo.get_persona(persona_id)
        if not m:
            return None
        return {
            "id": str(m.id), "name": m.name, "type": m.type,
            "description_prompt": m.description_prompt,
            "parsed_parameters": m.parsed_parameters,
        }

    async def run_simulation(
        self, survey_schema_id: UUID, persona_id: UUID,
        questions: list[dict], num_responses: int = 1
    ) -> list[dict]:
        """FR-17: Generate synthetic responses. Always marked is_simulated=True."""
        persona = await self._repo.get_persona(persona_id)
        if not persona:
            raise ValueError(f"Persona {persona_id} not found")

        questions_text = json.dumps(questions, indent=2)
        persona_desc = json.dumps(persona.parsed_parameters, indent=2)

        results = []
        for i in range(num_responses):
            response = await llm_gateway.complete(LLMRequest(
                system_prompt=(
                    f"You are simulating a survey respondent with these traits:\n{persona_desc}\n\n"
                    "Answer each question as this persona would. Return ONLY a JSON object "
                    "mapping question_id to your answer. No explanation."
                ),
                user_prompt=f"Answer these survey questions:\n{questions_text}",
            ))

            try:
                answers = _extract_json(response.content)
            except (json.JSONDecodeError, ValueError):
                logger.warning("Failed to parse simulation JSON for response %d", i)
                answers = {"parse_error": response.content}

            model = await self._repo.save_simulated_response(
                survey_schema_id=survey_schema_id,
                persona_id=persona_id,
                synthetic_answers=answers,
                llm_model_used=response.model_used,
            )
            results.append({
                "id": str(model.id),
                "persona_id": str(model.persona_id),
                "synthetic_answers": model.synthetic_answers,
                "is_simulated": True,
                "llm_model_used": model.llm_model_used,
            })

        logger.info("Generated %d simulated responses for persona %s", len(results), persona.name)
        return results

    async def get_simulated_responses(self, survey_schema_id: UUID) -> list[dict]:
        models = await self._repo.get_simulated_responses(survey_schema_id)
        return [
            {"id": str(m.id), "persona_id": str(m.persona_id),
             "synthetic_answers": m.synthetic_answers,
             "is_simulated": m.is_simulated, "llm_model_used": m.llm_model_used}
            for m in models
        ]

    # ── Job Management ────────────────────────────

    async def start_bulk_simulation(self, req: BulkSimulationRequest) -> dict:
        # 1. Create Job record
        job = await self._repo.create_job(req.survey_schema_id, req.num_responses)
        
        # 2. Trigger Celery task
        # We import here to avoid circular dependencies
        from workers.simulation_tasks import bulk_generate_simulation_task
        bulk_generate_simulation_task.delay(
            str(req.survey_schema_id), str(req.persona_id), str(job.id)
        )
        
        return {
            "job_id": str(job.id),
            "status": job.status,
            "total_requested": job.total_requested
        }

    async def get_job_status(self, job_id: UUID) -> dict:
        job = await self._repo.get_job(job_id)
        if not job:
            raise HTTPException(404, "Job not found")
            
        return {
            "job_id": str(job.id),
            "status": job.status,
            "total_requested": job.total_requested,
            "processed_count": job.processed_count,
            "error_message": job.error_message,
            "updated_at": job.updated_at.isoformat()
        }

    # ── Persona Extraction ───────────────────────

    async def extract_personas_from_data(self, survey_schema_id: UUID) -> list[dict]:
        """Analyze real survey data and extract representative AI personas."""
        from src.ingestion.interfaces.api import IngestionService
        ing = IngestionService(self._db)
        
        # Fetch sample of real submissions (e.g., top 100)
        submissions = await ing.get_submissions(survey_schema_id, valid_only=True)
        if not submissions:
            raise HTTPException(400, "No real survey data found to extract personas from.")
            
        sample_data = [s.raw_responses for s in submissions[:100]]
        
        response = await llm_gateway.complete(LLMRequest(
            system_prompt=(
                "Analyze the provided survey response data and identify 3-4 representative "
                "personas that capture the diverse viewpoints and demographics in the data. "
                "For each persona, provide:\n"
                "1. name: A catchy name for the persona.\n"
                "2. description_prompt: A descriptive paragraph about who they are.\n"
                "3. parsed_parameters: A JSON object with age (int), gender (str), "
                "personality_traits (list[str]), patience_level (1-10), tech_savviness (1-10).\n\n"
                "Return ONLY a JSON array of objects."
            ),
            user_prompt=f"Extract personas from this survey data:\n{json.dumps(sample_data)}",
        ))
        
        try:
            extracted_personas = _extract_json(response.content)
            if not isinstance(extracted_personas, list):
                extracted_personas = [extracted_personas]
        except (json.JSONDecodeError, ValueError):
            logger.error("Failed to parse extracted personas JSON")
            raise HTTPException(500, "AI failed to synthesize personas. Please try again.")

        results = []
        for p in extracted_personas:
            model = await self._repo.save_persona(
                name=p.get("name", "Extracted Persona"),
                persona_type=PersonaType.EXTRACTED,
                description_prompt=p.get("description_prompt"),
                parsed_parameters=p.get("parsed_parameters", {})
            )
            results.append({
                "id": str(model.id),
                "name": model.name,
                "type": model.type,
                "description_prompt": model.description_prompt
            })
            
        return results


# ── Routes ────────────────────────────────────────

@router.post("/personas/seed")
async def seed_personas(session: AsyncSession = Depends(get_db_session)):
    service = SimulationService(session)
    return await service.seed_default_personas()


@router.get("/personas")
async def list_personas(session: AsyncSession = Depends(get_db_session)):
    service = SimulationService(session)
    return await service.list_personas()


@router.post("/personas")
async def create_persona(
    req: CreatePersonaRequest, session: AsyncSession = Depends(get_db_session)
):
    service = SimulationService(session)
    return await service.create_custom_persona(req)


@router.get("/personas/{persona_id}")
async def get_persona(persona_id: UUID, session: AsyncSession = Depends(get_db_session)):
    service = SimulationService(session)
    persona = await service.get_persona(persona_id)
    if not persona:
        raise HTTPException(404, "Persona not found")
    return persona


@router.post("/personas/extract/{survey_schema_id}")
async def extract_personas(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = SimulationService(session)
    return await service.extract_personas_from_data(survey_schema_id)


@router.post("/run")
async def run_simulation(
    req: RunSimulationRequest, session: AsyncSession = Depends(get_db_session)
):
    from src.ingestion.interfaces.api import IngestionService
    ing = IngestionService(session)
    schema = await ing.get_survey_schema(req.survey_schema_id)
    if not schema:
        raise HTTPException(404, "Survey schema not found")

    questions = [q.model_dump() if hasattr(q, 'model_dump') else q
                 for q in schema.question_definitions]

    service = SimulationService(session)
    return await service.run_simulation(
        req.survey_schema_id, req.persona_id, questions, req.num_responses
    )


@router.post("/jobs")
async def start_bulk_simulation(
    req: BulkSimulationRequest, session: AsyncSession = Depends(get_db_session)
):
    service = SimulationService(session)
    return await service.start_bulk_simulation(req)


@router.get("/jobs/{job_id}")
async def get_job_status(
    job_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = SimulationService(session)
    return await service.get_job_status(job_id)


@router.get("/responses/{survey_schema_id}")
async def get_simulated_responses(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = SimulationService(session)
    return await service.get_simulated_responses(survey_schema_id)