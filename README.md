# CoolSense — Smart AC Optimization

A software-only system that cuts AC energy waste in hotels, offices, and malls by adjusting temperature and fan speed to real occupancy, instead of running full blast 24/7 regardless of how many people are actually in the room.

Built in a 2-day hackathon. 🏆 **1st place, K-CAMT'26 Hackathon (Net-Zero Carbon track).** I led the 5-person team. We are now competing with it at the New Gen Energy Research Showcase, scaling it up with multi-room support, new features, and hardware integration.

**Live demo:** https://k-camt-hackathon.vercel.app

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [How It Works](#how-it-works)
- [The Algorithm](#the-algorithm-coolsense-v3)
- [Carbon Analytics and Cleaning Alerts](#carbon-analytics-and-cleaning-alerts)
- [Impact](#impact)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Running the Project](#running-the-project)
- [Occupancy Input Without a Camera](#occupancy-input-without-a-camera)
- [Testing](#testing)
- [Deployment](#deployment)

## The Problem

Air conditioning in public/shared spaces — hotel lobbies, offices, malls — is almost always run on a single fixed setpoint, all day, regardless of whether the room is packed or empty. That's a huge, measurable waste of energy, money, and carbon.

## The Solution

CoolSense tracks real occupancy (headcount) in a room and continuously recalculates the exact cooling capacity that room actually needs, instead of relying on one fixed setpoint. Occupancy can be entered manually or estimated live from a webcam feed using Gemini vision. The system combines occupancy, room size, and live outside weather to recommend a temperature, fan speed, and power draw grounded in real HVAC physics (BTU/hr load, SEER efficiency) — not arbitrary constants.

A built-in simulator generates a realistic week of hotel occupancy data and compares CoolSense against an always-on baseline, so the energy/CO₂/cost savings can be demonstrated without needing a live building to test on.

## How It Works

**Inputs:**
- Building name
- Location (free text — drives live weather lookup and the Thailand-only EGAT label)
- Room size: small / medium / large
- People count — manual number input, or live webcam headcount via Gemini vision (see below)
- AC unit efficiency (SEER) — defaults to 15, or a custom value in [13.0, 25.0]
- Thailand EGAT efficiency label (1–5 stars, or "premium") — only shown when location is Thailand; cosmetic/credibility only, doesn't affect the calculation
- Comfort preference: cold / neutral / warm — shifts the setpoint ±2°C

**Not manually chosen:** outside temperature and humidity are fetched live from [weatherapi.com](https://www.weatherapi.com/) for the given location — not a hot/warm/cool dropdown — so the numbers reflect real current weather.

**Pipeline:**

```
People count + room size (m²) → occupancy density (people ÷ m²)
        ↓
density → AC mode (eco / moderate / full) → setpoint + fan speed
        ↓
room m² + people count → required cooling load (BTU/hr)
        ↓
outside temp/humidity → weather load multiplier → weather-adjusted BTU/hr
        ↓
weather-adjusted BTU/hr ÷ (SEER × 1000) → power (kW)
        ↓
power × time → energy (kWh) → CO₂ (kg) → cost (baht)
```

## The Algorithm (CoolSense V3)

Cooling load is derived from actual room area and occupancy, the way an HVAC engineer would size a unit — not a lookup table:

```
occupancy_density = people_count ÷ room_m²

required_btu_per_hr = (150 × room_m²) + (400 × people_count)
                        ↑ envelope/solar load     ↑ per-person heat gain (ASHRAE)

weather_multiplier = 1 + 0.02 × (outside_temp_c − 33) + 0.003 × (humidity_pct − 60)
adjusted_btu_per_hr = required_btu_per_hr × max(weather_multiplier, 0.5)

power_kw = adjusted_btu_per_hr ÷ (ac_seer × 1000)
```

**Room size → representative m²** (used for the density calculation):
| Size | Range | Representative |
|---|---|---|
| Small | 20–40 m² | 30 m² |
| Medium | 40–80 m² | 60 m² |
| Large | 80+ m² | 120 m² |

**AC modes** (by occupancy density = people ÷ representative m²), selecting setpoint and fan speed:
| Mode | Density | Setpoint | Fan |
|---|---|---|---|
| Eco | < 0.05 people/m² | 26°C | 1 |
| Moderate | 0.05 – 0.15 people/m² | 24°C | 2 |
| Full | ≥ 0.15 people/m² | 21°C | 3 |

A comfort preference (cold/neutral/warm) then shifts the setpoint a further ±2°C.

**Metrics** (Thailand grid assumptions):
- Carbon: 0.5 kg CO₂ per kWh
- Cost: 5 baht per kWh
- Savings = (baseline − smart) for energy, CO₂, and cost, each shown as kWh/kg/baht and % reduction

**Simulation:** the mock data generator produces a realistic week (or any duration) of hourly occupancy — weekday peaks near full-mode threshold, quiet nights, flattened weekends, ±15% noise — and `/simulation/run` compares an always-on baseline against CoolSense hour-by-hour, storing both the summary and the full hourly breakdown for the dashboard's graphs.

## Carbon Analytics and Cleaning Alerts

**Carbon analytics.** The Analytics page has a Carbon tab showing CO₂ emitted, CO₂ avoided against a static baseline, and the % reduction, for today (hourly), 7 days and 30 days. Every live calculation stores the power a static unit sized for full occupancy would have drawn in the same weather (`ac_calculations.baseline_power_kw`), and the page integrates both series over time at 0.5 kg CO₂ per kWh. Rows saved before that column existed have no baseline and are left out.

**Cleaning alerts.** The Maintenance page flags when an AC draws noticeably more power than CoolSense V3 expects for the same setpoint and outside temperature, which is what a dirty filter or coil looks like. It compares the last 7 days against the unit's own history in matching setpoint and weather buckets, and reports watch (10%+ extra), warning (20%+) or critical (35%+). Alerts can be acknowledged, dismissed, or cleared by marking the unit as cleaned. There is no real power meter, so the page runs on generated demo data (use "Generate demo data" on the page); real readings can replace it later. Details are in [`CLAUDE.md`](./CLAUDE.md).

The interface is available in English and Thai (toggle in the header) and uses a blue theme.

## Impact

Example 168-hour (1-week) simulated comparison for a mid-size hotel room:

| | Baseline (always-on) | CoolSense | Savings |
|---|---|---|---|
| Energy | 900 kWh | ~550 kWh | ~38.9% |
| CO₂ | 450 kg | ~275 kg | ~38.9% |
| Cost | 4,500 baht | ~2,750 baht | ~38.9% |

Scaled across all Thai hotels, savings on this order translate to on the order of **158,000 metric tons of CO₂ prevented annually**. Actual numbers vary run-to-run based on room size, weather, and SEER — run the simulator yourself (see below) to reproduce them.

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Vite, Tailwind CSS
- **Backend:** Supabase Edge Functions (Deno)
- **Database:** Supabase (PostgreSQL)
- **AI/Vision:** Gemini (via Vertex AI) for camera-based occupancy counting
- **Weather:** [weatherapi.com](https://www.weatherapi.com/)
- **Deployment:** Vercel (frontend) + Supabase Cloud (backend)

## Project Structure

```
.
├── frontend/                    # Vue 3 app
│   └── src/
│       ├── router.ts             # vue-router (hash history): people, information, analytics, simulation, maintenance
│       ├── views/                # InformationView, PeopleView, SimulationView, AnalyticsView, MaintenanceView
│       ├── components/
│       ├── composables/          # e.g. useOccupancy.ts, useCameraOccupancy.ts, useMaintenanceAlerts.ts
│       └── lib/                  # api clients, carbon.ts, format.ts, i18n.ts, locales/ (en + th)
├── supabase/
│   ├── functions/                # Deno edge functions
│   │   ├── occupancy/              # Read latest people-count reading (any source)
│   │   ├── occupancy-readings/     # Manual people-count input
│   │   ├── occupancy-vision/       # Webcam frame → Gemini (Vertex AI) → headcount
│   │   ├── room-config/            # Singleton room_config GET/PUT
│   │   ├── weather/                 # Live weather by location
│   │   ├── calculation/            # Live AC settings calculation (CoolSense V3)
│   │   ├── simulation/             # Mock data generation, comparison run, dashboard reads
│   │   ├── maintenance/            # Cleaning alerts: evaluate, alerts, trend, mark-serviced, demo data
│   │   └── _shared/                 # Core calculation logic + unit tests
│   └── migrations/                # SQL schema, in chronological order (latest: baseline_power_kw, maintenance tables)
├── tools/
│   └── calculation-tester.html    # Standalone calculator/simulator — no backend needed
├── scripts/
│   └── setup.sh                   # Automated local setup script
└── CLAUDE.md                      # Full project/decision-log spec (source of truth for the algorithm's history)
```

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Docker** (for local Supabase)
- **Supabase CLI** (`brew install supabase/tap/supabase`, or `npm install -g supabase`)
- **Git**

### Automated setup

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

This installs frontend dependencies, installs the Supabase CLI if missing, creates `supabase/.env` from its example, and starts the local Supabase stack.

### Manual setup

```bash
# 1. Frontend dependencies
cd frontend && npm install && cd ..

# 2. Environment files
cp supabase/.env.example supabase/.env
cp frontend/.env.example frontend/.env

# 3. Start local Supabase (applies migrations automatically)
cd supabase && supabase start && cd ..
```

If you already had a local stack running before pulling these changes, apply the newer migrations (`20261016080000_add_baseline_power_kw.sql` and `20261016090000_add_maintenance.sql`) with `supabase db reset` locally, or `supabase db push` for a hosted project.

`supabase start` prints your local API URL and anon key — put those in `frontend/.env`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<printed by supabase start>
```

### Environment variables

**`supabase/.env`** (backend secrets, only needed for these two live integrations):

| Variable | Required for | How to get it |
|---|---|---|
| `WEATHERAPI_KEY` | Live outside temp/humidity lookup | Free key at [weatherapi.com](https://www.weatherapi.com/) |
| `GCP_SERVICE_ACCOUNT_JSON` | Camera-based occupancy counting (optional — see below) | GCP service account JSON key, compacted to one line, with the **Vertex AI User** (`roles/aiplatform.user`) role. Not required if you're only using manual people-count input. |

**`frontend/.env`:**

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (local or hosted) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/publishable key |

Deploying to Supabase Cloud instead of local: set the same backend secrets with `supabase secrets set WEATHERAPI_KEY=... ` / `supabase secrets set GCP_SERVICE_ACCOUNT_JSON='...'`.

## Running the Project

```bash
# Backend (from repo root)
cd supabase && supabase start

# Edge functions that need secrets (weather, occupancy-vision) must be served
# with the env file loaded — `supabase start` alone doesn't inject it:
supabase functions serve --env-file supabase/.env

# Frontend (separate terminal)
cd frontend && npm run dev
```

- Frontend: http://localhost:5173
- Supabase API: http://127.0.0.1:54321
- Supabase Studio (DB GUI): http://127.0.0.1:54323

Prefer to check the calculation logic without running Supabase at all? Open `tools/calculation-tester.html` directly in a browser — it's a self-contained reference implementation of the algorithm and simulator.

## Occupancy Input Without a Camera

The people-count input doesn't require a live webcam — that's just one of two supported paths:

1. **Manual input** — type/slide a people count directly in the app (`PeopleView`). This works everywhere, no camera or GPU needed, and is the simplest way to demo every AC mode.
2. **Camera + Gemini vision** — click "Start Monitoring" in `PeopleView` to let the browser open its camera; every 5 seconds a frame is sent to the `occupancy-vision` edge function, which asks Gemini (via Vertex AI) for a headcount estimate. Works with a laptop webcam, an external USB camera, or a phone camera used as a webcam — any device the browser can open with `getUserMedia` — since it's just sending a static image, not a video stream. No frame is ever stored; only the resulting count is saved. Requires `GCP_SERVICE_ACCOUNT_JSON` (see above); without it, everything else in the app still works via manual input.

## Testing

```bash
# Frontend type checking
cd frontend && npm run typecheck

# Frontend lint
cd frontend && npm run lint

# Shared backend calculation/logic tests (the only automated backend tests)
deno test supabase/functions/_shared/

# Per-function lint/typecheck
cd supabase/functions/<function-name>
deno lint
deno check --config deno.json index.ts
```

CI (`.github/workflows/ci.yml`) runs frontend lint/typecheck and the Deno lint/typecheck/tests on every PR to `dev`/`main`.

## Deployment

Deployment is automated on push to `main` (`.github/workflows/deploy.yml`):
- **Frontend** → Vercel
- **Edge functions** → `supabase functions deploy`

The workflow does not apply database migrations. Run `supabase db push` against the hosted project before merging changes that add migrations, including `20261016080000` and `20261016090000` (carbon baseline column and cleaning-alert tables). The frontend and the `maintenance` and `calculation` functions fail against a database that lacks them.

Manual deploy:

```bash
# Frontend
cd frontend && npm run build   # then deploy dist/ via Vercel

# Backend: push migrations first (adds ac_calculations.baseline_power_kw,
# 20261016080000, and the maintenance tables, 20261016090000), then deploy functions.
# The deploy workflow does not run migrations.
supabase db push
supabase functions deploy
supabase secrets set WEATHERAPI_KEY=your_key
supabase secrets set GCP_SERVICE_ACCOUNT_JSON='...'   # optional, for camera occupancy
```

---

For the full algorithm history, decision log, and every implementation detail (including why each modeling choice was made), see [`CLAUDE.md`](./CLAUDE.md).
