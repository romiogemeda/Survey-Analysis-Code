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

        messages = [
            {"role": "system", "content": request.system_prompt},
            {"role": "user", "content": request.user_prompt},
        ]

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
        
        # Get keys from environment
        or_key = os.getenv('OPENROUTER_API_KEY')
        google_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
        
        # Clean keys (ignore placeholders)
        if or_key == "your_key_here": or_key = None
        if google_key == "your_key_here": google_key = None
        
        # Heuristic: if model name has no provider prefix and we have an OR key, assume OpenRouter
        # but only if it's not a known direct provider prefix like 'gemini/' or 'gpt-'
        actual_model = model
        api_key = None
        
        if "/" not in model:
            # Simple model name like "gemini-2.0-flash"
            if or_key:
                actual_model = f"openrouter/{model}"
                api_key = or_key
            elif google_key and model.startswith("gemini"):
                actual_model = f"gemini/{model}"
                api_key = google_key
        elif model.startswith("openrouter/"):
            api_key = or_key
        elif model.startswith("gemini/"):
            api_key = google_key
        else:
            # Fallback: if it's "google/..." it's often OpenRouter's naming convention
            if model.startswith("google/") and or_key:
                actual_model = f"openrouter/{model}"
                api_key = or_key

        if not api_key:
            logger.error("No API key found for model: %s. Please check your .env file.", actual_model)
            raise ValueError(f"Missing API key for {actual_model}")

        logger.info("Calling LLM: %s", actual_model)
        
        response = await acompletion(
            model=actual_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=self._settings.request_timeout,
            num_retries=self._settings.max_retries,
            api_key=api_key,
        )
        content = response.choices[0].message.content or ""
        usage = response.usage
        return LLMResponse(
            content=content,
            model_used=actual_model,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            total_tokens=usage.total_tokens if usage else 0,
        )


llm_gateway = LLMGateway()