# Survey Analysis Engine — Backend

A FastAPI application that provides the server-side of the survey analysis system. It exposes a REST API for survey schema management, response ingestion, quality scoring, statistical analysis, chart data generation, AI persona simulation, and natural-language chat querying. Long-running analysis tasks run asynchronously via a Celery worker backed by Redis. All data is stored in PostgreSQL.

---

## Prerequisites

| Requirement       | Notes                                                                             |
|-------------------|-----------------------------------------------------------------------------------|
| Docker            | Docker Compose V2 required (`docker compose`, not `docker-compose`)               |
| OpenRouter API key| Required. Without it the server will not start. Get one at https://openrouter.ai/ |

---

## Setup

### Step 1 — Create the `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in the three required values:

```env
# Required — server will not start without these
OPENROUTER_API_KEY=sk-or-v1-your-key-here
LLM_DEFAULT_MODEL=openrouter/openai/gpt-4o
LLM_FALLBACK_MODEL=openrouter/openai/gpt-4o

# These defaults work with the Docker Compose setup — change only if needed
DB_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/survey_analysis
REDIS_URL=redis://localhost:6379/0
```

> **Important:** `LLM_DEFAULT_MODEL` and `LLM_FALLBACK_MODEL` have no defaults in the code. The server will exit at startup with a Pydantic validation error if either is missing from `.env`.

**Additional settings** (optional — all have defaults if omitted):

| Variable               | Default                        | Notes                                                     |
|------------------------|--------------------------------|-----------------------------------------------------------|
| `APP_DEBUG`            | `false`                        | Set to `true` for debug logging                           |
| `APP_LOG_LEVEL`        | `INFO`                         | Log verbosity                                             |
| `APP_CORS_ORIGINS`     | `["http://localhost:3000"]`    | ⚠️ The frontend dev server runs on **3001** — see below   |
| `APP_SENTRY_DSN`       | _(unset)_                      | Optional Sentry error tracking                            |
| `CELERY_BROKER_URL`    | `redis://localhost:6379/1`     | Celery task broker                                        |
| `CELERY_RESULT_BACKEND`| `redis://localhost:6379/2`     | Celery result storage                                     |

> **CORS note:** If you are running the frontend dev server (which starts on port **3001**), add this to your `.env`:
> ```
> APP_CORS_ORIGINS=["http://localhost:3001"]
> ```
> Without this, the browser will block all API requests from the frontend.

**Verify:** Confirm your `.env` exists and the three required fields are non-empty:

```bash
# macOS / Linux
grep -E "OPENROUTER_API_KEY|LLM_DEFAULT_MODEL|LLM_FALLBACK_MODEL" .env
```

```powershell
# Windows PowerShell
Select-String -Path .env -Pattern "OPENROUTER_API_KEY|LLM_DEFAULT_MODEL|LLM_FALLBACK_MODEL"
```

You should see all three lines with real values (not the placeholder `sk-or-v1-your-key-here`).

---

### Step 2 — Build and start all services

```bash
docker compose up --build -d
```

This builds the application image and starts four services:

| Service    | Image                   | Port  | Purpose                                        |
|------------|-------------------------|-------|------------------------------------------------|
| `postgres` | `postgres:16-alpine`    | 5432  | Primary database                               |
| `redis`    | `redis:7-alpine`        | 6379  | Celery broker + application cache              |
| `api`      | Built from `Dockerfile` | 8000  | FastAPI application server                     |
| `worker`   | Built from `Dockerfile` | —     | Celery worker (queues: `analytics,simulation`) |

**Database tables** are created automatically when the `api` container starts. There is no separate migration step — the application runs `SQLAlchemy create_all()` on startup, which creates all schemas and tables if they do not already exist.

**Verify all containers are running:**
```bash
docker compose ps
```
All four services should show `running` (or `healthy` for postgres and redis).

---

### Step 3 — Verify the API is responding

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "Survey Analysis Engine",
  "version": "0.1.0",
  "modules": ["ingestion", "quality", "analytics", "visualization", "simulation", "chat_assistant"]
}
```

If you get a connection refused error, check the `api` container logs (see Commands below).

---

## API Reference

| URL                        | Description                        |
|----------------------------|------------------------------------|
| http://localhost:8000/health    | Health check endpoint         |
| http://localhost:8000/api/docs  | Swagger UI (interactive)      |
| http://localhost:8000/api/redoc | ReDoc documentation           |

---

## Local Development (without Docker for the API)

Use this if you want hot-reload for the API server while keeping PostgreSQL and Redis in Docker.

```bash
# 1. Create and activate a virtual environment
python -m venv venv

