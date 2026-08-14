# Project Setup Guide

Smart AC Optimization Hackathon — Full local development setup.

## Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org/))
- **Docker** (for Supabase local dev) ([download](https://www.docker.com/products/docker-desktop))
- **Supabase CLI** (installed via script below)
- **Git** (for version control)

## Quick Start (Automated)

Run the setup script from the project root:

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

This will:
1. ✅ Install frontend dependencies
2. ✅ Install Supabase CLI
3. ✅ Create `supabase/.env` from its example (add your `WEATHERAPI_KEY` afterward — see step 5 below for `GCP_SERVICE_ACCOUNT_JSON` too)
4. ✅ Start local Supabase server
5. ✅ Print next steps

The script does not create `frontend/.env` — copy `frontend/.env.example` yourself (see "Environment Variables" below).

---

## Manual Setup

If the script doesn't work, follow these steps:

### 1. Install Dependencies

```bash
# Frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Install Supabase CLI

```bash
# macOS / Linux
brew install supabase/tap/supabase

# Windows (via Scoop)
scoop install supabase

# Or via npm
npm install -g supabase
```

Verify installation:
```bash
supabase --version
```

### 3. Start Local Supabase

From project root:

```bash
cd supabase
supabase start
```

This spins up:
- **API**: http://127.0.0.1:54321
- **Studio** (GUI): http://127.0.0.1:54323
- **Database**: postgres://postgres:postgres@127.0.0.1:54322/postgres

Wait for all services to be ready (~30-60 seconds).

### 4. Verify Migrations

Check that tables were created in Supabase Studio:
- `room_config`
- `occupancy_readings`
- `weather_readings`
- `ac_calculations`
- `simulation_runs`
- `simulation_hourly_data`

Or via CLI:
```bash
supabase db list
```

### 5. Set Up Environment Variables

Create `.env` file in `supabase/` directory:

```bash
cp supabase/.env.example supabase/.env
```

Edit `supabase/.env` and add your API key (get free key at [weatherapi.com](https://www.weatherapi.com/)):

```
WEATHERAPI_KEY=your_weatherapi_key_here
```

To use live camera occupancy counting (`occupancy-vision`), also add a GCP service account key (see DEPENDENCIES.md's "Camera Occupancy Vision" section for how to create one):

```
GCP_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

This second key is only needed if you're testing the webcam monitoring flow — manual people-count input works without it.

Also create the frontend env file (needed for the Vue app to reach Supabase):

```bash
cp frontend/.env.example frontend/.env
# then fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (printed by `supabase start`)
```

### 6. Test the Setup

#### Test Calculation Backend

Open in browser: http://127.0.0.1:54323/studio

Or use the local tester (no Supabase required):
```bash
# Open in browser
open tools/calculation-tester.html
# Or: file:///path/to/tools/calculation-tester.html
```

#### Test API Endpoints

Edge functions that need secrets (`weather`, `occupancy-vision`) must be served with the env file loaded — `supabase start` alone doesn't inject `supabase/.env`:

```bash
supabase functions serve --env-file supabase/.env
```

Then, from another terminal:

```bash
# Get room config
curl http://127.0.0.1:54321/rest/v1/room_config

# Get weather (if WEATHERAPI_KEY is set)
curl -X POST http://127.0.0.1:54321/functions/v1/weather \
  -H "Content-Type: application/json" \
  -d '{"location":"Bangkok"}'
```

---

## Running the Project

### Start Frontend Dev Server

```bash
cd frontend
npm run dev
```

Opens at http://localhost:5173

### Start Backend (Supabase)

```bash
cd supabase
supabase start
```

### Run Tests

```bash
# Frontend type checking
cd frontend
npm run typecheck

# All shared calculation/logic tests (acCalculationV3, coolSenseV3Calculation,
# simulation, geminiOccupancy, googleServiceAuth, runCalculation, occupancyStats, ...)
deno test supabase/functions/_shared/

# Per-function lint/typecheck (from repo root)
cd supabase/functions/<function-name> && deno lint && deno check --config deno.json index.ts
```

---

## Project Structure

```
.
├── frontend/              # Vue.js app
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── supabase/              # Backend + database
│   ├── migrations/        # SQL migrations (auto-run on start)
│   ├── functions/         # Deno edge functions
│   │   ├── occupancy/          # Latest people-count reading (any source)
│   │   ├── occupancy-readings/ # Manual people-count input
│   │   ├── occupancy-vision/   # Webcam frame -> Gemini (Vertex AI) headcount
│   │   ├── room-config/        # Singleton room_config GET/PUT
│   │   ├── calculation/        # Live AC settings calc (CoolSense V3)
│   │   ├── simulation/         # Mock data + 168-hour comparison + dashboard reads
│   │   ├── weather/            # Weather API integration
│   │   └── _shared/            # Shared calculation logic & tests
│   ├── config.toml        # Supabase config
│   └── .env.example       # Environment template
├── tools/                 # Local testing
│   └── calculation-tester.html
├── CLAUDE.md              # Project spec & decisions
├── SETUP.md               # This file
└── scripts/               # Automation scripts
    └── setup.sh
```

---

## Environment Variables

### Local Development (supabase/.env)

```
WEATHERAPI_KEY=your_key_from_weatherapi.com
GCP_SERVICE_ACCOUNT_JSON={"type":"service_account",...}   # only needed for occupancy-vision (camera monitoring)
```

### Deployment (Supabase Cloud)

Set secrets via Supabase dashboard or CLI:
```bash
supabase secrets set WEATHERAPI_KEY=your_key
supabase secrets set GCP_SERVICE_ACCOUNT_JSON='...'
```

### Frontend (frontend/.env — copy from frontend/.env.example)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## Troubleshooting

### "supabase start" hangs or fails

Docker may not be running. Start Docker Desktop and retry.

### Port conflicts (54321, 54323, etc.)

Check what's using the ports:
```bash
lsof -i :54321
```

Kill the process or change config.toml `port = XXXX`.

### Frontend can't connect to backend

Verify Supabase is running:
```bash
curl http://127.0.0.1:54321/rest/v1/room_config
```

Frontend should use URL: `http://127.0.0.1:54321`

### WEATHERAPI_KEY not working

- Get a free key at [weatherapi.com](https://www.weatherapi.com/)
- Add to `supabase/.env`
- Restart Supabase: `supabase stop && supabase start`

---

## Next Steps

1. ✅ Backend set up? Check endpoints with curl
2. ✅ Frontend running? Open http://localhost:5173
3. ✅ Ready to build? See CLAUDE.md for feature list

---

## Questions?

- Supabase docs: https://supabase.com/docs/guides/local-development
- Vue.js docs: https://vuejs.org/
- Project spec: See CLAUDE.md
