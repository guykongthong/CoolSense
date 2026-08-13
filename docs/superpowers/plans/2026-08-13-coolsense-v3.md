# CoolSense V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CoolSense V3, a realistic-HVAC-physics calculation model, as a third simulation-only comparison point alongside the static baseline and CoolSense V2 — without changing V1/V2 behavior or the live `/calculation` endpoint.

**Architecture:** A new base physics engine (`acCalculationV3.ts`) replaces V1's per-mode BTU buckets with an additive area+occupancy load formula and a realistic SEER constant. A new easing layer (`coolSenseV3Calculation.ts`) wraps it exactly the way `coolSenseV2Calculation.ts` wraps V1. `simulation.ts`'s `runSimulation` gains a third, size-aware "static-v3" baseline and a CoolSense V3 series, additive to the existing static/V2 fields. New DB columns and a chart series expose it through `/simulation/run` and `calculation-tester.html`.

**Tech Stack:** Deno (Supabase Edge Functions), TypeScript, `jsr:@std/assert@1` for tests, Postgres migrations (raw SQL), vanilla JS/inline-SVG for the tester page.

## Global Constraints

- `/calculation` (live endpoint) must keep using CoolSense V2 — do not wire V3 into it.
- `acCalculation.ts` and `coolSenseV2Calculation.ts` must not change behavior — the only touch to `acCalculation.ts` is exporting `getWeatherMultiplier` (adding the `export` keyword), which changes nothing at runtime.
- All new DB columns are additive (`not null default 0`) — no existing column is renamed, dropped, or changed.
- Constants and rationale: `ENVELOPE_LOAD_BTU_PER_SQM = 150`, `PERSON_LOAD_BTU_PER_HR = 400`, `STANDARD_SEER_V3 = 15` — see spec `docs/superpowers/specs/2026-08-13-coolsense-v3-design.md` for the reasoning behind each.
- Follow existing test file conventions exactly: `Deno.test(...)` blocks, `jsr:@std/assert@1`'s `assertEquals`/`assertAlmostEquals`, one focused behavior per test, comments showing the arithmetic for non-obvious expected values.

---

### Task 1: `acCalculationV3.ts` — realistic base physics engine

**Files:**
- Modify: `supabase/functions/_shared/acCalculation.ts` (export `getWeatherMultiplier`)
- Create: `supabase/functions/_shared/acCalculationV3.ts`
- Test: `supabase/functions/_shared/acCalculationV3.test.ts`

**Interfaces:**
- Consumes: `getAcMode(peopleCount, roomSize)`, `getWeatherMultiplier(outsideTempC, humidityPct)`, `ROOM_SIZE_SQM`, `WEATHER_BASELINE_TEMP_C`, `WEATHER_BASELINE_HUMIDITY_PCT`, `type AcMode`, `type RoomSize` — all from `./acCalculation.ts`.
- Produces: `calculateAcSettingsV3(peopleCount, roomSize, seer?, outsideTempC?, humidityPct?): AcSettingsV3` where `AcSettingsV3 = { mode: AcMode, temperature_c: number, fan_speed: number, power_kw: number, btu_per_hr: number }`; exported constants `ENVELOPE_LOAD_BTU_PER_SQM`, `PERSON_LOAD_BTU_PER_HR`, `STANDARD_SEER_V3`.

- [ ] **Step 1: Export `getWeatherMultiplier` from `acCalculation.ts`**

In `supabase/functions/_shared/acCalculation.ts`, change:
```ts
function getWeatherMultiplier(outsideTempC: number, humidityPct: number): number {
```
to:
```ts
export function getWeatherMultiplier(outsideTempC: number, humidityPct: number): number {
```
This is the only change to this file. No test needed — behavior is identical, only visibility changes, and existing `acCalculation.test.ts` continues to pass unmodified (verify in step at the end of this task).

- [ ] **Step 2: Write the failing tests for `acCalculationV3.ts`**

Create `supabase/functions/_shared/acCalculationV3.test.ts`:
```ts
import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettingsV3, ENVELOPE_LOAD_BTU_PER_SQM, PERSON_LOAD_BTU_PER_HR, STANDARD_SEER_V3 } from "./acCalculationV3.ts";

// required_btu_per_hr = ENVELOPE_LOAD_BTU_PER_SQM * room_m² + PERSON_LOAD_BTU_PER_HR * people_count
// power_kw = btu_per_hr / (seer * 1000). Room m²: small=100, medium=275, large=450.

Deno.test("constants match the design spec", () => {
  assertEquals(ENVELOPE_LOAD_BTU_PER_SQM, 150);
  assertEquals(PERSON_LOAD_BTU_PER_HR, 400);
  assertEquals(STANDARD_SEER_V3, 15);
});

Deno.test("calculateAcSettingsV3 at 0 people, baseline weather: pure envelope load, scales linearly with room m²", () => {
  assertEquals(calculateAcSettingsV3(0, "small"), { mode: "eco", temperature_c: 28, fan_speed: 1, power_kw: 1.0, btu_per_hr: 15000 });
  assertEquals(calculateAcSettingsV3(0, "medium"), { mode: "eco", temperature_c: 28, fan_speed: 1, power_kw: 2.75, btu_per_hr: 41250 });
  assertEquals(calculateAcSettingsV3(0, "large"), { mode: "eco", temperature_c: 28, fan_speed: 1, power_kw: 4.5, btu_per_hr: 67500 });
});

Deno.test("calculateAcSettingsV3 adds per-person load on top of envelope load, at every mode (not just beyond a threshold)", () => {
  // medium, moderate mode (14 people, density 0.0509): 150*275 + 400*14 = 41250 + 5600 = 46850
  const moderate = calculateAcSettingsV3(14, "medium");
  assertEquals(moderate.mode, "moderate");
  assertEquals(moderate.btu_per_hr, 46850);
  assertAlmostEquals(moderate.power_kw, 46850 / 15000, 1e-9);

  // medium, full mode (42 people, density 0.1527): 41250 + 400*42 = 41250 + 16800 = 58050
  const full = calculateAcSettingsV3(42, "medium");
  assertEquals(full.mode, "full");
  assertEquals(full.btu_per_hr, 58050);
  assertEquals(full.power_kw, 3.87);
});

Deno.test("calculateAcSettingsV3 mode/temperature/fan selection matches acCalculation.ts's thresholds", () => {
  assertEquals(calculateAcSettingsV3(4, "small").mode, "eco");
  assertEquals(calculateAcSettingsV3(5, "small").mode, "moderate");
  assertEquals(calculateAcSettingsV3(15, "small").mode, "full");
  assertEquals(calculateAcSettingsV3(15, "small").temperature_c, 21);
  assertEquals(calculateAcSettingsV3(15, "small").fan_speed, 3);
});

Deno.test("calculateAcSettingsV3 defaults to STANDARD_SEER_V3 (15) when seer omitted", () => {
  assertEquals(calculateAcSettingsV3(0, "medium").power_kw, calculateAcSettingsV3(0, "medium", 15).power_kw);
});

Deno.test("calculateAcSettingsV3 scales power for a realistic custom SEER (13-25 range)", () => {
  // medium, 0 people, baseline weather: btu_per_hr = 41250
  assertAlmostEquals(calculateAcSettingsV3(0, "medium", 20).power_kw, 41250 / 20000, 1e-9);
  assertAlmostEquals(calculateAcSettingsV3(0, "medium", 13).power_kw, 41250 / 13000, 1e-9);
});

Deno.test("calculateAcSettingsV3 keeps required BTU/hr constant across SEER — only power_kw changes", () => {
  const low = calculateAcSettingsV3(14, "medium", 13);
  const standard = calculateAcSettingsV3(14, "medium", 15);
  const high = calculateAcSettingsV3(14, "medium", 25);
  assertEquals(low.btu_per_hr, 46850);
  assertEquals(standard.btu_per_hr, 46850);
  assertEquals(high.btu_per_hr, 46850);
});

Deno.test("calculateAcSettingsV3 reuses acCalculation.ts's weather multiplier — hotter-than-baseline raises required BTU/hr", () => {
  // medium, 0 people, 43°C (10° above 33° baseline) → +2%/°C = 1.2x on 41250
  const settings = calculateAcSettingsV3(0, "medium", 15, 43, 60);
  assertEquals(settings.btu_per_hr, 49500); // 41250 * 1.2
  assertEquals(settings.power_kw, 3.3);
});

Deno.test("calculateAcSettingsV3 defaults to baseline weather (33°C/60% RH) when omitted", () => {
  assertEquals(calculateAcSettingsV3(0, "medium").btu_per_hr, calculateAcSettingsV3(0, "medium", 15, 33, 60).btu_per_hr);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd supabase/functions/_shared && deno test acCalculationV3.test.ts`