# Windows (PowerShell)
venv\Scripts\Activate.ps1

# macOS / Linux
source venv/bin/activate

# 2. Install all dependencies (including dev tools)
pip install -e ".[dev]"

# 3. Download TextBlob NLP data (required for sentiment analysis)
python -m textblob.download_corpora

# 4. Start only the infrastructure containers
docker compose up -d postgres redis

# 5. Verify postgres and redis are healthy
docker compose ps

# 6. Start the API server with hot-reload
uvicorn src.main:app --reload --port 8000

# 7. (Optional) Start the Celery worker in a separate terminal
celery -A workers.celery_app worker --loglevel=info -Q analytics,simulation
```

**Verify:** `curl http://localhost:8000/health` should return the healthy response above.

---

## Common Commands

| Task                             | Command                                          |
|----------------------------------|--------------------------------------------------|
| Start all services               | `docker compose up -d`                           |
| Start and rebuild images         | `docker compose up --build -d`                   |
| Stop all services (keep data)    | `docker compose down`                            |
| Stop all services and delete data| `docker compose down -v`                         |
| View API logs                    | `docker compose logs -f api`                     |
| View worker logs                 | `docker compose logs -f worker`                  |
| View all logs                    | `docker compose logs -f`                         |
| Restart only the API             | `docker compose restart api`                     |
| Open a shell in the API container| `docker compose exec api bash`                   |
| Run unit tests                   | `pytest tests/unit/ -v`                          |
| Run fitness function tests       | `pytest tests/fitness_functions/ -m fitness -v`  |
| Run all tests                    | `pytest -v`                                      |
| Run the demo script              | `python scripts/demo_api.py`                     |

---

## Troubleshooting

### Server crashes immediately on startup — Pydantic validation error

**Cause:** `LLM_DEFAULT_MODEL` or `LLM_FALLBACK_MODEL` is missing from `.env`.

**Fix:** Open `.env` and confirm both variables are set to a valid model string. Then restart:
```bash
docker compose up -d api
```

---

### LLM calls fail — "API key not found" or 401 error

**Cause:** `OPENROUTER_API_KEY` is not set, or the key is invalid.

**Fix:** Verify the key is in `.env`:
```bash
grep OPENROUTER_API_KEY .env
```
If the value is the placeholder (`sk-or-v1-your-key-here`), replace it with your real key from https://openrouter.ai/keys. Then restart the api container.

---

### `docker compose up` — key environment variables not picked up by containers

**Cause:** The `docker-compose.yml` file does not use an `env_file:` directive. It only injects the database and Redis URLs inline. `OPENROUTER_API_KEY`, `LLM_DEFAULT_MODEL`, and `LLM_FALLBACK_MODEL` are **not** automatically passed from your `.env` to the running containers.

**Fix:** Add these directly to the `api` and `worker` `environment:` blocks in `docker-compose.yml`, or export them in your shell before running `docker compose up`:
```bash
export OPENROUTER_API_KEY=sk-or-v1-...
export LLM_DEFAULT_MODEL=openrouter/openai/gpt-4o
export LLM_FALLBACK_MODEL=openrouter/openai/gpt-4o
docker compose up -d
```

---

### PostgreSQL connection refused

**Cause:** The `postgres` container is not running or has not finished its health check.

**Fix:**
```bash
docker compose up -d postgres
docker compose ps  # wait until postgres shows "healthy"
docker compose up -d api worker
```

---

### Redis connection refused

**Cause:** The `redis` container is not running or has not finished its health check.

**Fix:**
```bash
docker compose up -d redis
docker compose ps  # wait until redis shows "healthy"
docker compose restart api worker
```

---

### Sentiment analysis fails — TextBlob corpus error

**Cause:** The TextBlob NLP corpora were not downloaded. This is not done automatically in the Docker build.

**Fix (in a running container):**
```bash
docker compose exec api python -m textblob.download_corpora
```

**Fix (local dev):**
```bash
python -m textblob.download_corpora
```

---

### Port already in use (5432, 6379, or 8000)

**Symptom:** `docker compose up` fails with `bind: address already in use`.

**Fix:** Stop the conflicting local service (e.g., a local PostgreSQL or Redis install), or identify and stop it:
```bash
# Find what is using port 5432
netstat -ano | findstr :5432   # Windows
lsof -i :5432                  # macOS / Linux
```
Then retry `docker compose up -d`.

---

### Celery tasks stuck / not processing

**Cause:** The `worker` container is not running, or Redis is not accessible.

**Fix:**
```bash
docker compose ps              # confirm worker is running
docker compose logs worker     # check for errors
docker compose restart worker
```
