import {
  type AcMode,
  calculateAcSettings,
  type RoomSize,
  STANDARD_SEER,
  WEATHER_BASELINE_HUMIDITY_PCT,
  WEATHER_BASELINE_TEMP_C,
} from "./acCalculation.ts";

export type ComfortPreference = "cold" | "neutral" | "warm";

export interface CoolSenseV2Settings {
  mode: AcMode;
  fan_speed: number;
  base_temp_c: number;
  adjusted_temp_c: number;
  power_kw: number;
  btu_per_hr: number;
}

// How far each mode's setpoint is allowed to relax (warmer) from its base
// temp under mild conditions or a "warm" comfort preference, and how far a
// "cold" preference is allowed to tighten it. The weather-easing mechanism
// below only ever pushes toward range.max — it never tightens the setpoint
// further when it's hot, because the weather-driven BTU multiplier in
// acCalculation.ts already models the extra cooling load hot/humid
// conditions demand; adjusting the setpoint colder on top of that would
// double-count the same heat load. Comfort preference is the one thing that
// legitimately CAN move the setpoint colder than base, since it's a direct
// occupant request, not a re-derivation of the same physics.
const MODE_TEMP_RANGE: Record<AcMode, { min: number; max: number }> = {
  eco: { min: 24, max: 26 },
  moderate: { min: 22, max: 26 },
  full: { min: 19, max: 23 },
};

// Per °C the outside temp is BELOW the 33°C baseline, relax the setpoint
// this many degrees (less aggressive cooling needed). Mirrors per %RH below
// the 60% baseline. Only applies below baseline — see MODE_TEMP_RANGE note.
const TEMP_EASE_PER_DEGREE_C_BELOW_BASELINE = 0.3;
const HUMIDITY_EASE_PER_PCT_BELOW_BASELINE = 0.02;

// Direct occupant comfort request, applied on top of the weather-eased
// setpoint. Still clamped to the mode's range afterward.
const COMFORT_OFFSET_C: Record<ComfortPreference, number> = {
  cold: -2,
  neutral: 0,
  warm: 2,
};

// Rule-of-thumb: each °C the setpoint moves warmer needs proportionally
// less cooling capacity to maintain (and vice versa for colder). Commonly
// cited HVAC guidance puts this in the 3-5% range; tune once the science
// team has real figures. Applied symmetrically to both the weather-easing
// and comfort-preference adjustments — both are the same physical effect
// (a different setpoint requires a different amount of cooling).
const POWER_CHANGE_PER_DEGREE_C = 0.05;

// Floor so a large relaxation can't be modeled as needing negative cooling
// capacity, mirroring the weather multiplier's own floor.
const MIN_POWER_MULTIPLIER = 0.5;

/**
 * CoolSense V2: same mode selection, BTU sizing, and weather-driven capacity
 * scaling as calculateAcSettings (CoolSense V1), plus two additions:
 *
 * 1. When outside conditions are MILDER than the 33°C/60% baseline, the
 *    setpoint relaxes (warmer, less aggressive) within the mode's range,
 *    which legitimately needs less cooling capacity and so draws less
 *    power. At or above baseline, this step is a no-op — that case is
 *    already handled by calculateAcSettings's own weather multiplier.
 * 2. The occupant's comfort_preference then shifts the setpoint ±2°C
 *    (cold/warm) or leaves it alone (neutral), still clamped to the mode's
 *    range, with power scaled to match.
 */
export function calculateCoolSenseV2Settings(
  peopleCount: number,
  roomSize: RoomSize,
  seer: number = STANDARD_SEER,
  outsideTempC: number = WEATHER_BASELINE_TEMP_C,
  humidityPct: number = WEATHER_BASELINE_HUMIDITY_PCT,
  comfortPreference: ComfortPreference = "neutral",
): CoolSenseV2Settings {
  const base = calculateAcSettings(peopleCount, roomSize, seer, outsideTempC, humidityPct);
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
