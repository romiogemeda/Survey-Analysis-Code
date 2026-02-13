"""
Shared Kernel — Database Engine.
Async SQLAlchemy engine, session factory, and ORM base.
"""

from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from config.settings import get_settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models across all modules."""
    pass


_settings = get_settings()

engine = create_async_engine(
    _settings.database.url,
    echo=_settings.database.echo,
    pool_size=_settings.database.pool_size,
    max_overflow=_settings.database.max_overflow,
)

async_session_factory = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_all_tables() -> None:
    """Create all tables for all modules. Used in startup and tests."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        # Create schemas first
        for schema in ("ingestion", "quality", "analytics", "simulation", "chat"):
            await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        # Then create all ORM tables
        await conn.run_sync(Base.metadata.create_all)


async def drop_all_tables() -> None:
    """Drop all tables. Used in tests."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)