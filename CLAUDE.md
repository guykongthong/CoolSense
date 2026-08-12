# Smart AC Optimization Hackathon Project

## Core Feature Summary

---

## Keeping This File Current

**Whenever a core decision of this project changes — the algorithm/inputs, AC mode thresholds, tech stack, scope, or MVP list — update this file in the same change.** This document is the source of truth for the team; a stale spec here causes rework and conflicting assumptions across sessions/teammates. If a request would change something documented below, update the relevant section(s) here before or alongside implementing it.

---

## Project Overview

**Problem:** AC systems waste energy running full blast in empty/low-occupancy rooms (hotels, offices, malls)

**Solution:** Smart AC system that adjusts temperature & fan speed based on occupancy (people count, currently manual input, ML camera-based counting planned)

**Impact:** Measurable carbon reduction + energy savings

**Timeline:** 2-day hackathon

**Scope:** Software only, no hardware (only input through camera)

**Tech Stack**
- Frontend: Vue.js + Typescript
- Backend: Node.js
- Database: Supabase
- Deployment: Vercel

---

## How It Works

**Input:**
- Building name
- Location (manual text input for now — IP geolocation deferred; also feeds the future weather-by-location feature)
- Room size (small/medium/large — public-space scale, see below)
- Number of people in the room (currently a manual slider/number input; will be replaced by ML-based people counting from camera input later — see `supabase/functions/occupancy`)
- Weather is **not** manually selected — outside temperature and humidity are fetched live from weatherapi.com for `room_config.location` (see `supabase/functions/weather`), not a hot/warm/cool dropdown
- AC unit efficiency (SEER) — "Auto" (4.5 SEER, the standard reference unit) or a custom SEER value; global per room, always shown
- Thailand EGAT efficiency label (1-5 stars, or "premium") — **only shown when location is Thailand**; cosmetic/credibility only, does not affect the calculation

> Occupancy is **not** derived from CO₂ level. People count comes directly from an `occupancy_readings` table (mocked today, ML-populated later). CO₂ was the original plan but was dropped in favor of direct people counting.

**Algorithm Logic:**
```
People count + Room size (m²) → Occupancy density (people ÷ m²)
↓
Density → Determine AC mode
↓
Mode + Room size → Base temperature, fan speed, required BTU/hr
↓
Outside temp/humidity (weatherapi.com, by location) → weather load multiplier → weather-adjusted BTU/hr
↓
Weather-adjusted BTU/hr ÷ (selected SEER × 1000) → power_kw
↓
Calculate energy (kWh) & CO₂ emissions
```

**Room size → representative m²** (midpoint of each public-space range; used only for the density calculation, not stored/enforced in the schema):
- Small: 50-150 m² → 100 m²
- Medium: 150-400 m² → 275 m²
- Large: 400+ m² → 450 m²

**AC Modes** (by occupancy density = people ÷ representative m²):
- **Eco** (density < 0.05 people/m²): 28°C, fan 1, 2,250 BTU/hr base
- **Moderate** (0.05 ≤ density < 0.15 people/m²): 24°C, fan 2, 11,250 BTU/hr base
- **Full** (density ≥ 0.15 people/m²): 21°C, fan 3, 20,250 BTU/hr base, scales up further with extra people beyond the full threshold (+225 BTU/hr per extra person)

Base BTU/hr is also scaled by a room-size multiplier (small ×0.7, medium ×1.0, large ×1.5) — a bigger room has more air volume to cool. See `supabase/functions/_shared/acCalculation.ts` for the reference implementation (mirrored in `tools/calculation-tester.html` for local testing without Supabase running).

> Because the public-space m² scale is large, demoing mode changes needs a people-count range wider than a 0-10 slider (e.g. 0-100) — a 0-10 range only ever reaches "moderate" in a small room and never reaches "full" for any room size.

**Cooling capacity (BTU/hr) and AC unit efficiency (SEER):** power is derived from physics, not an arbitrary per-mode kW table: `power_kw = required_btu_per_hr ÷ (selected_seer × 1000)`. `required_btu_per_hr` is the mode's base BTU/hr × room-size multiplier (+ extra-person BTU/hr in full mode) — it does **not** depend on SEER, matching how a real AC unit's rated BTU/hr capacity is fixed regardless of its efficiency. The BTU/hr numbers were derived from the original per-mode kW table at the standard reference SEER (4.5), so "Auto" (SEER 4.5) reproduces the original power numbers exactly. A higher SEER (more efficient unit) draws less power for the same BTU/hr; a lower SEER draws more. `calculateAcSettings` returns both `power_kw` and `btu_per_hr` (the latter useful for sizing/selecting a real unit). Stored per room on `room_config.ac_seer` (default 4.5) and returned on `ac_calculations.btu_per_hr`.

**Thailand EGAT label:** stored on `room_config.egat_label` (`'1'`-`'5'` or `'premium'`, nullable). Purely cosmetic — shown in the UI only when `room_config.location` is Thailand, never read by `calculateAcSettings`. Enforced server-side too (`supabase/functions/room-config`): rejects setting a label when the resulting location isn't Thailand, and auto-clears a stored label if location changes away from Thailand in a request that doesn't touch the label.

