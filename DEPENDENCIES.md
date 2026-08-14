# Dependencies

Complete list of project dependencies and their purposes.

## System Requirements

| Requirement | Version | Purpose | Link |
|---|---|---|---|
| Node.js | 18+ | JavaScript runtime for frontend & build tools | https://nodejs.org/ |
| npm | 8+ | Package manager (bundled with Node.js) | https://www.npmjs.com/ |
| Docker | Latest | Required for local Supabase dev environment | https://www.docker.com/ |
| Git | 2.0+ | Version control | https://git-scm.com/ |

## CLI Tools

### Supabase CLI

```bash
# Install
brew install supabase/tap/supabase  # macOS
npm install -g supabase              # Windows/Linux/macOS

# Verify
supabase --version
```

**Used for:**
- Starting local Postgres + Supabase Stack
- Running database migrations
- Managing secrets and environment

---

## Frontend Dependencies (Vue.js)

Install with: `cd frontend && npm install`

### Core

| Package | Version | Purpose |
|---|---|---|
| `vue` | ^3.5.40 | UI framework |
| `@supabase/supabase-js` | ^2.112.3 | Supabase client library |
| `nprogress` | ^0.2.0 | Top-of-page loading bar |
| `vite` | ^8.2.0 | Build tool & dev server |

### Development

| Package | Version | Purpose |
|---|---|---|
| `typescript` | ~6.0.2 | Type checking |
| `vue-tsc` | ^3.3.8 | Vue TypeScript compiler |
| `@vitejs/plugin-vue` | ^6.0.8 | Vite Vue plugin |
| `@vue/tsconfig` | ^0.9.1 | Vue TypeScript config preset |
| `tailwindcss` | ^4.3.3 | CSS framework |
| `@tailwindcss/vite` | ^4.3.3 | Tailwind Vite plugin |
| `eslint` | ^10.8.1 | Code linting |
| `eslint-plugin-vue` | ^10.10.0 | Vue linting rules |
| `@eslint/js` | ^10.0.1 | ESLint config |
| `typescript-eslint` | ^8.67.0 | TypeScript linting |
| `@types/node` | ^24.13.3 | Node.js type definitions |
| `@types/nprogress` | ^0.2.3 | nprogress type definitions |
| `globals` | ^17.10.0 | Global type definitions |

### Scripts

```bash
npm run dev        # Start dev server (http://localhost:5173)
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # Run linter
npm run typecheck  # Type checking without emit
```

---

## Backend Dependencies (Supabase)

### Database (PostgreSQL 17)

- Auto-configured by Supabase CLI
- Migrations in `supabase/migrations/`
- Tables: `room_config`, `occupancy_readings`, `ac_calculations`, `simulation_runs`, `simulation_hourly_data`

### Supabase Services

All provided by local Supabase stack started with `supabase start`:

- **PostgreSQL** — Database engine
- **PostgREST** — Auto-generated REST API
- **Realtime** — WebSocket subscriptions
- **Auth** — User authentication (optional for hackathon)
- **Storage** — File storage (optional)

### Edge Functions (Deno)

Deno runtime is bundled with Supabase CLI. Functions use:

| Module | Purpose | Config |
|---|---|---|
| `deno.std` | Standard library | Built-in |
| `@supabase/supabase-js` | Supabase client | Installed per-function |

**Functions:**
- `occupancy/` — reads the latest `occupancy_readings` row (any source), mock fallback if the table is empty
- `occupancy-readings/` — manual people-count input (`source: 'manual'`)
- `occupancy-vision/` — webcam frame → Gemini vision (Vertex AI) → people count (`source: 'camera_gemini'`)
- `room-config/` — GET/PUT the singleton `room_config` row (building/location/room size/SEER/EGAT label/comfort preference/rated capacity)
- `calculation/` — live AC settings calculation (CoolSense V3 — additive area+occupancy load, SEER-scaled)
- `weather/` — live weather data by location (weatherapi.com)
- `simulation/` — mock data generation + 168-hour static vs CoolSense V2/V3 comparison + dashboard retrieval endpoints
- `_shared/` — shared calculation logic (`acCalculationV3.ts`, `coolSenseV3Calculation.ts`, `simulation.ts`, `geminiOccupancy.ts`, `googleServiceAuth.ts`, `runCalculation.ts`, `occupancyStats.ts`) & their unit tests

---

## External APIs

### Weather Data (weatherapi.com)

**Required for:** Live weather integration

**Setup:**
1. Get free API key at https://www.weatherapi.com/
2. Add to `supabase/.env`: `WEATHERAPI_KEY=your_key`
3. Deployed: Use `supabase secrets set WEATHERAPI_KEY=your_key`

**Rate limit:** 1M calls/month (free tier) — plenty for hackathon

### Camera Occupancy Vision (Gemini via Vertex AI)

**Required for:** Live webcam headcount estimation (`occupancy-vision` function)

**Setup:**
1. Create a GCP service account with the **Vertex AI User** (`roles/aiplatform.user`) role — grant by exact role ID (`gcloud projects add-iam-policy-binding <project> --member=serviceAccount:<sa-email> --role=roles/aiplatform.user`) since the Console's IAM search surfaces similarly-named decoy roles.
2. Download the service account key JSON, compact it to one line, add to `supabase/.env`: `GCP_SERVICE_ACCOUNT_JSON={...}`
3. Deployed: `supabase secrets set GCP_SERVICE_ACCOUNT_JSON='...'`

**Not the Gemini Developer API** — a plain API key was tried first but the project's linked Cloud Billing credit doesn't apply to the Developer API's separate prepay wallet, so authentication goes through Vertex AI + this service account instead (see CLAUDE.md's "Camera-based Occupancy Counting" section for the full story).

---

## Optional / Future

These are NOT required for the current MVP but may be useful:

| Tool | Purpose | Install |
|---|---|---|
| `deno` | Deno CLI (usually not needed, CLI handles it) | `brew install deno` |
| `postgres` | Direct DB access (optional, use Supabase Studio instead) | `brew install postgresql` |

---

## Verification Checklist

After setup, verify each component:

```bash
# System
node -v                              # Should be 18+
npm -v                               # Should be 8+
docker --version                     # Should run
git --version                        # Should run
supabase --version                   # Should run

# Frontend
cd frontend && npm list              # Should list packages
npm run typecheck                    # Should pass

# Backend
supabase status                      # Should show running services
curl http://127.0.0.1:54321/rest/v1/room_config    # Should return []
```

---

## Troubleshooting

### Dependencies outdated?

Check for updates:
```bash
npm outdated
npm update
```

### Missing package after git pull?

Reinstall:
```bash
cd frontend && rm -rf node_modules package-lock.json
npm install
```

### Supabase not starting?

Docker may need more resources. Increase CPU/RAM in Docker Desktop settings.

---

## Deployment Dependencies

When deploying to production:

- **Vercel** — Hosting for frontend
- **Supabase Cloud** — Managed PostgreSQL + edge functions
- Environment variables: `WEATHERAPI_KEY` (set in Supabase dashboard)

See SETUP.md for deployment steps.
