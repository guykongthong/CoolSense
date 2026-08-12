export type RoomSize = "small" | "medium" | "large";
export type AcMode = "eco" | "moderate" | "full";

export interface AcSettings {
  mode: AcMode;
  temperature_c: number;
  fan_speed: number;
  power_kw: number;
}

// Base settings per mode. Fixed for now — weather adjustments will be layered
// in once the science team defines the criteria for that.
const MODE_SETTINGS: Record<AcMode, Omit<AcSettings, "mode">> = {
  eco: { temperature_c: 28, fan_speed: 1, power_kw: 0.5 },
  moderate: { temperature_c: 24, fan_speed: 2, power_kw: 2.5 },
  full: { temperature_c: 21, fan_speed: 3, power_kw: 4.5 },
};

// People-count threshold (inclusive lower bound) at which mode escalates,
// per room size — bigger rooms tolerate more people before stepping up.
const MODERATE_THRESHOLD: Record<RoomSize, number> = { small: 1, medium: 1, large: 1 };
const FULL_THRESHOLD: Record<RoomSize, number> = { small: 3, medium: 4, large: 5 };

// Once in "full" mode, more heat load (more people) means the AC needs more
// cooling capacity to hold the same setpoint — power scales, temperature/fan
// stay fixed. Tune this once real numbers are available.
const POWER_PER_EXTRA_PERSON_KW = 0.05;

export function getAcMode(peopleCount: number, roomSize: RoomSize): AcMode {
  if (peopleCount >= FULL_THRESHOLD[roomSize]) return "full";
  if (peopleCount >= MODERATE_THRESHOLD[roomSize]) return "moderate";
  return "eco";
}

export function calculateAcSettings(peopleCount: number, roomSize: RoomSize): AcSettings {
  const mode = getAcMode(peopleCount, roomSize);
  const base = MODE_SETTINGS[mode];

  if (mode !== "full") {
    return { mode, ...base };
  }

  const extraPeople = peopleCount - FULL_THRESHOLD[roomSize];
  const power_kw = base.power_kw + extraPeople * POWER_PER_EXTRA_PERSON_KW;

  return { mode, temperature_c: base.temperature_c, fan_speed: base.fan_speed, power_kw };
}
