# Survey Analysis Engine

AI-Powered Survey Analysis Dashboard — Module 2 of 4.

## Quick Start

### Prerequisites

- Python 3.12+
- PostgreSQL 16
- Redis 7

### Option A: Docker (Recommended)

```bash
docker compose up -d
```

This starts: PostgreSQL, Redis, FastAPI API server, and Celery worker.

API available at: http://localhost:8000
Swagger UI at: http://localhost:8000/api/docs

### Option B: Local Development

```bash
# 1. Install dependencies
pip install -e ".[dev]"

# 2. Start PostgreSQL and Redis (or use Docker for just these)
docker compose up -d postgres redis

# 3. Set environment variables (or use defaults for local dev)
export DB_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/survey_analysis"
export REDIS_URL="redis://localhost:6379/0"
export LLM_DEFAULT_MODEL="gpt-4o"  # Set your preferred model
# export OPENAI_API_KEY="sk-..."   # Required for LLM features

# 4. Run the server
uvicorn src.main:app --reload --port 8000

# 5. (Optional) Run the Celery worker for async tasks
celery -A workers.celery_app worker --loglevel=info -Q analytics,simulation
```

### Run the Demo

```bash
# With server running:
python scripts/demo_api.py
```

### Run Tests

```bash
# Unit tests
pytest tests/unit/ -v

# Fitness functions (architectural governance)
pytest tests/fitness_functions/ -m fitness -v

# All tests
pytest -v
```

## Architecture

Modular Monolith with 6 domain modules:

| Module             | Endpoints                 | Purpose                                      |
| ------------------ | ------------------------- | -------------------------------------------- |
| **Ingestion**      | `/api/v1/ingestion/*`     | Schema CRUD, file upload, data validation    |
| **Quality**        | `/api/v1/quality/*`       | Submission scoring, quality filtering        |
| **Analytics**      | `/api/v1/analytics/*`     | Correlation analysis, insights, AI summaries |
| **Visualization**  | `/api/v1/visualization/*` | Chart payloads, sentiment analysis           |
| **Simulation**     | `/api/v1/simulation/*`    | AI personas, synthetic response generation   |
| **Chat Assistant** | `/api/v1/chat/*`          | NL querying, persona interviewing            |

## API Workflow

```
1. POST /api/v1/ingestion/schemas          → Create survey schema
2. POST /api/v1/ingestion/upload/{id}      → Upload responses (JSON/CSV)
3. POST /api/v1/quality/score-batch/{id}   → Score all submissions
4. POST /api/v1/analytics/correlations/{id}→ Run correlation analysis
5. POST /api/v1/visualization/dashboard/{id}→ Get chart payloads
6. POST /api/v1/chat/sessions              → Start chat session
7. POST /api/v1/chat/messages              → Ask questions in natural language
```

## Key Design Decisions

- **ADR-001**: Modular Monolith over Microservices (see `docs/adrs/`)
- **ADR-002**: Python/FastAPI + LiteLLM tech stack
- **LLM Gateway**: Single abstraction for all AI calls (`shared_kernel/llm_gateway.py`)
- **Fitness Functions**: Automated tests enforce module boundaries in CI