**Weather (outside temperature/humidity):** fetched live from weatherapi.com by `supabase/functions/weather` (needs `WEATHERAPI_KEY` in `supabase/.env` locally, or `supabase secrets set WEATHERAPI_KEY=...` when deployed), using `room_config.location` as the query. Written to a `weather_readings` row (`temp_c`, `humidity_pct`, `condition`, `condition_icon_url`). `calculation` reads the most recent `weather_readings` row and passes `temp_c`/`humidity_pct` into `calculateAcSettings`, which derives a load multiplier: `1 + 0.02 × (outside_temp_c − 33) + 0.003 × (humidity_pct − 60)`, floored at 0.5× — 33°C/60% RH is the baseline the BASE_BTU_PER_HR numbers assume (multiplier 1, unchanged). This multiplier scales `btu_per_hr` (required capacity), not `power_kw` directly, so it composes correctly with the separate SEER-based power derivation. `ac_calculations` stores `outside_temp_c`, `humidity_pct`, `weather_reading_id`, `weather_condition_icon_url`, and a derived `hot`/`warm`/`cool` label (≥33°C hot, 25-33°C warm, <25°C cool) for the legacy `weather` column. If no weather reading exists yet, `calculation` falls back to the 33°C/60% baseline (multiplier 1).

---

## Core MVPs (5 Items)

**1. Input Form** (2-3 hours)
- Building name input
- Location input (text; drives the conditional EGAT field and later weather-by-location)
- Room size dropdown
- People-count input (slider/number, wide enough range e.g. 0-100 to demo all modes — placeholder for future ML camera-based counting)
- No weather selector — outside temperature/humidity are fetched automatically from weatherapi.com by location
- AC unit efficiency selector (Auto / custom SEER) — always shown, global per room
- Thailand EGAT efficiency label selector — only shown when location is Thailand
- Submit button

**2. Temperature Calculation Algorithm** (3-4 hours)
- Convert people count + room size → occupancy density
- Select AC mode (eco/moderate/full) from density thresholds
- Apply room size multiplier to the mode's base BTU/hr (required cooling capacity)
- Fetch outside temp/humidity by location (weatherapi.com) and apply the weather load multiplier to required BTU/hr
- Derive power consumption: power_kw = weather-adjusted BTU/hr ÷ (selected SEER × 1000)

**3. Mock Data Generator** (1-2 hours)
- `POST /simulation/generate-mock-data` (`{ duration_hours?, room_size? }`, defaults 168/medium) **replaces** any existing `occupancy_readings` rows with `source: 'mock'` (deletes then inserts, so repeated calls don't accumulate overlapping batches) with that many hourly rows ending at the call time
- Occupancy targets are density-based (people ÷ room m²) against the real `MODERATE_DENSITY`/`FULL_DENSITY` thresholds from `acCalculation.ts`, not flat people-counts — otherwise medium/large rooms never cross into moderate/full mode. Weekday peak (9am-5pm, 7pm-11pm) lands right at the full-mode threshold; low (other daytime) at 40% of the moderate threshold; night (11pm-7am) near-empty; weekend flattens daytime to ~40% of the weekday peak density; ±15% random noise throughout
- Logic lives in `supabase/functions/_shared/simulation.ts` (`generateMockOccupancy`, pure/testable — `now`/`random` are injectable for deterministic tests)

**4. System Simulation & Comparison** (1-2 hours)
- `POST /simulation/run` (`{ duration_hours?, room_size?, ac_seer?, weather_condition? }`, defaults 168/medium/4.5/warm) reads the most recent `duration_hours` mock readings (400s if not enough exist yet — generate mock data first) and compares:
  - **Current system**: constant 25°C, fan 3, 4.5 kW every hour (`CURRENT_SYSTEM_POWER_KW` in `simulation.ts`)
  - **Smart system**: `calculateAcSettings` per hour, using the mock reading's people count and a representative outside temp/humidity for `weather_condition` (`hot`/`warm`/`cool` — categorical preset, not a live weatherapi.com call per hour; `warm` reproduces `acCalculation.ts`'s own 33°C/60% baseline)