Expected: FAIL — `acCalculationV3.ts` does not exist yet (module not found).

- [ ] **Step 4: Implement `acCalculationV3.ts`**

Create `supabase/functions/_shared/acCalculationV3.ts`:
```ts
import {
  type AcMode,
  getAcMode,
  getWeatherMultiplier,
  ROOM_SIZE_SQM,
  type RoomSize,
  WEATHER_BASELINE_HUMIDITY_PCT,
  WEATHER_BASELINE_TEMP_C,
} from "./acCalculation.ts";

export interface AcSettingsV3 {
  mode: AcMode;
  temperature_c: number;
  fan_speed: number;
  power_kw: number;
  btu_per_hr: number;
}

// Same per-mode setpoint/fan as V1 — mode selection and comfort targets
// aren't what the professor's feedback was about; only the *capacity*
// (BTU/hr) and efficiency (SEER) numbers were unrealistic.
const MODE_TEMP_FAN: Record<AcMode, { temperature_c: number; fan_speed: number }> = {
  eco: { temperature_c: 28, fan_speed: 1 },
  moderate: { temperature_c: 24, fan_speed: 2 },
  full: { temperature_c: 21, fan_speed: 3 },
};

// Baseline solar/envelope/ambient load a tropical public space needs even
// when unoccupied — conservative end of the commonly-cited 150-450
// BTU/hr/m² tropical commercial rule-of-thumb range. This is a rule-of-thumb
// figure appropriate for a hackathon, not a formal ASHRAE Manual J load
// calculation.
export const ENVELOPE_LOAD_BTU_PER_SQM = 150;

// ASHRAE seated/light-activity occupant heat gain (sensible + latent
// combined), applied to the ACTUAL people count at every mode — replaces
// V1's per-mode-bucket approach, which only added extra capacity for people
// beyond the full-mode threshold and undercounted body heat (225 BTU/hr).
export const PERSON_LOAD_BTU_PER_HR = 400;

// Mid-range standard-efficiency unit, representative of the Thai market.
// Real SEER units are BTU/Wh, typically 13-25 — V1's STANDARD_SEER (4.5)
// was reverse-engineered to reproduce an arbitrary kW table and doesn't
// represent a real unit. "Auto" in the UI for V3 means this value.
export const STANDARD_SEER_V3 = 15;

/**
 * CoolSense V3's base physics engine: required cooling capacity is computed
 * directly from room area and actual occupancy (an additive load), instead
 * of V1's per-mode BTU buckets + room-size multiplier. Mode (from the same
 * density thresholds as V1) only selects setpoint/fan-speed here — capacity
 * scales continuously with real load. Weather multiplier formula and
 * baseline (33°C/60% RH) are unchanged from V1, reused via
 * getWeatherMultiplier.
 */
export function calculateAcSettingsV3(
  peopleCount: number,
  roomSize: RoomSize,
  seer: number = STANDARD_SEER_V3,
  outsideTempC: number = WEATHER_BASELINE_TEMP_C,
  humidityPct: number = WEATHER_BASELINE_HUMIDITY_PCT,
): AcSettingsV3 {
  const mode = getAcMode(peopleCount, roomSize);
  const { temperature_c, fan_speed } = MODE_TEMP_FAN[mode];

  const requiredBtu = ENVELOPE_LOAD_BTU_PER_SQM * ROOM_SIZE_SQM[roomSize] + PERSON_LOAD_BTU_PER_HR * peopleCount;
  const weatherMultiplier = getWeatherMultiplier(outsideTempC, humidityPct);
  const btu_per_hr = requiredBtu * weatherMultiplier;
  const power_kw = btu_per_hr / (seer * 1000);

  return { mode, temperature_c, fan_speed, power_kw, btu_per_hr };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd supabase/functions/_shared && deno test acCalculationV3.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 6: Confirm `acCalculation.test.ts` still passes unmodified**

Run: `cd supabase/functions/_shared && deno test acCalculation.test.ts`
Expected: PASS — the `export` keyword added in Step 1 doesn't change behavior.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/acCalculation.ts supabase/functions/_shared/acCalculationV3.ts supabase/functions/_shared/acCalculationV3.test.ts
git commit -m "Add CoolSense V3 base physics engine (realistic area+occupancy load)"
```

---

### Task 2: `coolSenseV3Calculation.ts` — weather easing + comfort layer

**Files:**
- Create: `supabase/functions/_shared/coolSenseV3Calculation.ts`
- Test: `supabase/functions/_shared/coolSenseV3Calculation.test.ts`

**Interfaces:**
- Consumes: `calculateAcSettingsV3`, `STANDARD_SEER_V3` from `./acCalculationV3.ts` (Task 1); `type AcMode`, `type RoomSize`, `WEATHER_BASELINE_TEMP_C`, `WEATHER_BASELINE_HUMIDITY_PCT` from `./acCalculation.ts`; `type ComfortPreference` from `./coolSenseV2Calculation.ts` (already exists, values `"cold" | "neutral" | "warm"`).
- Produces: `calculateCoolSenseV3Settings(peopleCount, roomSize, seer?, outsideTempC?, humidityPct?, comfortPreference?): CoolSenseV3Settings` where `CoolSenseV3Settings = { mode: AcMode, fan_speed: number, base_temp_c: number, adjusted_temp_c: number, power_kw: number, btu_per_hr: number }`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/_shared/coolSenseV3Calculation.test.ts` (mirrors `coolSenseV2Calculation.test.ts`'s cases against the V3 base):
```ts
import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettingsV3 } from "./acCalculationV3.ts";
import { calculateCoolSenseV3Settings } from "./coolSenseV3Calculation.ts";
import type { RoomSize } from "./acCalculation.ts";

