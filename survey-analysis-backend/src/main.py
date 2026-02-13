"""
Survey Analysis Engine — Main Application Entry Point.
Single deployable Modular Monolith. All module routers registered here.

Run: uvicorn src.main:app --reload --port 8000
"""

import os
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Load environment variables from .env file BEFORE importing any modules
load_dotenv()

# Configure litellm to use OpenRouter
import litellm
litellm.drop_params = True  # Drop unsupported params instead of erroring
# Set OpenRouter API key for litellm
if os.getenv('OPENROUTER_API_KEY'):
    os.environ['OPENROUTER_API_KEY'] = os.getenv('OPENROUTER_API_KEY')
    litellm.api_key = os.getenv('OPENROUTER_API_KEY')
    # Enable verbose logging for debugging (can be disabled in production)
    # litellm.set_verbose = True

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import get_settings

# IMPORTANT: Import all ORM models so they register with Base.metadata
# This ensures create_all_tables() can create all tables.
import src.ingestion.models.orm       # noqa: F401
import src.quality.models.orm         # noqa: F401
import src.analytics.models.orm       # noqa: F401
import src.simulation.models.orm      # noqa: F401
import src.chat_assistant.models.orm  # noqa: F401

from src.shared_kernel import create_all_tables

# Module routers — imported from public interfaces ONLY
from src.ingestion.interfaces.api import router as ingestion_router
from src.quality.interfaces.api import router as quality_router
from src.analytics.interfaces.api import router as analytics_router
from src.visualization.interfaces.api import router as visualization_router
from src.simulation.interfaces.api import router as simulation_router
from src.chat_assistant.interfaces.api import router as chat_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info("Starting %s", settings.app_name)

    # Create all database schemas and tables
    await create_all_tables()
    logger.info("Database tables initialized")

    yield

    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "AI-Powered Survey Analysis Dashboard — Module 2 of 4. "
        "Real-time analytics, quality scoring, AI simulation, "
        "and natural language querying."
    ),
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register module routers
app.include_router(ingestion_router)
app.include_router(quality_router)
app.include_router(analytics_router)
app.include_router(visualization_router)
app.include_router(simulation_router)
app.include_router(chat_router)


@app.get("/health", tags=["System"])
async def health():
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": "0.1.0",
        "modules": [
            "ingestion", "quality", "analytics",
            "visualization", "simulation", "chat_assistant",
        ],
    }


@app.get("/", tags=["System"])
async def root():
    return {"message": settings.app_name, "docs": "/api/docs"}