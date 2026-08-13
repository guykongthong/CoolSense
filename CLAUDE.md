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
- Comfort preference (cold/neutral/warm) — shifts the CoolSense V2 setpoint ±2°C; see below

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
- `POST /simulation/run` (`{ duration_hours?, room_size?, ac_seer?, weather_condition?, static_temp_c?, comfort_preference? }`, defaults 168/medium/4.5/warm/25/neutral) reads the most recent `duration_hours` mock readings (400s if not enough exist yet — generate mock data first) and compares:
  - **Static system** (the "current system" baseline, i.e. what a hotel/office runs today): always-on, fan 3, constant draw at a configurable setpoint — `static_temp_c` (default 25°C, `DEFAULT_STATIC_TEMP_C` in `simulation.ts`). Power scales ~5%/°C off the default (colder setpoint = more power), same rate CoolSense V2 uses for its own setpoint-to-power scaling, floored the same way.
  - **Smart system**: `calculateCoolSenseV2Settings` (CoolSense V2 — see below) per hour, using the mock reading's people count, `comfort_preference`, and a representative outside temp/humidity for `weather_condition` (`hot`/`warm`/`cool`/`diurnal`). The old base/V1 model (`calculateAcSettings`) is no longer exposed as a separate comparison point anywhere in the app — it now exists only as the physics engine CoolSense V2 composes on top of internally.
- Metrics per CLAUDE.md's "Metrics Calculated" section below (energy, CO₂ at 0.5 kg/kWh, cost at 5 baht/kWh, % reduction)
- `simulation_runs` additionally stores `static_temp_c` and `comfort_preference` for traceability of what baseline a given run compared against.
- Writes 1 row to `simulation_runs` (summary) + `duration_hours` rows to `simulation_hourly_data` (per-hour breakdown, for the dashboard's line/area graphs)
- Logic lives in `runSimulation` in `supabase/functions/_shared/simulation.ts` (pure function over an already-fetched people-count array — no DB access, independently testable)
- The live `/calculation` endpoint excludes `source: 'mock'` readings from its "latest occupancy reading" query, so a simulation run can never transiently hijack a live calculation result

**Dashboard retrieval endpoints** (part of MVP 5, same `simulation` function):
- `GET /simulation/:id` — single `simulation_runs` row, 404 if not found
- `GET /simulation/:id/hourly-data` — that run's `simulation_hourly_data` rows ordered by `hour_index`, `[]` if none, 404 if the run itself doesn't exist
- `GET /simulation/list` — last 10 `simulation_runs`, newest first (summary columns only)

**CoolSense V2** (`supabase/functions/_shared/coolSenseV2Calculation.ts`, **live** — this is what `/calculation` actually runs, not `calculateAcSettings` directly):
- Same mode selection, BTU sizing, and weather-driven capacity scaling as `calculateAcSettings` (the base/V1 model), plus two additions:
  1. The setpoint **relaxes** (warmer, less power) when outside conditions are milder than the 33°C/60%RH baseline, within fixed per-mode ranges (eco 26-28°C, moderate 22-26°C, full 19-23°C): +0.3°C of relaxation per °C below baseline temp, +0.02°C per %RH below baseline humidity, then ~5% less required BTU/hr per degree relaxed. Deliberately does **not** tighten the setpoint further when hot/humid — that heat load is already priced into `calculateAcSettings`'s own weather multiplier, so adjusting the setpoint too would double-count it. (This reversed an earlier peer-proposed draft that tightened the setpoint when hot while claiming energy savings — physically contradictory; confirmed the correct direction with the user before implementing.)
  2. `room_config.comfort_preference` (`'cold'` | `'neutral'` | `'warm'`, default `'neutral'`) then shifts the setpoint a further ±2°C, applied on top of the weather-eased temp and still clamped to the mode's range, with power scaled ~5%/°C to match (a `'cold'` preference can raise power above the base model's; `'warm'` lowers it further)
