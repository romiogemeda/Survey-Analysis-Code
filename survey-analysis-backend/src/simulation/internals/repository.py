"""Simulation — Internal Repository. Data access for simulation-owned tables."""

import logging
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.simulation.models.orm import PersonaModel, SimulatedResponseModel

logger = logging.getLogger(__name__)


class SimulationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Personas ─────────────────────────────────

    async def save_persona(
        self, name: str, persona_type: str, description_prompt: str | None,
        parsed_parameters: dict,
    ) -> PersonaModel:
        model = PersonaModel(
            name=name, type=persona_type,
            description_prompt=description_prompt,
            parsed_parameters=parsed_parameters,
        )
        self._session.add(model)
        await self._session.flush()
        return model

    async def get_persona(self, persona_id: UUID) -> PersonaModel | None:
        stmt = select(PersonaModel).where(PersonaModel.id == persona_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_personas(self) -> list[PersonaModel]:
        stmt = select(PersonaModel).order_by(PersonaModel.created_at.desc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    # ── Simulated Responses ──────────────────────

    async def save_simulated_response(
        self, survey_schema_id: UUID, persona_id: UUID,
        synthetic_answers: dict, llm_model_used: str,
    ) -> SimulatedResponseModel:
        model = SimulatedResponseModel(
            survey_schema_id=survey_schema_id,
            persona_id=persona_id,
            synthetic_answers=synthetic_answers,
            is_simulated=True,  # ALWAYS True — FF-05
            llm_model_used=llm_model_used,
        )
        self._session.add(model)
        await self._session.flush()
        return model

    async def get_simulated_responses(
        self, survey_schema_id: UUID
    ) -> list[SimulatedResponseModel]:
        stmt = select(SimulatedResponseModel).where(
            SimulatedResponseModel.survey_schema_id == survey_schema_id
        ).order_by(SimulatedResponseModel.generated_at.desc())
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_persona_responses(
        self, survey_schema_id: UUID, persona_id: UUID
    ) -> list[SimulatedResponseModel]:
        stmt = select(SimulatedResponseModel).where(
            SimulatedResponseModel.survey_schema_id == survey_schema_id,
            SimulatedResponseModel.persona_id == persona_id,
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())