Deno.test("at baseline conditions (33°C/60% RH), neutral comfort: CoolSense V3 matches the base V3 model exactly", () => {
  const base = calculateAcSettingsV3(20, "medium", 15, 33, 60);
  const v3 = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60);
  assertEquals(v3.base_temp_c, base.temperature_c);
  assertEquals(v3.adjusted_temp_c, base.temperature_c);
  assertEquals(v3.power_kw, base.power_kw);
  assertEquals(v3.btu_per_hr, base.btu_per_hr);
});

Deno.test("hot + humid (above baseline): CoolSense V3 holds at the base temp, no double-counted tightening", () => {
  const base = calculateAcSettingsV3(50, "medium", 15, 38, 85);
  const v3 = calculateCoolSenseV3Settings(50, "medium", 15, 38, 85);
  assertEquals(base.mode, "full");
  assertEquals(v3.adjusted_temp_c, v3.base_temp_c);
  assertEquals(v3.power_kw, base.power_kw);
});

Deno.test("cool + dry (below baseline): setpoint eases warmer and power drops below the base V3 model", () => {
  const baseSettings = calculateAcSettingsV3(40, "medium", 15, 27, 30);
  const v3 = calculateCoolSenseV3Settings(40, "medium", 15, 27, 30);
  assertEquals(v3.adjusted_temp_c > v3.base_temp_c, true);
  assertEquals(v3.power_kw < baseSettings.power_kw, true);
});

Deno.test("adjusted_temp_c always stays within [range.min, range.max] for its mode, across many conditions and comfort preferences", () => {
  const ranges: Record<string, { min: number; max: number }> = {
    eco: { min: 26, max: 28 },
    moderate: { min: 22, max: 26 },
    full: { min: 19, max: 23 },
  };
  const roomSizes: RoomSize[] = ["small", "medium", "large"];
  const temps = [-10, 0, 15, 27, 33, 38, 45];
  const humidities = [0, 30, 60, 85, 100];
  const peopleCounts = [0, 5, 20, 40, 60, 100];
  const comforts: Array<"cold" | "neutral" | "warm"> = ["cold", "neutral", "warm"];

  for (const roomSize of roomSizes) {
    for (const temp of temps) {
      for (const humidity of humidities) {
        for (const people of peopleCounts) {
          for (const comfort of comforts) {
            const v3 = calculateCoolSenseV3Settings(people, roomSize, 15, temp, humidity, comfort);
            const range = ranges[v3.mode];
            assertEquals(
              v3.adjusted_temp_c >= range.min && v3.adjusted_temp_c <= range.max,
              true,
              `mode=${v3.mode} comfort=${comfort} adjusted_temp_c=${v3.adjusted_temp_c} outside [${range.min},${range.max}]`,
            );
          }
        }
      }
    }
  }
});

Deno.test("CoolSense V3 power_kw never exceeds the base V3 model's power_kw at neutral comfort", () => {
  const cases: Array<[number, RoomSize, number, number]> = [
    [0, "small", 33, 60],
    [10, "medium", 20, 40],
    [40, "medium", 27, 30],
    [70, "large", 38, 85],
  ];
  for (const [people, roomSize, temp, humidity] of cases) {
    const base = calculateAcSettingsV3(people, roomSize, 15, temp, humidity);
    const v3 = calculateCoolSenseV3Settings(people, roomSize, 15, temp, humidity, "neutral");
    assertEquals(v3.power_kw <= base.power_kw, true, `v3 ${v3.power_kw} > base ${base.power_kw}`);
  }
});

Deno.test("comfort_preference defaults to neutral (no offset) when omitted", () => {
  const withDefault = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60);
  const explicitNeutral = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "neutral");
  assertEquals(withDefault, explicitNeutral);
});

Deno.test("comfort_preference 'warm': +2°C, clamped to moderate's ceiling", () => {
  const v3 = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "warm");
  assertEquals(v3.mode, "moderate");
  assertEquals(v3.base_temp_c, 24);
  assertEquals(v3.adjusted_temp_c, 26);
});

Deno.test("comfort_preference 'cold': -2°C, and power_kw rises above the base V3 model", () => {
  const base = calculateAcSettingsV3(20, "medium", 15, 33, 60);
  const v3 = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "cold");
  assertEquals(v3.adjusted_temp_c, 22);
  assertEquals(v3.power_kw > base.power_kw, true);
});

Deno.test("comfort_preference ordering: cold power >= neutral power >= warm power, for the same conditions", () => {
  const cold = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "cold");
  const neutral = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "neutral");
  const warm = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "warm");
  assertEquals(cold.power_kw >= neutral.power_kw, true);
  assertEquals(neutral.power_kw >= warm.power_kw, true);
});

