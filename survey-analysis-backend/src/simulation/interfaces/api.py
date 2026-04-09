"""
Simulation Module — Public Interface.
FR-14 (Predefined Personas), FR-15 (Custom Personas),
FR-16 (Prompt Parsing), FR-17 (Simulation Output).
"""

import asyncio
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared_kernel import LLMRequest, PersonaType, get_db_session, llm_gateway, SubmissionRecord
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

class BatchItem(BaseModel):
    persona_id: UUID
    num_responses: int = 1

class RunBatchRequest(BaseModel):
    survey_schema_id: UUID
    items: list[BatchItem]


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
        from src.quality.interfaces.api import QualityService

        persona = await self._repo.get_persona(persona_id)
        if not persona:
            raise ValueError(f"Persona {persona_id} not found")

        questions_text = json.dumps(questions, indent=2)
        persona_desc = json.dumps(persona.parsed_parameters, indent=2)

        qual_service = QualityService(self._repo._session)

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

            # Note: QualityScorer._score_gibberish evaluates using fast regex heuristics.
            # If changed to invoke an LLM, this would double the per-response API cost.
            # Since it's heuristic, per-response scoring is safe and kept here.
            temp_sub = SubmissionRecord(
                survey_schema_id=survey_schema_id, 
                raw_responses=answers, 
                source_format="SIMULATION",
                is_valid=True
            )
            score_record = await qual_service.score_submission(temp_sub)

            results.append({
                "id": str(model.id),
                "persona_id": str(model.persona_id),
                "synthetic_answers": model.synthetic_answers,
                "is_simulated": True,
                "llm_model_used": model.llm_model_used,
                "quality_grade": score_record.grade,
                "quality_score": score_record.composite_score,
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

    async def delete_simulated_responses(self, survey_schema_id: UUID) -> int:
        return await self._repo.delete_all_for_schema(survey_schema_id)


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


@router.get("/responses/{survey_schema_id}")
async def get_simulated_responses(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = SimulationService(session)
    return await service.get_simulated_responses(survey_schema_id)


@router.delete("/responses/{survey_schema_id}")
async def delete_responses(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    service = SimulationService(session)
    count = await service.delete_simulated_responses(survey_schema_id)
    return {"deleted": count}

@router.post("/promote/{survey_schema_id}")
async def promote_responses(
    survey_schema_id: UUID, session: AsyncSession = Depends(get_db_session)
):
    from src.ingestion.interfaces.api import IngestionService
    sim_service = SimulationService(session)
    ing_service = IngestionService(session)
    
    responses = await sim_service.get_simulated_responses(survey_schema_id)
    
    promoted = 0
    skipped = 0
    for resp in responses:
        # Construct a dict from response data and inject _is_simulated: True
        data = dict(resp["synthetic_answers"])
        data["_is_simulated"] = True
        
        sub = SubmissionRecord(
            survey_schema_id=survey_schema_id,
            raw_responses=data,
            source_format="SIMULATION",
            is_valid=True
        )
        await ing_service.save_submission(sub)
        promoted += 1
        
    return {"promoted": promoted, "skipped": skipped}


@router.post("/run-batch")
async def run_batch(
    req: RunBatchRequest, session: AsyncSession = Depends(get_db_session)
):
    # Set FastAPI's request timeout to at least 300 seconds for this endpoint.
    from src.ingestion.interfaces.api import IngestionService
    from src.ingestion.internals.repository import IngestionRepository
    from src.quality.interfaces.api import QualityService

    ing = IngestionService(session)
    schema = await ing.get_survey_schema(req.survey_schema_id)
    if not schema:
        raise HTTPException(404, "Survey schema not found")

    questions = [q.model_dump() if hasattr(q, 'model_dump') else q
                 for q in schema.question_definitions]
    questions_text = json.dumps(questions, indent=2)

    service = SimulationService(session)

    # Pre-fetch personas to avoid DB lookups inside async tasks
    personas = {}
    for item in req.items:
        if item.persona_id not in personas:
            p = await service.get_persona(item.persona_id)
            if not p:
                raise HTTPException(404, f"Persona {item.persona_id} not found")
            personas[item.persona_id] = p

    sem = asyncio.Semaphore(5)

    async def _simulate_one(persona_id: UUID) -> dict:
        p_desc = json.dumps(personas[persona_id]["parsed_parameters"], indent=2)
        async with sem:
            response = await llm_gateway.complete(LLMRequest(
                system_prompt=(
                    f"You are simulating a survey respondent with these traits:\n{p_desc}\n\n"
                    "Answer each question as this persona would. Return ONLY a JSON object "
                    "mapping question_id to your answer. No explanation."
                ),
                user_prompt=f"Answer these survey questions:\n{questions_text}",
            ))
            try:
                answers = _extract_json(response.content)
            except (json.JSONDecodeError, ValueError):
                logger.warning("Failed to parse simulation JSON")
                answers = {"parse_error": response.content}

            return {
                "survey_schema_id": req.survey_schema_id,
                "persona_id": persona_id,
                "synthetic_answers": answers,
                "llm_model_used": response.model_used,
            }

    # Gather all LLM simulation tasks
    tasks = []
    for item in req.items:
        for _ in range(item.num_responses):
            tasks.append(_simulate_one(item.persona_id))

    simulated_data = await asyncio.gather(*tasks)

    # 1. Save all SimulatedResponseModels in Simulation DB (batch insert)
    repo = service._repo
    sim_models = await repo.save_simulated_responses(simulated_data)

    # Form the response objects
    output_responses = []
    for model in sim_models:
        output_responses.append({
            "id": str(model.id),
            "persona_id": str(model.persona_id),
            "synthetic_answers": model.synthetic_answers,
            "is_simulated": True,
            "llm_model_used": model.llm_model_used,
        })

    # 2. Data promotion to analysis (batch insert as Submissions)
    ing_repo = IngestionRepository(session)
    promoted_submissions = []
    
    for opt in output_responses:
        sub = SubmissionRecord(
            survey_schema_id=req.survey_schema_id,
            raw_responses=opt["synthetic_answers"],
            source_format="SIMULATION",
            is_valid=True,
        )
        promoted_submissions.append(sub)

    await ing_repo.save_submissions(promoted_submissions)

    # 3. Auto quality scoring
    qual_service = QualityService(session)
    scores = await qual_service.score_submissions_batch(promoted_submissions)

    # Attach quality metadata to the synthetic responses
    for r, score in zip(output_responses, scores):
        r["quality_metadata"] = score.model_dump(mode="json") if hasattr(score, "model_dump") else score
        if hasattr(score, "submission_id"):
            r["submission_id"] = str(score.submission_id)

    return output_responses