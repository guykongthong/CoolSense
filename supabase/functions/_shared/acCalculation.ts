export type RoomSize = "small" | "medium" | "large";
export type AcMode = "eco" | "moderate" | "full";

export interface AcSettings {
  mode: AcMode;
  temperature_c: number;
  fan_speed: number;
  power_kw: number;
}

// Reference m² boundaries for public spaces (libraries, cafes, restaurants) —
// used to help an admin pick a room_size, not stored/enforced in the schema.
export const ROOM_SIZE_SQM_RANGES: Record<RoomSize, string> = {
  small: "50-150 m²",
  medium: "150-400 m²",
  large: "400+ m²",
};

// Representative m² per room size — the midpoint of each range above (large
// has no upper bound, so it uses a representative value past 400). Occupancy
// density (people ÷ m²) is computed against this, not a stored room area,
// since MVP doesn't collect an exact square footage per room.
const ROOM_SIZE_SQM: Record<RoomSize, number> = { small: 100, medium: 275, large: 450 };

// Base temp/fan per mode, and base power per mode before the room-size
// multiplier is applied. Weather adjustments will be layered in once the
// science team defines the criteria for that.
const MODE_SETTINGS: Record<AcMode, Omit<AcSettings, "mode">> = {
  eco: { temperature_c: 28, fan_speed: 1, power_kw: 0.5 },
  moderate: { temperature_c: 24, fan_speed: 2, power_kw: 2.5 },
  full: { temperature_c: 21, fan_speed: 3, power_kw: 4.5 },
};

// A bigger room has more air volume to cool, so the same mode draws more
// power in a large room than a small one. medium is the 1.0 baseline.
const ROOM_SIZE_POWER_MULTIPLIER: Record<RoomSize, number> = { small: 0.7, medium: 1.0, large: 1.5 };

// Occupancy density (people ÷ m²) thresholds for mode escalation. Using
// density instead of an absolute people-count keeps the same crowding
// standard across room sizes — a person count that's empty in a large room
// can be packed in a small one.
const MODERATE_DENSITY = 0.05;
const FULL_DENSITY = 0.15;

// Once in "full" mode, more heat load (more people) means the AC needs more
// cooling capacity to hold the same setpoint — power scales further on top
// of the room-size multiplier, temperature/fan stay fixed. Tune this once
// real numbers are available.
const POWER_PER_EXTRA_PERSON_KW = 0.05;

// SEER (Seasonal Energy Efficiency Ratio) of the reference unit our base
// power numbers above were modeled on. A unit with a higher SEER than this
// draws less power for the same cooling output — scale power by
// STANDARD_SEER ÷ unit's SEER. "Auto" in the UI means STANDARD_SEER, so the
// multiplier is 1 and power is unchanged from today's numbers.
const STANDARD_SEER = 4.5;

function getOccupancyDensity(peopleCount: number, roomSize: RoomSize): number {
  return peopleCount / ROOM_SIZE_SQM[roomSize];
}

export function getAcMode(peopleCount: number, roomSize: RoomSize): AcMode {
  const density = getOccupancyDensity(peopleCount, roomSize);
  if (density >= FULL_DENSITY) return "full";
  if (density >= MODERATE_DENSITY) return "moderate";
  return "eco";
}

export function calculateAcSettings(
  peopleCount: number,
  roomSize: RoomSize,
  seer: number = STANDARD_SEER,
): AcSettings {
  const mode = getAcMode(peopleCount, roomSize);
  const base = MODE_SETTINGS[mode];
  const efficiencyMultiplier = STANDARD_SEER / seer;
  const basePower = base.power_kw * ROOM_SIZE_POWER_MULTIPLIER[roomSize] * efficiencyMultiplier;

  if (mode !== "full") {
    return { mode, temperature_c: base.temperature_c, fan_speed: base.fan_speed, power_kw: basePower };
  }

  const fullThresholdPeople = FULL_DENSITY * ROOM_SIZE_SQM[roomSize];
  const extraPeople = peopleCount - fullThresholdPeople;
  const power_kw = basePower + extraPeople * POWER_PER_EXTRA_PERSON_KW * efficiencyMultiplier;

  return { mode, temperature_c: base.temperature_c, fan_speed: base.fan_speed, power_kw };
}
