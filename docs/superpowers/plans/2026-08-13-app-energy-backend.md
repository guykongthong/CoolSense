# App Energy Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Branch:** `feature/app-energy-backend` (branch off `dev`, merge back to `dev` when done — do not target `main`)

**Goal:** Make `runSimulation()` calculate the app's own infrastructure energy footprint (baseline + per-run overhead) and net savings after subtracting it, persist those fields on `simulation_runs`, and expose them through the existing `/simulation/run` and `/simulation/:id` endpoints.

**Architecture:** All new math lives in `supabase/functions/_shared/simulation.ts` as pure additions to `runSimulation()`'s existing summary construction — no new inputs, no new DB reads. A new migration adds four `not null default 0` columns to `simulation_runs`; `supabase/functions/simulation/index.ts`'s existing insert gets four more fields. The frontend's `SimulationSummary` type (`frontend/src/lib/api.ts`) is updated in this same branch since it's the client-side mirror of this exact contract — updating it here avoids a two-branch race on the same lines.

**Tech Stack:** Deno Edge Functions, Postgres (Supabase migrations), TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-13-app-energy-integration-design.md`

## Correction to the spec

The spec's "Data Integration" section is otherwise accurate for the backend — no corrections needed there. (The frontend-facing correction, about `AnalyticsView.vue` vs `SimulationView.vue`, lives in the sibling frontend plan, not here.)

## Global Constraints

- App energy baseline: **0.1051 kWh/day** (`APP_BASELINE_KWH_PER_DAY`).
- App energy per-run overhead: **0.00185 kWh** (`APP_PER_RUN_OVERHEAD_KWH`).
- Net savings are computed against the **CoolSense V3 vs static-v3** pair (`static_v3_energy_kwh` / `coolsense_v3_energy_kwh`), not the legacy V2 pair — the design mockup explicitly labels the "Smart System" column "(CoolSense V3)", and V3 is the physically-grounded model per CLAUDE.md. This plan does not touch the V2 fields at all.
- Thailand grid figures already in `simulation.ts`: `CO2_PER_KWH = 0.5`, `COST_PER_KWH_BAHT = 5` — reuse these constants, don't redefine.
- Both new constants must stay configurable (exported, not inlined) per the spec's "Implementation Notes" — future tests may override them.

---

### Task 1: App energy constants + `appEnergyKwh()` + extend `SimulationSummary`

**Files:**
- Modify: `supabase/functions/_shared/simulation.ts`
- Test: `supabase/functions/_shared/simulation.test.ts`

**Interfaces:**
- Produces: `APP_BASELINE_KWH_PER_DAY: number`, `APP_PER_RUN_OVERHEAD_KWH: number` (exported constants); `SimulationSummary` gains `app_energy_kwh: number`, `net_energy_saved_kwh: number`, `net_co2_saved_kg: number`, `net_cost_saved_baht: number`.

- [ ] **Step 1: Write the failing tests**

Add to `supabase/functions/_shared/simulation.test.ts` (near the other `runSimulation` summary tests, e.g. after the CO2/cost test around line 150):

```typescript
Deno.test("runSimulation: app_energy_kwh is the per-day baseline prorated over duration_hours plus the fixed per-run overhead", () => {
  const { summary } = runSimulation(new Array(24).fill(20), "medium", 4.5, "warm");
  // 0.1051 kWh/day / 24h * 24h + 0.00185 kWh overhead == 0.1051 + 0.00185
  assertAlmostEquals(summary.app_energy_kwh, 0.1051 + 0.00185, 1e-9);
});

Deno.test("runSimulation: app_energy_kwh scales linearly with duration_hours", () => {
  const short = runSimulation(new Array(24).fill(20), "medium", 4.5, "warm").summary;
  const long = runSimulation(new Array(48).fill(20), "medium", 4.5, "warm").summary;
  const expectedDelta = (0.1051 / 24) * 24; // one more day's baseline, same fixed overhead
  assertAlmostEquals(long.app_energy_kwh - short.app_energy_kwh, expectedDelta, 1e-9);
});

