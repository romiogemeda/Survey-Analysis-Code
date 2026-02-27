# Survey Analysis Engine

AI-Powered Survey Analysis Dashboard — Module 2 of 4.

## Quick Start

### Prerequisites

- Python 3.12+
- Docker & Docker Compose (for PostgreSQL and Redis, or full containerized setup)
- An [OpenRouter](https://openrouter.ai/) API key (required for all LLM/AI features)

### 1. Configure Environment Variables

Before running anything, create a `.env` file in the project root:

```bash
cp .env.example .env
```

Then edit `.env` and set your API key:

```env
# Required: Get your key from https://openrouter.ai/
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# LLM Configuration (required — server will not start without these)
LLM_DEFAULT_MODEL=openrouter/openai/gpt-4o
LLM_FALLBACK_MODEL=openrouter/openai/gpt-4o

# Database & Redis (defaults work for local Docker setup)
DB_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/survey_analysis
REDIS_URL=redis://localhost:6379/0
```

> **Important:** `LLM_DEFAULT_MODEL` and `LLM_FALLBACK_MODEL` have no defaults in the code.
> The server will crash on startup if these are missing from `.env`.

---

### Option A: Docker (Recommended)

This is the easiest way to get everything running. It starts **4 services**:

| Service      | Image                   | Purpose                                                         |
| ------------ | ----------------------- | --------------------------------------------------------------- |
| **postgres** | `postgres:16-alpine`    | Primary database — stores surveys, responses, analytics results |
| **redis**    | `redis:7-alpine`        | Celery task broker + application cache                          |
| **api**      | Built from `Dockerfile` | FastAPI application server (the modular monolith)               |
| **worker**   | Built from `Dockerfile` | Celery worker for async tasks (analytics, simulation)           |

```bash
# 1. Make sure your .env file is configured (see step above)

# 2. Start all 4 services
docker compose up -d

# 3. Verify all containers are running
docker compose ps

# 4. Check API server logs for any errors
docker compose logs api
```

- API available at: http://localhost:8000
- Swagger UI at: http://localhost:8000/api/docs
- Database tables are **automatically created** on API startup.

To stop all services:

```bash
docker compose down          # Stop containers (preserves data)
docker compose down -v       # Stop containers AND delete database data
```

---

### Option B: Local Development

Use this if you want to run the API server locally with hot-reload for development, while using Docker only for PostgreSQL and Redis.

```bash
# 1. Create and activate a virtual environment
python -m venv venv

# On macOS/Linux:
source venv/bin/activate

# On Windows (PowerShell):
venv\Scripts\Activate.ps1

# On Windows (CMD):
venv\Scripts\activate.bat
```

```bash
# 2. Install dependencies
pip install -e ".[dev]"
```

```bash
# 3. Download TextBlob corpora (required for sentiment analysis)
python -m textblob.download_corpora
```

```bash
# 4. Make sure your .env file is configured (see "Configure Environment Variables" above)

# 5. Start PostgreSQL and Redis via Docker
docker compose up -d postgres redis

# 6. Verify Postgres and Redis are healthy
docker compose ps
```

```bash
# 7. Run the API server (tables are auto-created on startup)
uvicorn src.main:app --reload --port 8000
```

```bash
# 8. (Optional) In a separate terminal, run the Celery worker for async tasks
celery -A workers.celery_app worker --loglevel=info -Q analytics,simulation
```

- API available at: http://localhost:8000
- Swagger UI at: http://localhost:8000/api/docs

---

### Docker Services — Detailed Configuration

Below are the key settings for each Docker service (defined in `docker-compose.yml`):

#### PostgreSQL

| Setting       | Value                                       |
| ------------- | ------------------------------------------- |
| Image         | `postgres:16-alpine`                        |
| Database name | `survey_analysis`                           |
| Username      | `postgres`                                  |
| Password      | `postgres`                                  |
| Port          | `5432`                                      |
| Data volume   | `postgres_data` (persisted across restarts) |

#### Redis

| Setting | Value                 |
| ------- | --------------------- |
| Image   | `redis:7-alpine`      |
| Port    | `6379`                |
| DB 0    | Application cache     |
| DB 1    | Celery broker         |
| DB 2    | Celery result backend |

#### API Server

| Setting    | Value                                   |
| ---------- | --------------------------------------- |
| Port       | `8000`                                  |
| Reload     | Enabled (auto-restarts on code changes) |
| Depends on | Postgres (healthy), Redis (healthy)     |

#### Celery Worker

| Setting    | Value                               |
| ---------- | ----------------------------------- |
| Queues     | `analytics`, `simulation`           |
| Depends on | Postgres (healthy), Redis (healthy) |

---

### Run the Demo

```bash
# With the API server running:
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

---

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

## Troubleshooting

| Problem                                                  | Solution                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| Server crashes on startup with pydantic validation error | Make sure `LLM_DEFAULT_MODEL` and `LLM_FALLBACK_MODEL` are set in `.env` |
| LLM calls fail / "API key not found"                     | Ensure `OPENROUTER_API_KEY` is set in `.env` with a valid key            |
| Postgres connection refused                              | Run `docker compose up -d postgres` and wait for health check to pass    |
| Redis connection refused                                 | Run `docker compose up -d redis` and wait for health check to pass       |
| Sentiment analysis fails                                 | Run `python -m textblob.download_corpora` to download required NLP data  |
| Celery tasks stuck / not processing                      | Ensure the worker is running and Redis is accessible                     |
