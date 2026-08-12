export type RoomSize = "small" | "medium" | "large";
export type AcMode = "eco" | "moderate" | "full";

export interface AcSettings {
  mode: AcMode;
  temperature_c: number;
  fan_speed: number;
  power_kw: number;
  btu_per_hr: number;
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

// Base temp/fan per mode. Weather adjustments will be layered in once the
// science team defines the criteria for that.
const MODE_TEMP_FAN: Record<AcMode, { temperature_c: number; fan_speed: number }> = {
  eco: { temperature_c: 28, fan_speed: 1 },
  moderate: { temperature_c: 24, fan_speed: 2 },
  full: { temperature_c: 21, fan_speed: 3 },
};

// Required cooling capacity per mode, in BTU/hr — the industry-standard unit
// AC units are rated in (what you'd match against a real unit's spec sheet).
// These are the same relative loads as the original per-mode power_kw table
// (0.5 / 2.5 / 4.5 kW), re-expressed as BTU/hr at the standard reference SEER
// so behavior at SEER 4.5 ("Auto") is unchanged: BTU/hr = kW × SEER × 1000.
const BASE_BTU_PER_HR: Record<AcMode, number> = {
  eco: 2250, // 0.5 kW × 4.5 × 1000
  moderate: 11250, // 2.5 kW × 4.5 × 1000
  full: 20250, // 4.5 kW × 4.5 × 1000
};

// A bigger room has more air volume to cool, so the same mode needs more
// cooling capacity in a large room than a small one. medium is the 1.0
// baseline.
const ROOM_SIZE_BTU_MULTIPLIER: Record<RoomSize, number> = { small: 0.7, medium: 1.0, large: 1.5 };

// Occupancy density (people ÷ m²) thresholds for mode escalation. Using
// density instead of an absolute people-count keeps the same crowding
// standard across room sizes — a person count that's empty in a large room
// can be packed in a small one.
const MODERATE_DENSITY = 0.05;
const FULL_DENSITY = 0.15;

// Once in "full" mode, more heat load (more people) means the AC needs more
// cooling capacity to hold the same setpoint — capacity scales further on
// top of the room-size multiplier, temperature/fan stay fixed. Tune this
// once real numbers are available. 225 BTU/hr = 0.05 kW × 4.5 × 1000, same
// derivation as BASE_BTU_PER_HR above.
const BTU_PER_EXTRA_PERSON_PER_HR = 225;

// SEER (Seasonal Energy Efficiency Ratio, BTU/hr of cooling per watt of
// electrical input) of the reference unit BASE_BTU_PER_HR was derived
// against. "Auto" in the UI means STANDARD_SEER, so power_kw below comes out
// identical to the original kW table.
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
  const { temperature_c, fan_speed } = MODE_TEMP_FAN[mode];
  const baseBtu = BASE_BTU_PER_HR[mode] * ROOM_SIZE_BTU_MULTIPLIER[roomSize];

  let btu_per_hr = baseBtu;
  if (mode === "full") {
    const fullThresholdPeople = FULL_DENSITY * ROOM_SIZE_SQM[roomSize];
    const extraPeople = peopleCount - fullThresholdPeople;
    btu_per_hr = baseBtu + extraPeople * BTU_PER_EXTRA_PERSON_PER_HR;
  }

  // The defining physics relationship between cooling capacity and
  // electrical draw: power (kW) = required BTU/hr ÷ (SEER × 1000).
  const power_kw = btu_per_hr / (seer * 1000);

  return { mode, temperature_c, fan_speed, power_kw, btu_per_hr };
}
