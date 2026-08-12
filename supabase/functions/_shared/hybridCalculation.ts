import {
  type AcMode,
  calculateAcSettings,
  type RoomSize,
  STANDARD_SEER,
  WEATHER_BASELINE_HUMIDITY_PCT,
  WEATHER_BASELINE_TEMP_C,
} from "./acCalculation.ts";

export interface HybridAcSettings {
  mode: AcMode;
  fan_speed: number;
  base_temp_c: number;
  adjusted_temp_c: number;
  power_kw: number;
  btu_per_hr: number;
}

// How far each mode's setpoint is allowed to relax (warmer) from its base
// temp under mild conditions. The bottom of each range is intentionally
// unused here — this model only eases OFF cooling when conditions allow;
// it never tightens the setpoint further when it's hot, because the
// weather-driven BTU multiplier in acCalculation.ts already models the
// extra cooling load hot/humid conditions demand. Adjusting the setpoint
// colder on top of that would double-count the same heat load.
const MODE_TEMP_RANGE: Record<AcMode, { min: number; max: number }> = {
  eco: { min: 26, max: 28 },
  moderate: { min: 22, max: 26 },
  full: { min: 19, max: 23 },
};

// Per °C the outside temp is BELOW the 33°C baseline, relax the setpoint
// this many degrees (less aggressive cooling needed). Mirrors per %RH below
// the 60% baseline. Only applies below baseline — see MODE_TEMP_RANGE note.
const TEMP_EASE_PER_DEGREE_C_BELOW_BASELINE = 0.3;
const HUMIDITY_EASE_PER_PCT_BELOW_BASELINE = 0.02;

// Rule-of-thumb: each °C the setpoint relaxes needs proportionally less
// cooling capacity to maintain. Commonly cited HVAC guidance puts this in
// the 3-5% range; tune once the science team has real figures.
const POWER_SAVINGS_PER_EASED_DEGREE_C = 0.05;

// Floor so a large eased setpoint can't be modeled as needing negative
// cooling capacity, mirroring the weather multiplier's own floor.
const MIN_EASE_POWER_MULTIPLIER = 0.5;

/**
 * The "hybrid" model: same mode selection, BTU sizing, and weather-driven
 * capacity scaling as calculateAcSettings, plus one addition — when outside
 * conditions are MILDER than the 33°C/60% baseline, the setpoint relaxes
 * (warmer, less aggressive) within the mode's range, which legitimately
 * needs less cooling capacity and so draws less power. When conditions are
 * at or above baseline, this returns identical numbers to calculateAcSettings
 * (base_temp_c === adjusted_temp_c, same power_kw) — the harsher-condition
 * case is already handled by the weather multiplier, not by this model.
 */
export function calculateHybridSettings(
  peopleCount: number,
  roomSize: RoomSize,
  seer: number = STANDARD_SEER,
  outsideTempC: number = WEATHER_BASELINE_TEMP_C,
  humidityPct: number = WEATHER_BASELINE_HUMIDITY_PCT,
): HybridAcSettings {
  const base = calculateAcSettings(peopleCount, roomSize, seer, outsideTempC, humidityPct);
  const range = MODE_TEMP_RANGE[base.mode];

  const tempEase = Math.max(0, TEMP_EASE_PER_DEGREE_C_BELOW_BASELINE * (WEATHER_BASELINE_TEMP_C - outsideTempC));
  const humidityEase = Math.max(
    0,
    HUMIDITY_EASE_PER_PCT_BELOW_BASELINE * (WEATHER_BASELINE_HUMIDITY_PCT - humidityPct),
  );

  const adjusted_temp_c = Math.min(range.max, base.temperature_c + tempEase + humidityEase);
  const appliedEase = adjusted_temp_c - base.temperature_c;

  const powerEaseMultiplier = Math.max(MIN_EASE_POWER_MULTIPLIER, 1 - POWER_SAVINGS_PER_EASED_DEGREE_C * appliedEase);
  const btu_per_hr = base.btu_per_hr * powerEaseMultiplier;
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
