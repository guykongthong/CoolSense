# CoolSense V3 — Realistic HVAC Physics Model

## Problem

External review (an HVAC-literate reader, echoed by the professor) flagged that the
current calculation model's absolute numbers don't hold up as real HVAC engineering
values, even though CoolSense V2's *relative* comparison (smart vs static) is
internally consistent:

1. Required BTU/hr per mode (2,250 / 11,250 / 20,250) is an order of magnitude below
   real design-load rules of thumb for public spaces of that size.
2. `STANDARD_SEER = 4.5` is far outside real SEER ratings (13–25 BTU/Wh) — the formula
   unit convention is correct, but the constant doesn't represent a real unit.
3. `BTU_PER_EXTRA_PERSON_PER_HR = 225` is roughly half real ASHRAE per-person heat
   gain (~350–400 BTU/hr), and is only applied to people beyond the full-mode
   threshold, not to actual occupant count.
4. The room-size BTU multiplier (small ×0.7 / medium ×1.0 / large ×1.5) doesn't scale
   linearly with the actual m² ratios between the three room sizes.

The professor's ask: get the underlying data/physics as accurate as we reasonably can
for a hackathon, since it's "the most important part of the system."

## Goals

- Replace the invented BTU/mode buckets with a load model built from real per-m² and
  per-person heat-gain figures, so both inputs and outputs would hold up under
  HVAC-literate scrutiny.
- Do this as a new, separately-named model (**CoolSense V3**) rather than editing V2 in
  place, so V2 remains available as a comparison point and nothing already wired into
  the live `/calculation` endpoint changes behavior.
- Extend `/simulation/run` to compare three series: static baseline, CoolSense V2,
  CoolSense V3.
- Let the corrected physics determine whatever savings percentage falls out — don't
  force-fit it back to the existing 30–40% pitch number.

## Non-goals

- `/calculation` (the live endpoint) stays on CoolSense V2. V3 is simulation-only for
  now — swapping the live model is a follow-up decision after the numbers are
  validated, not part of this change.
- No change to `acCalculation.ts` (V1) or `coolSenseV2Calculation.ts` — they stay as
  they are today, so V2's simulation numbers don't shift.
- No change to mode-selection thresholds (`MODERATE_DENSITY` / `FULL_DENSITY`) or to
  the weather-load-multiplier formula shape — both are kept as-is and reused by V3.

## Design

### 1. New base physics engine — `acCalculationV3.ts`

Required cooling capacity becomes an additive load, not a per-mode bucket:

```
required_btu_per_hr = (ENVELOPE_LOAD_BTU_PER_SQM × room_m²)
                     + (PERSON_LOAD_BTU_PER_HR × people_count)
```

then the existing weather-load-multiplier formula (unchanged shape, same 33°C/60%RH
baseline) is applied on top, exactly as in `acCalculation.ts`.

Constants:

- `ENVELOPE_LOAD_BTU_PER_SQM = 150` — baseline solar/envelope/ambient load a tropical
  public space needs even unoccupied. Conservative end of the commonly-cited
  150–450 BTU/hr/m² tropical commercial range.
- `PERSON_LOAD_BTU_PER_HR = 400` — ASHRAE seated/light-activity occupant heat gain
  (sensible + latent combined), applied to the actual people count at every mode, not
  just people beyond a threshold.
- `STANDARD_SEER_V3 = 15` — mid-range standard-efficiency unit, representative of the
  Thai market; "Auto" default for V3. Real SEER range (13–25) accepted as a valid
  custom input, same validation range as today's SEER field.
- Mode (`eco`/`moderate`/`full`) keeps today's density thresholds
  (`MODERATE_DENSITY`/`FULL_DENSITY`, reused from `acCalculation.ts`) and keeps
  controlling setpoint/fan-speed only — it no longer selects a separate capacity
  bucket, since capacity now scales continuously with actual area + occupancy. This
  also retires the non-linear room-size BTU multiplier — nothing to be non-linear
  about once load is computed directly from m².
- `power_kw = btu_per_hr / (seer × 1000)` — same formula as V1, now paired with a
  realistic SEER constant so the output number is a plausible real-unit power draw.

### 2. `coolSenseV3Calculation.ts` — weather easing + comfort, same pattern as V2

