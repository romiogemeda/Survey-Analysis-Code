# Survey Analysis Dashboard — Frontend

Next.js 14 frontend for the AI-Powered Survey Analysis Engine.

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (ensure backend is running on port 8000)
npm run dev
```

Open http://localhost:3000

## Pages

| Route            | Page       | Description                                                             |
| ---------------- | ---------- | ----------------------------------------------------------------------- |
| `/`              | Dashboard  | Overview stats, quick actions, recent submissions                       |
| `/surveys`       | Surveys    | Create/list survey schemas with question definitions                    |
| `/upload`        | Upload     | Drag-and-drop JSON/CSV file upload                                      |
| `/quality`       | Quality    | Batch scoring, grade distribution, per-submission breakdown             |
| `/analytics`     | Analytics  | Correlation analysis, insights, AI executive summary                    |
| `/visualization` | Charts     | Auto-generated Recharts dashboard (bar, pie, histogram, word cloud)     |
| `/simulation`    | Simulation | Persona library, custom persona creation, synthetic response generation |
| `/chat`          | Chat       | Natural language querying & persona interviewing                        |

## Tech Stack

- **Next.js 14** (App Router)
- **React 18** with TypeScript
- **Tailwind CSS** (custom theme with DM Sans + IBM Plex Sans)
- **Recharts** for data visualization
- **Zustand** for global state (active survey, quality filter toggle)
- **API Proxy**: Next.js rewrites `/api/*` → `localhost:8000/api/*`

## Architecture

```
app/              → Pages (App Router)
components/
  layout/         → Sidebar, TopBar, Toasts
  ui/             → Reusable UI components
  charts/         → Chart wrappers
lib/
  api.ts          → Typed API client for all backend endpoints
  store.ts        → Zustand global state
  utils.ts        → Helpers (cn, formatDate, gradeColor)
types/
  index.ts        → TypeScript types matching backend domain
```
