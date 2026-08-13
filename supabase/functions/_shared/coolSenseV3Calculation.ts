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