Structurally identical to `coolSenseV2Calculation.ts`: same per-mode setpoint ranges,
same weather-easing-only-when-milder-than-baseline rule, same ±2°C comfort-preference
offset, same ~5%/°C power-to-setpoint scaling. The only change is which base engine it
wraps (`acCalculationV3.ts` instead of `acCalculation.ts`). Comfort preference and
mode-relaxation semantics are intentionally unchanged so the V2-vs-V3 comparison
isolates the physics-model difference, not a behavior difference in the easing layer.

### 3. Static baseline made size-aware for the V3 comparison

Today's static "current system" baseline is a flat, configurable-temperature but
size-independent power draw (`CURRENT_SYSTEM_POWER_KW = 4.5`, ±5%/°C off the default
setpoint). Once V3's smart system scales properly with room size, a large room's
full-mode peak can exceed that flat baseline, making "smart" look worse than "dumb"
during peak hours — physically backwards, since a real static system still has to be
sized to handle full occupancy.

For the V3 comparison specifically, the static baseline is computed from the same V3
engine, evaluated worst-case and un-adapting:

- people count = the full-mode threshold's implied occupancy for the room size
  (`FULL_DENSITY × room_m²`) — i.e., sized for peak load
- setpoint = `static_temp_c` (existing configurable parameter, unchanged default 25°C)
- no weather easing, no comfort offset — a "dumb" system doesn't adapt

This keeps the static-vs-V3 comparison physically honest: the static system is sized
correctly for the room but never adapts down during low occupancy, which is exactly
the inefficiency CoolSense is pitched as solving.

The existing static-vs-V2 comparison (flat `CURRENT_SYSTEM_POWER_KW`) is unchanged —
V2's simulation numbers don't move.

### 4. `simulation.ts` extension

`runSimulation` computes three series per hour instead of two:

- `static_v3_power_kw` / cumulative kWh / cumulative CO₂ (per §3 above)
- `coolsense_v2_power_kw` / cumulative kWh / cumulative CO₂ (existing static-vs-V2
  logic, unchanged, kept for continuity)
- `coolsense_v3_power_kw` / cumulative kWh / cumulative CO₂ (new)

`SimulationSummary` gains `v3_energy_kwh`, `v3_co2_kg`, `v3_cost_baht`, and a
`v3_pct_reduction` (against the size-aware static-v3 baseline, not the flat V2
baseline — the two % reductions are not meant to be directly compared to each other,
since they're against different baselines).

### 5. Persistence

New migration adds the v3 columns above to `simulation_runs` (summary) and
`simulation_hourly_data` (per-hour). Existing V2/static columns are untouched —
additive migration only.

### 6. Dashboard / tooling

`tools/calculation-tester.html`'s 168-hour simulation section gets a third chart
series (CoolSense V3) alongside static and V2, all still computed server-side by
`/simulation/run`.

### 7. Testing

- `acCalculationV3.test.ts` — load formula, weather multiplier reuse, SEER power
  derivation, mode/setpoint selection.
- `coolSenseV3Calculation.test.ts` — weather easing, comfort offset, clamping to mode
  ranges — mirrors `coolSenseV2Calculation.test.ts`'s cases against the new base.
- `simulation.test.ts` — extended to assert the three-way hourly/summary output shape
  and the size-aware static-v3 baseline behavior (in particular: a large room at full
  occupancy should not make CoolSense V3 exceed the static-v3 baseline).

### 8. CLAUDE.md

Add a "CoolSense V3" section (mirroring the existing "CoolSense V2" section) once
implemented, documenting the load formula, constants, and that it's simulation-only
for now — per the "keep this file current" rule at the top of CLAUDE.md.

## Open questions / risks

- The corrected physics will very likely change the demo's headline savings-%
  compared to the existing 900/550 kWh pitch numbers (explicitly accepted — the user
  chose to let the real physics decide rather than target-fit 30–40%). The pitch
  narrative and CLAUDE.md's "Example Output" section will need updating once real
  numbers come out of testing; that update is a follow-up step after implementation,
  not blocking this spec.
- `ENVELOPE_LOAD_BTU_PER_SQM` and `PERSON_LOAD_BTU_PER_HR` are rule-of-thumb figures,
  not a formal ASHRAE Manual J-style calculation — appropriate for a 2-day hackathon,
  but worth stating plainly (in code comments and CLAUDE.md) so nobody mistakes them
  for a certified load calculation.
