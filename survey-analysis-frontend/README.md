# Survey Analysis Dashboard — Frontend

A Next.js 14 (App Router) dashboard that connects to the Survey Analysis Engine backend. It provides pages for survey schema management, response upload, quality scoring review, statistical analytics, chart visualization, AI persona simulation, and natural-language chat querying. All API calls are proxied through the Next.js server to the backend at `http://localhost:8000`.

---

## Prerequisites

| Requirement | Version / Notes                                                                    |
|-------------|------------------------------------------------------------------------------------|
| Node.js     | **22.x exactly** — pinned by `.nvmrc`. Other versions are not supported.           |
| npm         | 10.x or later (bundled with Node 22)                                               |
| nvm         | Strongly recommended for switching Node versions. https://github.com/nvm-sh/nvm   |
| Backend     | The backend API must be running on `http://localhost:8000` before opening the dashboard |

### Why Node 22 exactly?

The repository pins Node to major version 22 in two places:

- `.nvmrc` contains `22` — `nvm use` reads this and switches your active Node version automatically.
- `package.json` declares `"engines": { "node": ">=22.0.0 <23.0.0" }` — this rejects Node 21 and Node 23.

Using a different Node version risks silent native module mismatches, broken lockfile resolution, and build failures that are difficult to diagnose. Use Node 22.

---

## Setup

### Step 1 — Switch to Node 22

**macOS / Linux** — nvm reads `.nvmrc` automatically:
```bash
nvm use
```

**Windows** — nvm for Windows requires an explicit version argument:
```powershell
nvm use 22
```

If Node 22 is not installed yet:
```bash
# macOS / Linux
nvm install 22
nvm use

# Windows
nvm install 22.20.0
nvm use 22
```

**Verify:**
```bash
node --version
```
Output must begin with `v22.`.

---

### Step 2 — Install dependencies

```bash
npm ci
```

Use `npm ci`, not `npm install`. `npm ci` installs the exact versions recorded in `package-lock.json` and fails if the lockfile is out of sync with `package.json`. This guarantees a reproducible install. `npm install` may silently update the lockfile and introduce version drift.

**Verify:**
```bash
npm list next
```
Output should show `next@14.2.15`.

---

### Step 3 — Start the dev server

```bash
npm run dev
```

The dev server starts on **port 3001** (not 3000). This is set by the `dev` script in `package.json`:
```
"dev": "next dev --port 3001"
```

**Verify:** Open http://localhost:3001 in your browser. The dashboard home page should load. If data panels are empty, confirm the backend is running (see Prerequisites and Troubleshooting).

---

## API Proxy

All `/api/*` requests from the browser are rewritten server-side by Next.js to `http://localhost:8000/api/*`. This is configured in `next.config.js`:

```js
async rewrites() {
  return [{ source: "/api/:path*", destination: "http://localhost:8000/api/*" }]
}
```

The backend URL is hardcoded in `next.config.js`. If your backend runs on a different host or port, edit that file.

**There are no environment variables to configure** for the frontend. No `.env` file is needed.

---

## Pages

| Route            | Description                                                             |
|------------------|-------------------------------------------------------------------------|
| `/`              | Overview stats, quick actions, recent submissions                       |
| `/surveys`       | Create and list survey schemas with question definitions                |
| `/upload`        | Drag-and-drop JSON/CSV response file upload                             |
| `/quality`       | Batch quality scoring, grade distribution, per-submission breakdown     |
| `/analytics`     | Correlation analysis, insights, AI executive summary                    |
| `/visualization` | Auto-generated charts (bar, pie, histogram, word cloud)                 |
| `/simulation`    | Persona library, custom persona creation, synthetic response generation |
| `/chat`          | Natural-language querying and persona interviewing                      |

---

## Common Commands

| Task                      | Command           |
|---------------------------|-------------------|
| Start dev server          | `npm run dev`     |
| Build production bundle   | `npm run build`   |
| Start production server   | `npm start`       |
| Run linter                | `npm run lint`    |
| Clean install from lockfile | `npm ci`        |

---

## Troubleshooting

### Wrong Node version

**Symptom:** `npm ci` fails with an `EBADENGINE` error, or the dev server crashes with a native module error such as `Error: The module was compiled against a different Node.js version`.

**Fix:**
```bash
nvm use          # switches to Node 22 per .nvmrc
node --version   # confirm: must start with v22.
npm ci           # reinstall from scratch
```

If `nvm use` says the version is not installed:
```bash
nvm install 22
nvm use
```

---

### `npm install` was run instead of `npm ci`

**Symptom:** The lockfile has been modified (visible as unstaged changes in `package-lock.json`), or you see unexpected package version changes.

**Fix:**
```bash
git checkout -- package-lock.json   # restore the lockfile
npm ci                               # clean install from the original lockfile
```

Going forward, always use `npm ci` for installs in this project.

---

### Dev server port conflict (port 3001 already in use)

**Symptom:** `npm run dev` fails with `Error: listen EADDRINUSE: address already in use :::3001`.

**Fix:** Find and stop the process using port 3001:
```bash
# Windows
netstat -ano | findstr :3001

# macOS / Linux
lsof -i :3001
```
Kill that process, then run `npm run dev` again.

---

### Dashboard loads but all data panels are empty or show errors

**Cause 1 — Backend is not running.**

**Fix:** Start the backend first:
```bash
cd ../survey-analysis-backend
docker compose up -d
curl http://localhost:8000/health  # must return {"status":"healthy",...}
```

**Cause 2 — CORS is blocking requests from port 3001.**

The backend CORS default allows `http://localhost:3000`. The frontend runs on **port 3001**, so the browser will block responses unless the backend is configured to allow `http://localhost:3001`.

**Fix:** In `survey-analysis-backend/.env`, add:
```
APP_CORS_ORIGINS=["http://localhost:3001"]
```
Then restart the backend API:
```bash
docker compose restart api
```

---

### `npm ci` fails — `package-lock.json` is out of sync

**Symptom:** `npm ci` exits with `npm error Invalid: lock file's <package> does not satisfy <package>@<version>`.

**Cause:** Someone ran `npm install` and the lockfile was modified without a corresponding commit.

**Fix:**
```bash
git checkout -- package-lock.json
npm ci
```
If the error persists, check `git log package-lock.json` to confirm the lockfile is in a valid committed state.

---

### Build fails — type errors or missing module

**Symptom:** `npm run build` exits with TypeScript type errors or a missing module import.

**Fix:**
```bash
npm ci             # ensure all deps are installed
npm run lint       # check for lint errors
npm run build      # retry
```
If type errors reference backend data shapes, check whether the backend API response structure has changed.
