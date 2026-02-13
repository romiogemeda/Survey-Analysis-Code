"""
Application Configuration.
Uses pydantic-settings to load from environment variables with sensible defaults.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings


class DatabaseSettings(BaseSettings):
    url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/survey_analysis"
    echo: bool = False
    pool_size: int = 20
    max_overflow: int = 10
    model_config = {"env_prefix": "DB_"}


class RedisSettings(BaseSettings):
    url: str = "redis://localhost:6379/0"
    cache_ttl_seconds: int = 300
    model_config = {"env_prefix": "REDIS_"}


class LLMSettings(BaseSettings):
    default_model: str = "gpt-4o"
    fallback_model: str = "claude-sonnet-4-20250514"
    temperature: float = 0.3
    max_tokens: int = 4096
    request_timeout: int = 30
    max_retries: int = 2
    model_config = {"env_prefix": "LLM_"}


class CelerySettings(BaseSettings):
    broker_url: str = "redis://localhost:6379/1"
    result_backend: str = "redis://localhost:6379/2"
    task_soft_time_limit: int = 120
    task_hard_time_limit: int = 180
    model_config = {"env_prefix": "CELERY_"}


class AppSettings(BaseSettings):
    app_name: str = "Survey Analysis Engine"
    debug: bool = False
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:3000"]
    sentry_dsn: str | None = None

    database: DatabaseSettings = DatabaseSettings()
    redis: RedisSettings = RedisSettings()
    llm: LLMSettings = LLMSettings()
    celery: CelerySettings = CelerySettings()
    model_config = {"env_prefix": "APP_"}


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()