Deno.test("runSimulation: empty input has zero app_energy_kwh (no run means no overhead)", () => {
  const { summary } = runSimulation([], "medium", 4.5, "warm");
  assertEquals(summary.app_energy_kwh, 0);
  assertEquals(summary.net_energy_saved_kwh, 0);
  assertEquals(summary.net_co2_saved_kg, 0);
  assertEquals(summary.net_cost_saved_baht, 0);
});

Deno.test("runSimulation: net savings equal V3 energy saved minus app_energy_kwh, priced at the Thailand grid figures", () => {
  const { summary } = runSimulation([0, 5, 20, 41, 3], "medium", 4.5, "warm");
  const v3EnergySaved = summary.static_v3_energy_kwh - summary.coolsense_v3_energy_kwh;
  const expectedNet = v3EnergySaved - summary.app_energy_kwh;
  assertAlmostEquals(summary.net_energy_saved_kwh, expectedNet, 1e-9);
  assertAlmostEquals(summary.net_co2_saved_kg, expectedNet * 0.5, 1e-9);
  assertAlmostEquals(summary.net_cost_saved_baht, expectedNet * 5, 1e-9);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/_shared/simulation.test.ts`
Expected: FAIL — `app_energy_kwh`/`net_energy_saved_kwh`/etc. are `undefined` on `summary`, so the `assertAlmostEquals`/`assertEquals` calls fail.

- [ ] **Step 3: Implement**

In `supabase/functions/_shared/simulation.ts`, add near the other Thailand-grid constants (after `const COST_PER_KWH_BAHT = 5;` around line 95):

```typescript
// App infrastructure energy footprint — Vercel frontend, Supabase Postgres,
// edge functions, weatherapi.com calls. See
// docs/superpowers/specs/2026-08-13-app-energy-integration-design.md for the
// component-by-component derivation. Kept as separate exported constants
// (not folded into one number) so they stay independently testable/tunable.
export const APP_BASELINE_KWH_PER_DAY = 0.1051;
export const APP_PER_RUN_OVERHEAD_KWH = 0.00185;

// Zero duration means no run happened at all — no baseline prorated, no
// per-run overhead charged. Guards the "empty input" summary staying
// all-zero (matches the existing empty-input test for the other fields).
function appEnergyKwh(durationHours: number): number {
  if (durationHours <= 0) return 0;
  return (APP_BASELINE_KWH_PER_DAY / 24) * durationHours + APP_PER_RUN_OVERHEAD_KWH;
}
```

Extend the `SimulationSummary` interface (currently ends `v3_pct_reduction: number;` around line 45):

```typescript
export interface SimulationSummary {
  duration_hours: number;
  current_energy_kwh: number;
  smart_energy_kwh: number;
  current_co2_kg: number;
  smart_co2_kg: number;
  current_cost_baht: number;
  smart_cost_baht: number;
  pct_reduction: number;
  static_v3_energy_kwh: number;
  coolsense_v3_energy_kwh: number;
  static_v3_co2_kg: number;
  coolsense_v3_co2_kg: number;
  static_v3_cost_baht: number;
  coolsense_v3_cost_baht: number;
  v3_pct_reduction: number;
  app_energy_kwh: number;
  net_energy_saved_kwh: number;
  net_co2_saved_kg: number;
  net_cost_saved_baht: number;
}
```

In `runSimulation()`, after the existing `const v3EnergySaved = static_v3_energy_kwh - coolsense_v3_energy_kwh;` line (around line 300), add:

```typescript
  const app_energy_kwh = appEnergyKwh(peopleCounts.length);
  const net_energy_saved_kwh = v3EnergySaved - app_energy_kwh;
```

And add the four new fields to the returned `summary` object (after `v3_pct_reduction: ...,`):

```typescript
    v3_pct_reduction: static_v3_energy_kwh > 0 ? (v3EnergySaved / static_v3_energy_kwh) * 100 : 0,
    app_energy_kwh,
    net_energy_saved_kwh,
    net_co2_saved_kg: net_energy_saved_kwh * CO2_PER_KWH,
    net_cost_saved_baht: net_energy_saved_kwh * COST_PER_KWH_BAHT,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/_shared/simulation.test.ts`
Expected: PASS (all tests, including the 4 new ones and every pre-existing test — `peopleCounts.length` in `[]` case is `0`, matching the existing "empty input" test's other zeroed fields).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/simulation.ts supabase/functions/_shared/simulation.test.ts
git commit -m "feat: add app energy footprint and net savings to runSimulation"
```

---

### Task 2: Migration — persist app energy fields on `simulation_runs`

**Files:**
- Create: `supabase/migrations/20260813080000_add_app_energy_metrics.sql`

**Interfaces:**
- Consumes: nothing (schema-only change).
- Produces: four new nullable-never columns on `simulation_runs`, consumed by Task 3's insert.

- [ ] **Step 1: Write the migration**

```sql
-- App infrastructure energy footprint (Vercel + Supabase + weatherapi.com)
-- and net savings after subtracting it from the CoolSense V3 comparison.
-- See docs/superpowers/specs/2026-08-13-app-energy-integration-design.md.
alter table simulation_runs add column app_energy_kwh numeric not null default 0;
alter table simulation_runs add column net_energy_saved_kwh numeric not null default 0;
alter table simulation_runs add column net_co2_saved_kg numeric not null default 0;
alter table simulation_runs add column net_cost_saved_baht numeric not null default 0;
```

- [ ] **Step 2: Apply locally and verify**

Run: `supabase db reset`
Expected: migration applies cleanly, no errors; `supabase db reset` runs all prior migrations plus this one in order.

Run: `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -c "\d simulation_runs"` (or open Studio at `http://127.0.0.1:54323` → Table Editor → `simulation_runs`)
Expected: the four new columns appear with type `numeric`, `not null`, default `0`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260813080000_add_app_energy_metrics.sql
git commit -m "feat: add app energy columns to simulation_runs"
```

---

### Task 3: Persist and return the new fields from `/simulation/run`

**Files:**
- Modify: `supabase/functions/simulation/index.ts`

**Interfaces:**
- Consumes: `SimulationSummary` fields from Task 1 (`app_energy_kwh`, `net_energy_saved_kwh`, `net_co2_saved_kg`, `net_cost_saved_baht`); `simulation_runs` columns from Task 2.
- Produces: `/simulation/run`'s JSON response (`{ simulation_run_id, summary }`) already returns the whole `summary` object as-is (see the handler's final `return Response.json({ simulation_run_id: run.id, summary });`), so no response-shape change is needed there — this task only needs the DB insert to persist the new fields so `GET /simulation/:id` (which does `select("*")`) returns them too.

- [ ] **Step 1: Update the insert in `handleRun`**

In `supabase/functions/simulation/index.ts`, in the `.insert({...})` call inside `handleRun` (currently ends `v3_pct_reduction: summary.v3_pct_reduction,`), add:

```typescript
      v3_pct_reduction: summary.v3_pct_reduction,
      app_energy_kwh: summary.app_energy_kwh,
      net_energy_saved_kwh: summary.net_energy_saved_kwh,
      net_co2_saved_kg: summary.net_co2_saved_kg,
      net_cost_saved_baht: summary.net_cost_saved_baht,
```

- [ ] **Step 2: Type-check the function**

Run: `cd supabase/functions/simulation && deno check --config deno.json index.ts`
Expected: no type errors (the insert object's shape isn't statically typed against the table, so this mainly confirms `summary.app_energy_kwh` etc. resolve — i.e. Task 1 actually exports them on `SimulationSummary`).

- [ ] **Step 3: Manual end-to-end check against the local stack**

Run (requires `supabase start` and `supabase functions serve --env-file supabase/.env` already running in another terminal):

```bash
curl -s --location --request POST 'http://127.0.0.1:54321/functions/v1/simulation/generate-mock-data' \
  --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
  --header 'Content-Type: application/json' \
  --data '{"duration_hours":24,"room_size":"medium"}' > /dev/null

curl -s --location --request POST 'http://127.0.0.1:54321/functions/v1/simulation/run' \
  --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
  --header 'Content-Type: application/json' \
  --data '{"duration_hours":24,"room_size":"medium","weather_condition":"diurnal"}' | python3 -m json.tool
```

Expected: JSON response's `summary` includes `app_energy_kwh` (~0.10695 for 24h: `0.1051 + 0.00185`), `net_energy_saved_kwh`, `net_co2_saved_kg`, `net_cost_saved_baht`. Then:

```bash
curl -s "http://127.0.0.1:54321/functions/v1/simulation/<simulation_run_id from previous response>" \
  --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' | python3 -m json.tool
```

Expected: same four fields present on the stored row (confirms Task 2's columns + this task's insert both worked).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/simulation/index.ts
git commit -m "feat: persist app energy fields on simulation_runs"
```

---

### Task 4: Mirror the contract in the frontend API client type

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: the exact field names/types from Task 1's `SimulationSummary` (Deno) — must match verbatim.
- Produces: `SimulationSummary` (frontend) gains the same four fields, so `SimulationRun` (which extends it) and any consumer in `SimulationView.vue` sees them typed. This is the only file the sibling frontend plan needs from this branch — it does not touch `frontend/src/lib/api.ts` itself, to avoid a merge conflict between the two branches.

- [ ] **Step 1: Extend the interface**

In `frontend/src/lib/api.ts`, the `SimulationSummary` interface (currently ends `v3_pct_reduction: number;` around line 101):

```typescript
export interface SimulationSummary {
  duration_hours: number;
  current_energy_kwh: number;
  smart_energy_kwh: number;
  current_co2_kg: number;
  smart_co2_kg: number;
  current_cost_baht: number;
  smart_cost_baht: number;
  pct_reduction: number;
  static_v3_energy_kwh: number;
  coolsense_v3_energy_kwh: number;
  static_v3_co2_kg: number;
  coolsense_v3_co2_kg: number;
  static_v3_cost_baht: number;
  coolsense_v3_cost_baht: number;
  v3_pct_reduction: number;
  app_energy_kwh: number;
  net_energy_saved_kwh: number;
  net_co2_saved_kg: number;
  net_cost_saved_baht: number;
}
```

- [ ] **Step 2: Type-check the frontend**

Run: `cd frontend && npm run typecheck`
Expected: PASS — no consumer destructures `SimulationSummary` exhaustively today (`SimulationView.vue` reads named fields off `summary`), so widening the interface can't break existing callers.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: mirror app energy fields in the frontend SimulationSummary type"
```

---

## Self-Review Notes

- **Spec coverage:** "Calculate and integrate app energy consumption" → Task 1. "`runSimulation()` returns app energy metrics" → Task 1. "`SimulationSummary` interface updated" → Task 1 (Deno) + Task 4 (frontend mirror). "App energy constants... keep configurable for testing" → exported `APP_BASELINE_KWH_PER_DAY`/`APP_PER_RUN_OVERHEAD_KWH`. "No breaking changes to existing endpoints" → Task 3 only adds fields to an insert and relies on the existing `select("*")`/`Response.json({..., summary})` shapes, nothing removed or renamed.
- Net savings are computed against V3, not V2 — this is a deliberate interpretation of the spec's ambiguous "smart savings" (see Global Constraints); flagged back to the spec's author.
