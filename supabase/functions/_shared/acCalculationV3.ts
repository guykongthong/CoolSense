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
  eco: { temperature_c: 26, fan_speed: 1 },
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
