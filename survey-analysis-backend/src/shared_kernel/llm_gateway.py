"""
Shared Kernel — LLM Gateway.
The ONLY authorized interface to LLM providers in the entire system.
FF-03 enforces no module imports openai/anthropic directly.
"""

import logging
from pydantic import BaseModel
from litellm import acompletion
from config.settings import get_settings

logger = logging.getLogger(__name__)


class LLMRequest(BaseModel):
    system_prompt: str
    user_prompt: str
    messages: list[dict] | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None


class LLMResponse(BaseModel):
    content: str
    model_used: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMGateway:
    """
    Centralized LLM access. All modules MUST use this for LLM calls.
    Provides retry logic and fallback models.
    """

    def __init__(self) -> None:
        self._settings = get_settings().llm

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.model or self._settings.default_model
        temperature = request.temperature or self._settings.temperature
        max_tokens = request.max_tokens or self._settings.max_tokens

        messages = [{"role": "system", "content": request.system_prompt}]
        if request.messages:
            messages.extend(request.messages)
        messages.append({"role": "user", "content": request.user_prompt})

        # Try primary model
        try:
            return await self._call(model, messages, temperature, max_tokens)
        except Exception as primary_err:
            logger.warning("Primary LLM failed (%s), trying fallback: %s", model, primary_err)

        # Try fallback model
        try:
            return await self._call(
                self._settings.fallback_model, messages, temperature, max_tokens
            )
        except Exception as fallback_err:
            raise RuntimeError(
                f"All LLM models failed. Primary: {primary_err}. Fallback: {fallback_err}"
            ) from fallback_err

    async def _call(
        self, model: str, messages: list[dict], temperature: float, max_tokens: int
    ) -> LLMResponse:
        import os
        # Get API key for OpenRouter models
        api_key = os.getenv('OPENROUTER_API_KEY') if model.startswith('openrouter/') else None
        
        response = await acompletion(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=self._settings.request_timeout,
            num_retries=self._settings.max_retries,
            api_key=api_key,  # Pass API key explicitly for OpenRouter
        )
        content = response.choices[0].message.content or ""
        usage = response.usage
        return LLMResponse(
            content=content,
            model_used=model,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            total_tokens=usage.total_tokens if usage else 0,
        )


llm_gateway = LLMGateway()