- `calculateCoolSenseV2Settings` returns `base_temp_c` (what V1 alone would set) and `adjusted_temp_c` (the actual setpoint, after weather easing + comfort). `/calculation` stores `adjusted_temp_c` as `ac_calculations.temperature_c` (so existing consumers reading `temperature_c` get the real setpoint) plus `base_temp_c` and `comfort_preference` for traceability
- `tools/calculation-tester.html`'s 168-hour simulation section charts two series — static (configurable setpoint, default 25°C) vs CoolSense V2 — both computed entirely server-side by `/simulation/run` now that CoolSense V2 is the only comparison model; the tool no longer duplicates any V1/V2 math client-side for this section. Comfort preference is read from the same selector used by the live single-calculation flow.
- **Diurnal weather** (`runSimulation`'s `weather_condition: "diurnal"`, alongside the existing flat `hot`/`warm`/`cool` presets): a continuous 24h day/night cycle (`getDiurnalWeather` in `simulation.ts`) instead of one flat value for the whole run — cosine curve, trough 27°C/50%RH at 3am, peak 36°C/80%RH at 3pm. Needed because `warm` and `hot` both sit at/above the weather baseline, so with a flat preset CoolSense V2's setpoint relaxation never has mild-enough conditions to fire and it silently collapses to the same power draw it would have without any easing at all, for the *entire* simulation — this was reported as "the two models show the same results" before being traced to the flat-preset default. `calculation-tester.html`'s weather dropdown defaults to "Diurnal" for this reason; requires per-hour `captured_at` timestamps (the mock occupancy readings already have them)

**`room-config` GET/PUT** (`supabase/functions/room-config`): `GET` returns the singleton row as-is (404 only if the seed row is somehow missing). `PUT` (POST also still accepted, for backward compatibility) validates and partially updates: `room_size` ∈ {small,medium,large}; `ac_seer` ∈ [2.0, 6.0]; `egat_label` ∈ {'1'-'5','premium', null}, only settable when the resulting `location` is Thailand (rejects otherwise, and auto-clears a stored label if `location` moves away from Thailand in a request that doesn't touch the label); `comfort_preference` ∈ {cold,neutral,warm}.

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

## 자주 사용하는 명령어

**프론트엔드 (`frontend/`, Vue 3 + TypeScript + Vite)**
- 개발 서버: `npm run dev`
- 빌드: `npm run build` (`vue-tsc -b && vite build`)
- 린트: `npm run lint`
- 타입체크만: `npm run typecheck` (`vue-tsc --noEmit`)
- 환경변수: `frontend/.env.example` 참고 (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

**백엔드 (`supabase/functions/`, Deno Edge Functions)**
- 로컬 Supabase 스택 기동: `supabase start` (Studio 54323 / API 54321 / DB 54322)
- 로컬에서 함수 서빙(날씨 함수처럼 시크릿이 필요하면 `--env-file` 필수): `supabase functions serve --env-file supabase/.env`
- 함수별 린트: `cd supabase/functions/<함수명> && deno lint`
- 함수별 타입체크: `cd supabase/functions/<함수명> && deno check --config deno.json index.ts`
- 공유 로직 테스트(현재 자동화 테스트는 이곳뿐): `deno test supabase/functions/_shared/`
- 마이그레이션 로컬 적용/리셋: `supabase db reset`
- 새 마이그레이션 생성: `supabase migration new <이름>`
- 각 함수는 curl 호출 예시를 자기 `index.ts` 파일 하단 주석에 포함하고 있음 (그걸 우선 참고)

**계산 로직만 빠르게 확인**
- `tools/calculation-tester.html`을 브라우저로 직접 열면 Supabase 없이 `calculateAcSettings` 로직을 바로 테스트 가능 (아래 "복제된 계산 로직" 주의사항 참고)

---

## 아키텍처 개요

**최상위 3영역:** `frontend/`(Vue 3 + TS + Vite), `supabase/functions/`(Deno Edge Functions), `supabase/migrations/`(Postgres 스키마, 시간순 SQL 파일).

**요청/데이터 흐름 (함수 간 호출 관계가 아니라 테이블을 매개로 연결됨):**
1. `occupancy-readings` 함수가 사람 수를 `occupancy_readings` 테이블에 기록 (현재는 수동 입력용 POST 엔드포인트; 추후 ML 카메라 파이프라인으로 대체 예정 — 컬럼 스키마가 바뀔 수 있다는 TODO가 여러 파일에 남아 있음). `occupancy` 함수는 반대로 최신 값을 조회만 하며, 테이블이 비어 있으면 mock 데이터로 폴백.
2. `room-config` 함수가 `room_config`의 단일 행(`id=1`)을 갱신 — 건물명/위치/방크기/SEER/EGAT 라벨. `location`이 태국이 아닐 때 `egat_label`을 설정하려는 요청은 거부하고, `location`을 태국 밖으로 바꾸는 요청은 기존 라벨을 자동으로 지움 (UI 검증과 별개로 서버에서도 강제).
3. `weather` 함수가 `room_config.location`을 조회해 weatherapi.com에서 현재 날씨를 가져와 `weather_readings`에 기록.
4. `calculation` 함수가 `room_config` + 최신 `occupancy_readings` + 최신 `weather_readings`를 병렬로 읽어 조합한 뒤, **핵심 비즈니스 로직인 `supabase/functions/_shared/acCalculation.ts`의 `calculateAcSettings()`** 하나만 호출해 결과를 계산하고 `ac_calculations`에 저장.
5. `simulation` 함수는 아직 미구현 상태(`"not implemented yet"`만 반환) — 168시간 mock 데이터 생성과 현재 vs 스마트 시스템 비교가 남은 작업.
6. 프론트엔드(`useOccupancy.ts`)는 Supabase Realtime으로 `occupancy_readings` INSERT를 구독하도록 배선되어 있지만, `App.vue`는 아직 Vite 기본 템플릿(`HelloWorld.vue`) 그대로라 실제 입력 폼/대시보드 UI는 미구현.

**주의할 점:**
- 계산 로직은 `supabase/functions/_shared/acCalculation.ts`에 있고, 같은 로직이 `tools/calculation-tester.html`에도 그대로 복제되어 있음(자동 동기화 없음) — 알고리즘/상수를 바꾸면 두 파일을 함께 수정해야 함.
- 모든 Edge Function은 `withSupabase({ auth: ["publishable", "secret"] })`로 감싸져 있고 `ctx.supabaseAdmin`(서비스 롤)으로 DB에 접근. 이 MVP는 RLS를 켜지 않고 `grant`문으로만 테이블 접근을 제어하므로(`supabase/migrations`의 grant 마이그레이션 참고), 새 테이블을 추가하면 grant도 함께 추가해야 함 — 빠뜨리면 "permission denied for table" 에러가 조용히 폴백 코드에 삼켜질 수 있음(`calculation` 함수가 실제로 이 문제를 겪었던 이력이 있음, 관련 마이그레이션 주석 참고).
- `room_config`는 `id=1` 단일 행 설계 — 멀티 빌딩/멀티 룸을 지원하지 않음(의도된 MVP 범위 제한, 위 "What NOT to Include" 참고).

**CI/배포:**
- `.github/workflows/ci.yml` (dev/main 대상 PR, dev push): 프론트엔드는 lint+typecheck, 엣지 함수는 함수별 `deno lint`/`deno check` + `_shared` 테스트만 수행 — 로컬 Supabase 스택을 띄우지 않는 정적 검사 위주.
- `.github/workflows/deploy.yml` (main push 시): 프론트엔드는 Vercel로, 엣지 함수는 `supabase functions deploy`로 각각 배포.

---