- Metrics per CLAUDE.md's "Metrics Calculated" section below (energy, CO₂ at 0.5 kg/kWh, cost at 5 baht/kWh, % reduction)
- Writes 1 row to `simulation_runs` (summary) + `duration_hours` rows to `simulation_hourly_data` (per-hour breakdown, for the dashboard's line/area graphs)
- Logic lives in `runSimulation` in `supabase/functions/_shared/simulation.ts` (pure function over an already-fetched people-count array — no DB access, independently testable)
- The live `/calculation` endpoint excludes `source: 'mock'` readings from its "latest occupancy reading" query, so a simulation run can never transiently hijack a live calculation result

**Dashboard retrieval endpoints** (part of MVP 5, same `simulation` function):
- `GET /simulation/:id` — single `simulation_runs` row, 404 if not found
- `GET /simulation/:id/hourly-data` — that run's `simulation_hourly_data` rows ordered by `hour_index`, `[]` if none, 404 if the run itself doesn't exist
- `GET /simulation/list` — last 10 `simulation_runs`, newest first (summary columns only)

**Experimental: hybrid model** (`supabase/functions/_shared/hybridCalculation.ts`, `feature/hybrid-model`, not merged/wired into any endpoint yet):
- Same mode selection, BTU sizing, and weather-driven capacity scaling as `calculateAcSettings`, plus a setpoint that **relaxes** (warmer, less power) when outside conditions are milder than the 33°C/60%RH baseline, within fixed per-mode ranges (eco 26-28°C, moderate 22-26°C, full 19-23°C): +0.3°C of relaxation per °C below baseline temp, +0.02°C per %RH below baseline humidity, then ~5% less required BTU/hr per degree relaxed
- Deliberately does **not** tighten the setpoint further when hot/humid — that heat load is already priced into `calculateAcSettings`'s own weather multiplier, so adjusting the setpoint too would double-count it. This reverses an earlier draft of this idea (peer-proposed) that adjusted the setpoint colder when hot, which would have *increased* power while claiming to save it — an internally contradictory result. Confirmed with the user before implementing
- `tools/calculation-tester.html`'s 168-hour simulation section charts all three: static (constant 25°C) vs current model (fixed per-mode temps) vs hybrid, computed client-side over the same mock occupancy data the backend simulation used

**5. Admin Dashboard Display** (2-3 hours)
- Show user inputs
- Display recommended AC settings
- Energy comparison (current vs smart)
- CO₂ impact visualization
- Two graphs:
  - Line graph: Power over 200 hours
  - Area chart: Cumulative energy/CO₂
- `tools/calculation-tester.html` has a working reference implementation of both charts (hand-rolled inline SVG, no external chart library) if useful for the real frontend

---

## Metrics Calculated

**Energy (kWh):**
- Current system: X kWh
- Smart system: Y kWh
- Savings: X - Y = Z kWh (-% reduction)

**Carbon (kg CO₂):**
- Thailand grid: 0.5 kg CO₂ per kWh
- Current: X × 0.5 = A kg CO₂
- Smart: Y × 0.5 = B kg CO₂
- Saved: A - B kg CO₂

**Cost (Baht):**
- Thailand electricity: 5 baht/kWh
- Current: X × 5 baht
- Smart: Y × 5 baht
- Saved: Z baht

---

## Example Output (200-hour demo)

**Current System (always 25°C full):**
- Energy: 900 kWh
- CO₂: 450 kg
- Cost: 4,500 baht

**Smart System:**
- Energy: 550 kWh (-38.9%)
- CO₂: 275 kg (-38.9%)
- Cost: 2,750 baht (-38.9%)

**Annual Scaling (per hotel):**
- CO₂ saved: 15.8 metric tons/year
- Cost saved: 315,000 baht/year

---

## Demo Flow

1. **Show problem:**
   "Library AC runs 24/7 at 25°C"
   Display: 900 kWh, 450 kg CO₂

2. **Run your app:**
   Enter: Room size, people count, weather
   System calculates: Optimal settings

3. **Show results:**
   "Smart system recommends MODERATE + 24°C"
   Display: 550 kWh, 275 kg CO₂

4. **Show savings:**
   38.9% energy reduction
   175 kg CO₂ saved
   1,750 baht saved

5. **Scale up:**
   "For all Thai hotels: 158,000 metric tons CO₂/year"

---

## Implementation Timeline

**Day 1 (8 hours):**
- Morning: MVP 1 (input form) + MVP 2 (algorithm)
- Afternoon: MVP 3 (mock data) + testing

**Day 2 (8 hours):**
- Morning: MVP 4 (simulation) + MVP 5 (dashboard)
- Afternoon: Polish, debug, practice pitch

---

## Team Tasks

**CS/SE:**
- Build input form UI
- Dashboard layout & design
- Integrate algorithm into frontend

**Data Analysis:**
- Build temperature calculation algorithm
- Energy/CO₂ calculation logic
- Comparison metrics (current vs smart)
- Graph generation

**Business Admin:**
- Define AC power specs
- Create demo scenario
- Calculate scaling numbers
- Prepare pitch narrative

**Food Science:**
- Support as needed

---

## What NOT to Include

- Real AC hardware control
- Real CO₂ sensors
- Machine learning
- Multi-building database
- User authentication
- Mobile responsiveness

---

## The Pitch (30 seconds)

"AC systems waste energy cooling empty rooms. We built a smart system that tracks occupancy (people count) and automatically adjusts temperature.

We tested it with realistic 200-hour hotel data:
- Current system: 900 kWh
- Our system: 550 kWh
- Savings: 40% energy, 1,750 baht per week

For all Thai hotels, that's 158,000 metric tons of CO₂ prevented annually."

---

## Success Criteria

- Working input form
- Algorithm correctly converts people count + room size (occupancy density) → AC mode
- Mock data shows 30-40% energy savings
- Dashboard displays graphs + numbers clearly
- Pitch tells coherent story
- Demo doesn't crash

---