Deno.test("exact ease-degree math for a moderate-mode mild-condition case", () => {
  // moderate mode, 10°C below baseline temp, 20%RH below baseline humidity.
  // tempEase = 0.3*10 = 3, humidityEase = 0.02*20 = 0.4 → raw ease 3.4,
  // clamped to moderate's ceiling (26), base 24 → applied change = 2.
  const v3 = calculateCoolSenseV3Settings(15, "medium", 15, 23, 40);
  assertEquals(v3.mode, "moderate");
  assertEquals(v3.base_temp_c, 24);
  assertEquals(v3.adjusted_temp_c, 26);
  const base = calculateAcSettingsV3(15, "medium", 15, 23, 40);
  assertAlmostEquals(v3.btu_per_hr, base.btu_per_hr * 0.9, 1e-9); // 1 - 0.05*2
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd supabase/functions/_shared && deno test coolSenseV3Calculation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `coolSenseV3Calculation.ts`**

Create `supabase/functions/_shared/coolSenseV3Calculation.ts` — structurally identical to `coolSenseV2Calculation.ts`, wrapping the V3 base engine instead of V1:
```ts
import { calculateAcSettingsV3, STANDARD_SEER_V3 } from "./acCalculationV3.ts";
import { type AcMode, type RoomSize, WEATHER_BASELINE_HUMIDITY_PCT, WEATHER_BASELINE_TEMP_C } from "./acCalculation.ts";
import type { ComfortPreference } from "./coolSenseV2Calculation.ts";

export interface CoolSenseV3Settings {
  mode: AcMode;
  fan_speed: number;
  base_temp_c: number;
  adjusted_temp_c: number;
  power_kw: number;
  btu_per_hr: number;
}

// Identical setpoint ranges, easing rule, and comfort offsets to
// coolSenseV2Calculation.ts — V3 changes the underlying capacity/SEER
// physics (acCalculationV3.ts), not this easing behavior, so the V2-vs-V3
// comparison isolates exactly that difference.
const MODE_TEMP_RANGE: Record<AcMode, { min: number; max: number }> = {
  eco: { min: 26, max: 28 },
  moderate: { min: 22, max: 26 },
  full: { min: 19, max: 23 },
};

const TEMP_EASE_PER_DEGREE_C_BELOW_BASELINE = 0.3;
const HUMIDITY_EASE_PER_PCT_BELOW_BASELINE = 0.02;

const COMFORT_OFFSET_C: Record<ComfortPreference, number> = {
  cold: -2,
  neutral: 0,
  warm: 2,
};

const POWER_CHANGE_PER_DEGREE_C = 0.05;
const MIN_POWER_MULTIPLIER = 0.5;

export function calculateCoolSenseV3Settings(
  peopleCount: number,
  roomSize: RoomSize,
  seer: number = STANDARD_SEER_V3,
  outsideTempC: number = WEATHER_BASELINE_TEMP_C,
  humidityPct: number = WEATHER_BASELINE_HUMIDITY_PCT,
  comfortPreference: ComfortPreference = "neutral",
): CoolSenseV3Settings {
  const base = calculateAcSettingsV3(peopleCount, roomSize, seer, outsideTempC, humidityPct);
  const range = MODE_TEMP_RANGE[base.mode];

  const tempEase = Math.max(0, TEMP_EASE_PER_DEGREE_C_BELOW_BASELINE * (WEATHER_BASELINE_TEMP_C - outsideTempC));
  const humidityEase = Math.max(
    0,
    HUMIDITY_EASE_PER_PCT_BELOW_BASELINE * (WEATHER_BASELINE_HUMIDITY_PCT - humidityPct),
  );
  const weatherEasedTemp = Math.min(range.max, base.temperature_c + tempEase + humidityEase);

  const comfortOffset = COMFORT_OFFSET_C[comfortPreference];
  const adjusted_temp_c = Math.min(range.max, Math.max(range.min, weatherEasedTemp + comfortOffset));

  const totalAppliedChange = adjusted_temp_c - base.temperature_c;
  const powerMultiplier = Math.max(MIN_POWER_MULTIPLIER, 1 - POWER_CHANGE_PER_DEGREE_C * totalAppliedChange);
  const btu_per_hr = base.btu_per_hr * powerMultiplier;
  const power_kw = btu_per_hr / (seer * 1000);

  return {
    mode: base.mode,
    fan_speed: base.fan_speed,
    base_temp_c: base.temperature_c,
    adjusted_temp_c,
    power_kw,
    btu_per_hr,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd supabase/functions/_shared && deno test coolSenseV3Calculation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/coolSenseV3Calculation.ts supabase/functions/_shared/coolSenseV3Calculation.test.ts
git commit -m "Add CoolSense V3 weather-easing + comfort layer"
```

---

### Task 3: Extend `simulation.ts` with a size-aware static-v3 baseline and the V3 series

**Files:**
- Modify: `supabase/functions/_shared/simulation.ts`
- Test: `supabase/functions/_shared/simulation.test.ts`

**Interfaces:**
- Consumes: `calculateAcSettingsV3` from `./acCalculationV3.ts` (Task 1); `calculateCoolSenseV3Settings` from `./coolSenseV3Calculation.ts` (Task 2); existing `FULL_DENSITY`, `ROOM_SIZE_SQM`, `type RoomSize` from `./acCalculation.ts` (already imported).
- Produces: `SimulationHourResult` gains `static_v3_power_kw`, `coolsense_v3_power_kw`, `static_v3_cumulative_kwh`, `coolsense_v3_cumulative_kwh`, `static_v3_cumulative_co2`, `coolsense_v3_cumulative_co2` (all `number`). `SimulationSummary` gains `static_v3_energy_kwh`, `coolsense_v3_energy_kwh`, `static_v3_co2_kg`, `coolsense_v3_co2_kg`, `static_v3_cost_baht`, `coolsense_v3_cost_baht`, `v3_pct_reduction` (all `number`). `runSimulation`'s signature is unchanged (no new parameters) — V3 uses the same `roomSize`/`seer`/`weatherCondition`/`staticTempC`/`comfortPreference` inputs already passed in.

**Design note on the static-v3 baseline (read before implementing):** the static-v3 baseline must represent "sized correctly for the room's full-mode occupancy, and never backs off below what that peak load requires" — not simply "V3's engine evaluated at the user's configured `static_temp_c`". If the configured `static_temp_c` (default 25°C) were used directly, it would sit *warmer* than full mode's own 21°C setpoint, and CoolSense V3 running genuinely full at neutral comfort (which correctly targets 21°C) would then draw *more* power than the "dumb" baseline during real peak occupancy — backwards for the demo story. So the static-v3 baseline clamps its effective setpoint to be **at least as cold as full mode's own base temp** (`min(staticTempC, fullModeBaseTemp)`) before applying the existing 5%/°C static-scaling rate. This guarantees static-v3 power is always ≥ CoolSense V3's power at neutral or warm comfort preference (a `"cold"` comfort preference can still legitimately exceed it — an explicit occupant override, not a bug).

- [ ] **Step 1: Write the failing tests**

Add to `supabase/functions/_shared/simulation.test.ts` (append; imports need updating too — see below):

First, update the import block at the top of the file:
```ts
import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { getAcMode, type RoomSize } from "./acCalculation.ts";
import { calculateCoolSenseV2Settings } from "./coolSenseV2Calculation.ts";
import { calculateCoolSenseV3Settings } from "./coolSenseV3Calculation.ts";
import {
  CURRENT_SYSTEM_POWER_KW,
  DEFAULT_STATIC_TEMP_C,
  generateMockOccupancy,
  getDiurnalWeather,
  runSimulation,
} from "./simulation.ts";
```

Then append these test cases at the end of the file:
```ts
// ---- CoolSense V3 / static-v3 baseline ----

Deno.test("runSimulation: static_v3 baseline scales with room size (small < medium < large) at default static temp", () => {
  const small = runSimulation([0], "small", 15, "warm");
  const medium = runSimulation([0], "medium", 15, "warm");
  const large = runSimulation([0], "large", 15, "warm");
  assertEquals(small.hourly[0].static_v3_power_kw < medium.hourly[0].static_v3_power_kw, true);
  assertEquals(medium.hourly[0].static_v3_power_kw < large.hourly[0].static_v3_power_kw, true);
});

Deno.test("runSimulation: static_v3 baseline at default static_temp_c (25°C, clamped to full mode's 21°C) equals the full-occupancy V3 power exactly", () => {
  // medium room: full-mode implied occupancy = ceil(0.15 * 275) = 42 people.
  // 25°C is warmer than full mode's 21°C base, so it clamps to 21°C — no
  // multiplier adjustment (degreesColderThanFullModeBase = 0).
  const { hourly } = runSimulation([0], "medium", 15, "warm", undefined, DEFAULT_STATIC_TEMP_C);
  const worstCase = calculateCoolSenseV3Settings(42, "medium", 15, 33, 60, "neutral");
  assertAlmostEquals(hourly[0].static_v3_power_kw, worstCase.power_kw, 1e-9);
});

Deno.test("runSimulation: a static_temp_c colder than full mode's base (21°C) raises static_v3 power further", () => {
  const default25 = runSimulation([0], "medium", 15, "warm", undefined, DEFAULT_STATIC_TEMP_C);
  const colder18 = runSimulation([0], "medium", 15, "warm", undefined, 18);
  assertEquals(colder18.hourly[0].static_v3_power_kw > default25.hourly[0].static_v3_power_kw, true);
});

Deno.test("runSimulation: CoolSense V3 hourly power matches calculateCoolSenseV3Settings for that hour", () => {
  const peopleCounts = [0, 5, 20];
  const { hourly } = runSimulation(peopleCounts, "medium", 15, "warm");
  peopleCounts.forEach((people, i) => {
    const expected = calculateCoolSenseV3Settings(people, "medium", 15, 33, 60, "neutral"); // "warm" preset == baseline
    assertEquals(hourly[i].coolsense_v3_power_kw, expected.power_kw);
  });
});

Deno.test("runSimulation: CoolSense V3 (neutral comfort) never exceeds the static-v3 baseline, even at full occupancy", () => {
  // large room, full-mode implied occupancy = ceil(0.15*450) = 68 people, baseline weather.
  const { hourly } = runSimulation([68], "large", 15, "warm", undefined, DEFAULT_STATIC_TEMP_C, "neutral");
  assertEquals(hourly[0].coolsense_v3_power_kw <= hourly[0].static_v3_power_kw, true);
});

Deno.test("runSimulation: static_v3 and coolsense_v3 cumulative sums are monotonic and match the summary totals at the last hour", () => {
  const { hourly, summary } = runSimulation([0, 5, 10, 20, 3], "medium", 15, "hot");
  for (let i = 1; i < hourly.length; i++) {
    assertEquals(hourly[i].static_v3_cumulative_kwh >= hourly[i - 1].static_v3_cumulative_kwh, true);
    assertEquals(hourly[i].coolsense_v3_cumulative_kwh >= hourly[i - 1].coolsense_v3_cumulative_kwh, true);
  }
  const last = hourly[hourly.length - 1];
  assertAlmostEquals(last.static_v3_cumulative_kwh, summary.static_v3_energy_kwh, 1e-9);
  assertAlmostEquals(last.coolsense_v3_cumulative_kwh, summary.coolsense_v3_energy_kwh, 1e-9);
});

Deno.test("runSimulation: v3 CO2 and cost use the Thailand grid figures (0.5 kg/kWh, 5 baht/kWh)", () => {
  const { summary } = runSimulation([0, 0, 0], "medium", 15, "warm");
  assertEquals(summary.static_v3_co2_kg, summary.static_v3_energy_kwh * 0.5);
  assertEquals(summary.static_v3_cost_baht, summary.static_v3_energy_kwh * 5);
  assertEquals(summary.coolsense_v3_co2_kg, summary.coolsense_v3_energy_kwh * 0.5);
  assertEquals(summary.coolsense_v3_cost_baht, summary.coolsense_v3_energy_kwh * 5);
});

Deno.test("runSimulation: v3_pct_reduction is positive across a realistic mixed-occupancy week", () => {
  const readings = generateMockOccupancy(168, "medium", { now: new Date(2026, 7, 10, 0, 0, 0), random: () => 0.5 });
  const { summary } = runSimulation(readings.map((r) => r.people_count), "medium", 15, "warm");
  assertEquals(summary.coolsense_v3_energy_kwh < summary.static_v3_energy_kwh, true);
  assertEquals(summary.v3_pct_reduction > 0, true);
  assertAlmostEquals(
    summary.v3_pct_reduction,
    ((summary.static_v3_energy_kwh - summary.coolsense_v3_energy_kwh) / summary.static_v3_energy_kwh) * 100,
    1e-9,
  );
});

Deno.test("runSimulation: empty input produces a zeroed-out v3 summary too, not a crash", () => {
  const { summary } = runSimulation([], "medium", 15, "warm");
  assertEquals(summary.static_v3_energy_kwh, 0);
  assertEquals(summary.coolsense_v3_energy_kwh, 0);
  assertEquals(summary.v3_pct_reduction, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd supabase/functions/_shared && deno test simulation.test.ts`
Expected: FAIL — `coolSenseV3Calculation.ts` import resolves (Task 2 done), but `static_v3_power_kw` etc. are `undefined` on the result, so assertions fail.

- [ ] **Step 3: Implement the `simulation.ts` changes**

Add imports at the top of `supabase/functions/_shared/simulation.ts`:
```ts
import { calculateAcSettingsV3 } from "./acCalculationV3.ts";
import { calculateCoolSenseV3Settings } from "./coolSenseV3Calculation.ts";
```

Add the `staticV3PowerKw` helper right after the existing `staticSystemPowerKw` function (around line 55):
```ts
// The static-v3 baseline for the CoolSense V3 comparison: sized for the
// room's full-mode occupancy (never under-capacity for real peak load), and
// never backs off below what that peak load requires — a naive system
// doesn't adapt to actual occupancy, so its effective setpoint can't be
// milder than what full occupancy already demands. `staticTempC` can still
// push it COLDER than full mode's own base temp (an explicitly configured
// aggressive baseline), which raises power further; it just can't make the
// baseline complacently warmer than what peak crowding needs. Reuses the
// same 5%/°C scaling rate and floor as staticSystemPowerKw, for consistency.
function staticV3PowerKw(roomSize: RoomSize, seer: number, staticTempC: number): number {
  const fullOccupancyPeople = Math.ceil(FULL_DENSITY * ROOM_SIZE_SQM[roomSize]);
  const worstCase = calculateAcSettingsV3(fullOccupancyPeople, roomSize, seer);
  const effectiveStaticTempC = Math.min(staticTempC, worstCase.temperature_c);
  const degreesColderThanFullModeBase = worstCase.temperature_c - effectiveStaticTempC;
  const multiplier = Math.max(
    STATIC_MIN_POWER_MULTIPLIER,
    1 + STATIC_POWER_CHANGE_PER_DEGREE_C * degreesColderThanFullModeBase,
  );
  return worstCase.power_kw * multiplier;
}
```

Extend the `SimulationHourResult` and `SimulationSummary` interfaces:
```ts
export interface SimulationHourResult {
  hour_index: number;
  current_power_kw: number;
  smart_power_kw: number;
  current_cumulative_kwh: number;
  smart_cumulative_kwh: number;
  current_cumulative_co2: number;
  smart_cumulative_co2: number;
  static_v3_power_kw: number;
  coolsense_v3_power_kw: number;
  static_v3_cumulative_kwh: number;
  coolsense_v3_cumulative_kwh: number;
  static_v3_cumulative_co2: number;
  coolsense_v3_cumulative_co2: number;
}

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
}
```

Replace the body of `runSimulation` (keep the signature unchanged) with:
```ts
export function runSimulation(
  peopleCounts: number[],
  roomSize: RoomSize,
  seer: number,
  weatherCondition: WeatherCondition,
  capturedAt?: Date[],
  staticTempC: number = DEFAULT_STATIC_TEMP_C,
  comfortPreference: ComfortPreference = "neutral",
): { hourly: SimulationHourResult[]; summary: SimulationSummary } {
  const hourly: SimulationHourResult[] = [];
  const staticPowerKw = staticSystemPowerKw(staticTempC);
  const staticV3Kw = staticV3PowerKw(roomSize, seer, staticTempC);

  let currentCumulativeKwh = 0;
  let smartCumulativeKwh = 0;
  let currentCumulativeCo2 = 0;
  let smartCumulativeCo2 = 0;
  let staticV3CumulativeKwh = 0;
  let coolsenseV3CumulativeKwh = 0;
  let staticV3CumulativeCo2 = 0;
  let coolsenseV3CumulativeCo2 = 0;

  peopleCounts.forEach((peopleCount, hour_index) => {
    const weather = getWeatherForHour(weatherCondition, capturedAt?.[hour_index]);
    const smartSettings = calculateCoolSenseV2Settings(
      peopleCount,
      roomSize,
      seer,
      weather.tempC,
      weather.humidityPct,
      comfortPreference,
    );
    const v3Settings = calculateCoolSenseV3Settings(
      peopleCount,
      roomSize,
      seer,
      weather.tempC,
      weather.humidityPct,
      comfortPreference,
    );

    currentCumulativeKwh += staticPowerKw;
    smartCumulativeKwh += smartSettings.power_kw;
    currentCumulativeCo2 = currentCumulativeKwh * CO2_PER_KWH;
    smartCumulativeCo2 = smartCumulativeKwh * CO2_PER_KWH;

    staticV3CumulativeKwh += staticV3Kw;
    coolsenseV3CumulativeKwh += v3Settings.power_kw;
    staticV3CumulativeCo2 = staticV3CumulativeKwh * CO2_PER_KWH;
    coolsenseV3CumulativeCo2 = coolsenseV3CumulativeKwh * CO2_PER_KWH;

    hourly.push({
      hour_index,
      current_power_kw: staticPowerKw,
      smart_power_kw: smartSettings.power_kw,
      current_cumulative_kwh: currentCumulativeKwh,
      smart_cumulative_kwh: smartCumulativeKwh,
      current_cumulative_co2: currentCumulativeCo2,
      smart_cumulative_co2: smartCumulativeCo2,
      static_v3_power_kw: staticV3Kw,
      coolsense_v3_power_kw: v3Settings.power_kw,
      static_v3_cumulative_kwh: staticV3CumulativeKwh,
      coolsense_v3_cumulative_kwh: coolsenseV3CumulativeKwh,
      static_v3_cumulative_co2: staticV3CumulativeCo2,
      coolsense_v3_cumulative_co2: coolsenseV3CumulativeCo2,
    });
  });

  const current_energy_kwh = currentCumulativeKwh;
  const smart_energy_kwh = smartCumulativeKwh;
  const energySaved = current_energy_kwh - smart_energy_kwh;

  const static_v3_energy_kwh = staticV3CumulativeKwh;
  const coolsense_v3_energy_kwh = coolsenseV3CumulativeKwh;
  const v3EnergySaved = static_v3_energy_kwh - coolsense_v3_energy_kwh;

  const summary: SimulationSummary = {
    duration_hours: peopleCounts.length,
    current_energy_kwh,
    smart_energy_kwh,
    current_co2_kg: current_energy_kwh * CO2_PER_KWH,
    smart_co2_kg: smart_energy_kwh * CO2_PER_KWH,
    current_cost_baht: current_energy_kwh * COST_PER_KWH_BAHT,
    smart_cost_baht: smart_energy_kwh * COST_PER_KWH_BAHT,
    pct_reduction: current_energy_kwh > 0 ? (energySaved / current_energy_kwh) * 100 : 0,
    static_v3_energy_kwh,
    coolsense_v3_energy_kwh,
    static_v3_co2_kg: static_v3_energy_kwh * CO2_PER_KWH,
    coolsense_v3_co2_kg: coolsense_v3_energy_kwh * CO2_PER_KWH,
    static_v3_cost_baht: static_v3_energy_kwh * COST_PER_KWH_BAHT,
    coolsense_v3_cost_baht: coolsense_v3_energy_kwh * COST_PER_KWH_BAHT,
    v3_pct_reduction: static_v3_energy_kwh > 0 ? (v3EnergySaved / static_v3_energy_kwh) * 100 : 0,
  };

  return { hourly, summary };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd supabase/functions/_shared && deno test simulation.test.ts`
Expected: PASS (all cases, including the pre-existing ones — verify none regressed).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/simulation.ts supabase/functions/_shared/simulation.test.ts
git commit -m "Add size-aware static-v3 baseline and CoolSense V3 series to runSimulation"
```

---

### Task 4: Migration — add V3 columns to `simulation_runs` and `simulation_hourly_data`

**Files:**
- Create: `supabase/migrations/20260813070000_add_coolsense_v3.sql`

**Interfaces:**
- Consumes: nothing (raw SQL).
- Produces: `simulation_runs` columns `static_v3_energy_kwh`, `coolsense_v3_energy_kwh`, `static_v3_co2_kg`, `coolsense_v3_co2_kg`, `static_v3_cost_baht`, `coolsense_v3_cost_baht`, `v3_pct_reduction` (all `numeric not null default 0`); `simulation_hourly_data` columns `static_v3_power_kw`, `coolsense_v3_power_kw`, `static_v3_cumulative_kwh`, `coolsense_v3_cumulative_kwh`, `static_v3_cumulative_co2`, `coolsense_v3_cumulative_co2` (all `numeric not null default 0`). Names match `SimulationSummary`/`SimulationHourResult` field names exactly (Task 3), since `simulation/index.ts` inserts those objects directly.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260813070000_add_coolsense_v3.sql`:
```sql
-- CoolSense V3: a realistic-HVAC-physics comparison model, added alongside
-- the existing static/CoolSense V2 comparison in simulation_runs and
-- simulation_hourly_data. Additive only — no existing column changes.
-- Default 0 for existing historical rows, which predate V3.
alter table simulation_runs add column static_v3_energy_kwh numeric not null default 0;
alter table simulation_runs add column coolsense_v3_energy_kwh numeric not null default 0;
alter table simulation_runs add column static_v3_co2_kg numeric not null default 0;
alter table simulation_runs add column coolsense_v3_co2_kg numeric not null default 0;
alter table simulation_runs add column static_v3_cost_baht numeric not null default 0;
alter table simulation_runs add column coolsense_v3_cost_baht numeric not null default 0;
alter table simulation_runs add column v3_pct_reduction numeric not null default 0;

alter table simulation_hourly_data add column static_v3_power_kw numeric not null default 0;
alter table simulation_hourly_data add column coolsense_v3_power_kw numeric not null default 0;
alter table simulation_hourly_data add column static_v3_cumulative_kwh numeric not null default 0;
alter table simulation_hourly_data add column coolsense_v3_cumulative_kwh numeric not null default 0;
alter table simulation_hourly_data add column static_v3_cumulative_co2 numeric not null default 0;
alter table simulation_hourly_data add column coolsense_v3_cumulative_co2 numeric not null default 0;
```

- [ ] **Step 2: Apply the migration locally and verify**

Run: `supabase db reset` (or `supabase migration up` if Supabase is already running locally)
Expected: migration applies cleanly, no errors. Then verify columns exist:
Run: `supabase db execute --sql "select column_name from information_schema.columns where table_name = 'simulation_runs' and column_name like '%v3%';"`
Expected: lists the 7 new `simulation_runs` columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260813070000_add_coolsense_v3.sql
git commit -m "Add CoolSense V3 columns to simulation_runs and simulation_hourly_data"
```

---

### Task 5: Wire V3 into `simulation/index.ts`'s `/simulation/run` and `/simulation/list`

**Files:**
- Modify: `supabase/functions/simulation/index.ts`

**Interfaces:**
- Consumes: `SimulationSummary`'s new fields (Task 3), the new DB columns (Task 4).
- Produces: `/simulation/run`'s response `summary` includes the v3 fields (already true automatically, since it returns `summary` from `runSimulation` directly — only the DB insert needs updating); `/simulation/list` additionally returns `v3_pct_reduction` and `coolsense_v3_energy_kwh` per row.

- [ ] **Step 1: Update the `simulation_runs` insert in `handleRun`**

In `supabase/functions/simulation/index.ts`, find the `.insert({...})` call inside `handleRun` (around line 201) and add the new fields:
```ts
  const { data: run, error: runError } = await db
    .from("simulation_runs")
    .insert({
      duration_hours: summary.duration_hours,
      current_energy_kwh: summary.current_energy_kwh,
      smart_energy_kwh: summary.smart_energy_kwh,
      current_co2_kg: summary.current_co2_kg,
      smart_co2_kg: summary.smart_co2_kg,
      current_cost_baht: summary.current_cost_baht,
      smart_cost_baht: summary.smart_cost_baht,
      pct_reduction: summary.pct_reduction,
      static_temp_c: staticTempC,
      comfort_preference: comfortPreference,
      static_v3_energy_kwh: summary.static_v3_energy_kwh,
      coolsense_v3_energy_kwh: summary.coolsense_v3_energy_kwh,
      static_v3_co2_kg: summary.static_v3_co2_kg,
      coolsense_v3_co2_kg: summary.coolsense_v3_co2_kg,
      static_v3_cost_baht: summary.static_v3_cost_baht,
      coolsense_v3_cost_baht: summary.coolsense_v3_cost_baht,
      v3_pct_reduction: summary.v3_pct_reduction,
    })
    .select()
    .maybeSingle();
```
(No change needed to the `hourlyRows` mapping — it already spreads `...h`, so the new `SimulationHourResult` fields insert automatically now that the DB columns exist from Task 4.)

- [ ] **Step 2: Update `handleListSimulations`'s select columns**

Find the `.select(...)` call inside `handleListSimulations` (around line 280) and add the v3 summary fields:
```ts
  const { data, error } = await db
    .from("simulation_runs")
    .select("id, duration_hours, pct_reduction, current_energy_kwh, smart_energy_kwh, v3_pct_reduction, coolsense_v3_energy_kwh, created_at")
    .order("created_at", { ascending: false })
    .limit(RECENT_SIMULATIONS_LIMIT);
```

- [ ] **Step 3: Manually verify against a local Supabase instance**

Run: `supabase functions serve --no-verify-jwt` (in one terminal), then in another:
```bash
curl -s -X POST 'http://127.0.0.1:54321/functions/v1/simulation/generate-mock-data' \
  --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
  --header 'Content-Type: application/json' \
  --data '{"duration_hours":24,"room_size":"medium"}'

curl -s -X POST 'http://127.0.0.1:54321/functions/v1/simulation/run' \
  --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
  --header 'Content-Type: application/json' \
  --data '{"duration_hours":24,"room_size":"medium","weather_condition":"warm"}'
```
Expected: the second response's `summary` includes `static_v3_energy_kwh`, `coolsense_v3_energy_kwh`, `v3_pct_reduction` with non-zero, plausible values (`v3_pct_reduction` positive).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/simulation/index.ts
git commit -m "Persist and expose CoolSense V3 fields through /simulation/run and /simulation/list"
```

---

### Task 6: Add the V3 series to `calculation-tester.html`

**Files:**
- Modify: `tools/calculation-tester.html`

**Interfaces:**
- Consumes: `run.summary.{static_v3_energy_kwh, coolsense_v3_energy_kwh, v3_pct_reduction, static_v3_co2_kg, coolsense_v3_co2_kg, static_v3_cost_baht, coolsense_v3_cost_baht}`, `hourly[i].{static_v3_power_kw, coolsense_v3_power_kw, static_v3_cumulative_kwh, coolsense_v3_cumulative_kwh}` (Task 3/5).
- Produces: no exports — this is a leaf page.

- [ ] **Step 1: Add a `--series-v3` CSS variable**

In `tools/calculation-tester.html`, find the `.sim-section` rule (around line 124-130) and add a third series color:
```css
  .sim-section {
    margin-top: 32px;
    border-top: 2px solid #ddd;
    padding-top: 16px;
    --series-current: #2a78d6;
    --series-v2: #1baf7a;
    --series-v3: #d68f2a;
  }
```

- [ ] **Step 2: Add V3 to both chart legends**

Find the two `.chart-legend` blocks (around lines 353-356 and 363-366) and add a third swatch to each:
```html
      <div class="chart-legend">
        <span><span class="swatch" style="background:var(--series-current)"></span>Static</span>
        <span><span class="swatch" style="background:var(--series-v2)"></span>CoolSense V2</span>
        <span><span class="swatch" style="background:var(--series-v3)"></span>CoolSense V3</span>
      </div>
```
(apply to both occurrences — power chart and energy chart legends).

- [ ] **Step 3: Add V3 stat tiles**

In the `renderStats` function (around line 760), add V3 tiles to the `tiles` array:
```js
  function renderStats(summary) {
    const tiles = [
      { label: 'Static energy', value: fmtNum(summary.current_energy_kwh) + ' kWh' },
      { label: 'CoolSense V2 energy', value: fmtNum(summary.smart_energy_kwh) + ' kWh' },
      { label: '% reduction (V2)', value: fmtNum(summary.pct_reduction) + '%' },
      { label: 'Energy saved (V2)', value: fmtNum(summary.current_energy_kwh - summary.smart_energy_kwh) + ' kWh' },
      { label: 'Static CO₂', value: fmtNum(summary.current_co2_kg) + ' kg' },
      { label: 'CoolSense V2 CO₂', value: fmtNum(summary.smart_co2_kg) + ' kg' },
      { label: 'Static cost', value: fmtNum(summary.current_cost_baht) + ' baht' },
      { label: 'CoolSense V2 cost', value: fmtNum(summary.smart_cost_baht) + ' baht' },
      { label: 'Static-v3 energy', value: fmtNum(summary.static_v3_energy_kwh) + ' kWh' },
      { label: 'CoolSense V3 energy', value: fmtNum(summary.coolsense_v3_energy_kwh) + ' kWh' },
      { label: '% reduction (V3)', value: fmtNum(summary.v3_pct_reduction) + '%' },
      { label: 'Energy saved (V3)', value: fmtNum(summary.static_v3_energy_kwh - summary.coolsense_v3_energy_kwh) + ' kWh' },
    ];
    document.getElementById('simStats').innerHTML = tiles.map(t =>
      `<div class="sim-stat"><div class="sim-stat-label">${t.label}</div><div class="sim-stat-value">${t.value}</div></div>`
    ).join('');
  }
```

- [ ] **Step 4: Add V3 columns to the table view**

Update `renderTable` (around line 776):
```js
  function renderTable(hourly) {
    const rows = hourly.map(h => `<tr>
      <td>${h.hour_index}</td>
      <td>${fmtNum(h.current_power_kw, 2)}</td>
      <td>${fmtNum(h.smart_power_kw, 2)}</td>
      <td>${fmtNum(h.static_v3_power_kw, 2)}</td>
      <td>${fmtNum(h.coolsense_v3_power_kw, 2)}</td>
      <td>${fmtNum(h.current_cumulative_kwh, 1)}</td>
      <td>${fmtNum(h.smart_cumulative_kwh, 1)}</td>
      <td>${fmtNum(h.static_v3_cumulative_kwh, 1)}</td>
      <td>${fmtNum(h.coolsense_v3_cumulative_kwh, 1)}</td>
    </tr>`).join('');
    document.getElementById('simTable').innerHTML = `
      <thead><tr>
        <th>Hour</th><th>Static kW</th><th>CoolSense V2 kW</th><th>Static-v3 kW</th><th>CoolSense V3 kW</th>
        <th>Static cum. kWh</th><th>CoolSense V2 cum. kWh</th><th>Static-v3 cum. kWh</th><th>CoolSense V3 cum. kWh</th>
      </tr></thead>
      <tbody>${rows}</tbody>`;
  }
```

- [ ] **Step 5: Add the third series to both `renderChart` calls**

Update the two `renderChart(...)` calls in the `runSimBtn` click handler (around line 899-904):
```js
      renderChart('simPowerChart', 'simPowerTooltip', hourly,
        [
          { key: 'current_power_kw', color: '#2a78d6' },
          { key: 'smart_power_kw', color: '#1baf7a' },
          { key: 'coolsense_v3_power_kw', color: '#d68f2a' },
        ],
        'line');
      renderChart('simEnergyChart', 'simEnergyTooltip', hourly,
        [
          { key: 'current_cumulative_kwh', color: '#2a78d6' },
          { key: 'smart_cumulative_kwh', color: '#1baf7a' },
          { key: 'coolsense_v3_cumulative_kwh', color: '#d68f2a' },
        ],
        'area');
```
(CoolSense V3's power/energy series is charted against static and V2, not the separate static-v3 baseline — keeps the chart to 3 lines instead of 5. The static-v3 baseline is still visible in the stat tiles and table for anyone who wants the exact V3-vs-its-own-baseline comparison.)

- [ ] **Step 6: Manually verify in a browser**

Serve the file locally (e.g. `python3 -m http.server` from `tools/`, or open it directly), point it at a running local Supabase instance (per the file's existing config fields), click "Generate mock data + run simulation", and confirm:
- Three legend entries and three lines/areas render on both charts.
- The table has 4 power/cumulative-kWh column pairs.
- Stat tiles show V3 numbers alongside the existing static/V2 numbers.

- [ ] **Step 7: Commit**

```bash
git add tools/calculation-tester.html
git commit -m "Chart CoolSense V3 alongside static and V2 in calculation-tester.html"
```

---

### Task 7: Document CoolSense V3 in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add a "CoolSense V3" section**

In `CLAUDE.md`, immediately after the existing "CoolSense V2" section (search for `**CoolSense V2**`), add:
```markdown
**CoolSense V3** (`supabase/functions/_shared/acCalculationV3.ts` + `coolSenseV3Calculation.ts`, **simulation-only** — not wired into the live `/calculation` endpoint, which stays on CoolSense V2):
- Prompted by external/professor feedback that V1/V2's BTU-per-mode numbers, `STANDARD_SEER` (4.5), and per-person heat gain (225 BTU/hr) didn't hold up as real HVAC figures, even though V2's relative comparison was internally consistent.
- Required cooling capacity is now an additive load computed directly from room area and actual occupancy, instead of a per-mode BTU bucket + room-size multiplier: `required_btu_per_hr = (ENVELOPE_LOAD_BTU_PER_SQM × room_m²) + (PERSON_LOAD_BTU_PER_HR × people_count)`, then the same weather-load-multiplier formula as V1/V2 (33°C/60%RH baseline, unchanged) is applied on top. `ENVELOPE_LOAD_BTU_PER_SQM = 150` (tropical-climate baseline envelope/solar load), `PERSON_LOAD_BTU_PER_HR = 400` (ASHRAE seated/light-activity occupant heat gain, applied to actual occupancy at every mode, not just beyond a threshold). Mode (`eco`/`moderate`/`full`, same density thresholds as V1/V2) now only selects setpoint/fan-speed — capacity scales continuously with real load, which also retires V1's non-linear room-size BTU multiplier.
- `STANDARD_SEER_V3 = 15` — a realistic mid-range-efficiency reference unit (real SEER units are 13-25 BTU/Wh); V1/V2's `STANDARD_SEER` (4.5) didn't represent a real unit, it was reverse-engineered to reproduce an arbitrary original kW table.
- `coolSenseV3Calculation.ts` layers the identical weather-easing + comfort-preference behavior as `coolSenseV2Calculation.ts` (same setpoint ranges, same easing rule, same ±2°C comfort offsets) on top of the V3 base engine — the V2-vs-V3 simulation comparison isolates the capacity/SEER physics change, not a behavior difference in the easing layer.
- `/simulation/run` computes CoolSense V3 alongside a size-aware **static-v3** baseline (not the flat `CURRENT_SYSTEM_POWER_KW` V2 compares against): static-v3 is sized for the room's full-mode occupancy and its effective setpoint can't be milder than full mode's own base temp (21°C) — `static_temp_c` can still push it colder, raising power further, but can't make it complacently warmer than what real peak occupancy demands. This keeps the comparison physically honest once capacity scales with room size (a flat baseline would otherwise make "smart" look worse than "dumb" during peak hours in large rooms). `simulation_runs`/`simulation_hourly_data` store the V3 fields alongside the existing static/V2 ones (`static_v3_energy_kwh`, `coolsense_v3_energy_kwh`, `v3_pct_reduction`, etc.) — additive columns, nothing existing changed.
- `tools/calculation-tester.html`'s simulation charts show CoolSense V3 as a third line/area alongside static and V2.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document CoolSense V3 in CLAUDE.md"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (physics model) → Task 1; §2 (weather-easing layer) → Task 2; §3 (static baseline, refined with the clamp rule to make the "V3 never exceeds static at full occupancy" guarantee actually true) → Task 3; §4 (simulation extension) → Task 3; §5 (persistence) → Task 4; §6 (dashboard/tooling) → Task 6; §7 (testing) → Tasks 1-3; §8 (CLAUDE.md) → Task 7. §5's `handleRun`/`handleListSimulations` wiring is Task 5 (the spec's §5 covered schema; the endpoint code that populates it is a separate task here since it touches a different file).
- **Type consistency:** `AcSettingsV3`, `CoolSenseV3Settings`, `SimulationHourResult`, `SimulationSummary` field names are used identically across Tasks 1, 2, 3, 5, and 6 — cross-checked against each task's "Produces" line.
- **Deviation from spec called out explicitly:** the static-v3 baseline formula in Task 3 clamps `staticTempC` to never exceed full mode's own base temp, which the spec's §3 prose didn't spell out at the formula level. Documented inline in Task 3's design note and in CLAUDE.md (Task 7) so it isn't a silent surprise.
