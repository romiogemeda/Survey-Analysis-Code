# Survey Analysis Code

An AI-powered survey analysis system that ingests survey schemas and response data, scores submission quality, runs statistical and correlation analysis, generates chart payloads, simulates synthetic responses using AI personas, and supports natural-language querying of survey data. It is built for research and academic teams who need to go from raw survey data to structured insight without manual data wrangling.

---

## Repository Structure

```
Survey Analysis Code/
├── survey-analysis-backend/   FastAPI application, Celery worker, PostgreSQL, Redis
├── survey-analysis-frontend/  Next.js 14 dashboard (App Router)
├── ARCHITECTURE.md            Detailed architecture documentation
├── SYSTEM_OVERVIEW.md         High-level system overview
├── CHANGES.md                 Change log
└── .gitignore
```

---

## Prerequisites

| Requirement       | Version / Notes                                                                 |
|-------------------|---------------------------------------------------------------------------------|
| Docker            | Any recent stable release; Docker Compose V2 (`docker compose`, not `docker-compose`) |
| Node.js           | **22.x exactly** — pinned by `survey-analysis-frontend/.nvmrc`                 |
| npm               | 10.x or later (bundled with Node 22)                                           |
| nvm               | Recommended for managing the Node version; not strictly required                |
| OpenRouter API key| Required for all LLM features. Get one at https://openrouter.ai/               |

---

## Quick Start

Follow these steps in order. Each step links to the full README for that component.

### 0. Clone the repository

> **Do not download a ZIP.** A ZIP snapshot will not receive updates via `git pull` and may already be stale by the time you extract it. Clone the repository instead.

```bash
git clone <repo-url>
cd <repo-name>
```

Replace `<repo-url>` with the HTTPS or SSH URL from the repository host (e.g. GitHub), and `<repo-name>` with the directory it creates.

---

### 1. Start the backend

See [`survey-analysis-backend/README.md`](survey-analysis-backend/README.md) for full details.

```bash
cd survey-analysis-backend

# Copy the example env file and fill in your API key and model names
cp .env.example .env
# Edit .env — set OPENROUTER_API_KEY, LLM_DEFAULT_MODEL, LLM_FALLBACK_MODEL

# Build and start all four services (postgres, redis, api, worker)
docker compose up --build -d

# Verify the API is up
curl http://localhost:8000/health
```

You should see:
```json
{"status":"healthy","service":"Survey Analysis Engine","version":"0.1.0","modules":["ingestion","quality","analytics","visualization","simulation","chat_assistant"]}
```

### 2. Start the frontend

See [`survey-analysis-frontend/README.md`](survey-analysis-frontend/README.md) for full details.

```bash
cd survey-analysis-frontend

# Switch to the required Node version
nvm use

# Install dependencies from the lockfile
npm ci

# Start the dev server
npm run dev
```

### 3. Open the dashboard

- **Dashboard:** http://localhost:3001
- **API (Swagger UI):** http://localhost:8000/api/docs

---

## Troubleshooting

### Wrong Node version

**Symptom:** `npm ci` fails, or the dev server crashes with native module errors.

**Fix:** Run `nvm use` inside `survey-analysis-frontend/`. If nvm is not installed, install Node 22 LTS manually and confirm with `node --version`.

---

### Docker is not running

**Symptom:** `docker compose up` fails immediately with a connection error to the Docker daemon.

**Fix:** Start Docker Desktop (Windows/macOS) or run `sudo systemctl start docker` (Linux), then retry.

---

### Missing API key — server crashes on startup

**Symptom:** The `api` container exits immediately; logs show a Pydantic validation error referencing `LLM_DEFAULT_MODEL` or `LLM_FALLBACK_MODEL`.

**Fix:** Open `survey-analysis-backend/.env` and confirm all three of these are set:
```
OPENROUTER_API_KEY=sk-or-v1-...
LLM_DEFAULT_MODEL=openrouter/openai/gpt-4o
LLM_FALLBACK_MODEL=openrouter/openai/gpt-4o
```
Then restart: `docker compose up -d api`.

---

### Frontend shows no data / API requests fail

**Symptom:** The dashboard loads but every data panel is empty or shows errors.

**Cause:** The backend is not running, or the CORS origin list does not include the frontend's port.

**Fix:**
1. Confirm the backend health endpoint responds: `curl http://localhost:8000/health`
2. The backend CORS default allows `http://localhost:3000`. The frontend dev server runs on **port 3001**. Add the following to `survey-analysis-backend/.env`:
   ```
   APP_CORS_ORIGINS=["http://localhost:3001"]
   ```
   Then restart the `api` container: `docker compose restart api`.

---

### Port already in use

**Symptom:** `docker compose up` fails with `bind: address already in use` on port 5432, 6379, or 8000.

**Fix:** Stop whichever local service is using that port, or stop all containers and retry:
```bash
docker compose down
docker compose up --build -d
```
