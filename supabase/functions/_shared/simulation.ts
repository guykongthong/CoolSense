import { calculateAcSettings, FULL_DENSITY, MODERATE_DENSITY, ROOM_SIZE_SQM, type RoomSize } from "./acCalculation.ts";

export type WeatherCondition = "hot" | "warm" | "cool";

export interface MockReading {
  captured_at: string;
  people_count: number;
  source: "mock";
}

export interface SimulationHourResult {
  hour_index: number;
  current_power_kw: number;
  smart_power_kw: number;
  current_cumulative_kwh: number;
  smart_cumulative_kwh: number;
  current_cumulative_co2: number;
  smart_cumulative_co2: number;
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
}

// The "current system" baseline every simulation compares the smart system
// against — always-on 25°C, fan 3, constant draw. See CLAUDE.md.
export const CURRENT_SYSTEM_POWER_KW = 4.5;

// Thailand grid figures — see CLAUDE.md "Metrics Calculated".
const CO2_PER_KWH = 0.5;
const COST_PER_KWH_BAHT = 5;

// Representative outdoor conditions per categorical weather_condition input,
// for scenario simulation where hitting weatherapi.com 168 times per run
// isn't practical. "warm" reproduces acCalculation.ts's own baseline (33°C/
// 60% RH → multiplier 1), so it's the closest thing to "no adjustment".
const WEATHER_CONDITION_PRESETS: Record<WeatherCondition, { tempC: number; humidityPct: number }> = {
  cool: { tempC: 27, humidityPct: 55 },
  warm: { tempC: 33, humidityPct: 60 },
  hot: { tempC: 38, humidityPct: 75 },
};

// Occupancy targets are expressed as density (people ÷ m²) and converted to
// a people-count via ROOM_SIZE_SQM — the same density the mode thresholds
// (MODERATE_DENSITY/FULL_DENSITY) are judged against. An earlier version
// used flat people-count ranges (e.g. "8-15 peak") independent of room
// size; those numbers were far too low to ever cross the moderate/full
// thresholds for medium/large rooms (275/450 m², moderate at 14/23 people),
// so the "smart system" sat in eco the entire simulation — silently, since
// nothing errored. Deriving targets from the real thresholds keeps this
// from drifting out of sync again if the thresholds change.
const PEAK_DENSITY = FULL_DENSITY; // lands right at the full-mode threshold — ±15% noise tips it into full about half the time, moderate the rest
const LOW_DENSITY = MODERATE_DENSITY * 0.4; // firmly eco
const WEEKEND_DENSITY = PEAK_DENSITY * 0.4; // "~40% of weekday peak" per spec, on a density basis
const NIGHT_PEOPLE_COUNT = 0.5; // near-empty regardless of room size — rounds to 0 or 1 with noise
const NOISE_AMPLITUDE = 0.15;

type HourTier = "night" | "low" | "peak";

// Hour-of-day → tier. Peer spec: peak 9am-5pm (offices) or 7pm-11pm
// (hotels); low during other daytime hours; near-empty overnight.
function hourTier(hour: number): HourTier {
  if (hour < 7 || hour >= 23) return "night";
  if ((hour >= 9 && hour < 17) || (hour >= 19 && hour < 23)) return "peak";
  return "low";
}

// Base people count (before noise) for an hour, calibrated against this
// room size's actual m² so peak hours meaningfully cross the mode
// thresholds. Night stays near-empty on weekends too; weekend daytime/peak
// hours flatten to ~40% of the weekday peak density rather than following
// the weekday peak/low split.
function baseOccupancy(tier: HourTier, isWeekend: boolean, roomSize: RoomSize): number {
  if (tier === "night") return NIGHT_PEOPLE_COUNT;
  const sqm = ROOM_SIZE_SQM[roomSize];
  if (isWeekend) return WEEKEND_DENSITY * sqm;
  if (tier === "peak") return PEAK_DENSITY * sqm;
  return LOW_DENSITY * sqm;
}

function applyNoise(base: number, random: () => number): number {
  const noiseFactor = 1 + NOISE_AMPLITUDE * (random() * 2 - 1);
  return Math.max(0, Math.round(base * noiseFactor));
}

/**
 * Generates `durationHours` hourly occupancy readings ending at `now`
 * (inclusive), following a weekday office/hotel pattern with weekend
 * dampening and ±15% random noise. Pure function — `now` and `random` are
 * injectable for deterministic tests; production calls omit both.
 */
export function generateMockOccupancy(
  durationHours: number,
  roomSize: RoomSize,
  options: { now?: Date; random?: () => number } = {},
): MockReading[] {
  const now = options.now ?? new Date();
  const random = options.random ?? Math.random;

  const readings: MockReading[] = [];
  for (let i = 0; i < durationHours; i++) {
    // i=0 is the oldest hour, i=durationHours-1 is `now`.
    const hoursAgo = durationHours - 1 - i;
    const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    const dayOfWeek = timestamp.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const hour = timestamp.getHours();

    const base = baseOccupancy(hourTier(hour), isWeekend, roomSize);

    readings.push({
      captured_at: timestamp.toISOString(),
      people_count: applyNoise(base, random),
      source: "mock",
    });
  }
  return readings;
}

/**
 * Runs the current-vs-smart comparison over a sequence of hourly people
 * counts (oldest first). Pure function over already-fetched data — no DB
 * access — so it's independently testable and reusable regardless of where
 * the readings came from.
 */
export function runSimulation(
  peopleCounts: number[],
  roomSize: RoomSize,
  seer: number,
  weatherCondition: WeatherCondition,
): { hourly: SimulationHourResult[]; summary: SimulationSummary } {
  const preset = WEATHER_CONDITION_PRESETS[weatherCondition];
  const hourly: SimulationHourResult[] = [];

  let currentCumulativeKwh = 0;
  let smartCumulativeKwh = 0;
  let currentCumulativeCo2 = 0;
  let smartCumulativeCo2 = 0;

  peopleCounts.forEach((peopleCount, hour_index) => {
    const smartSettings = calculateAcSettings(peopleCount, roomSize, seer, preset.tempC, preset.humidityPct);

    // Power (kW) sustained for a 1-hour slice == energy (kWh) for that hour.
    currentCumulativeKwh += CURRENT_SYSTEM_POWER_KW;
    smartCumulativeKwh += smartSettings.power_kw;
    currentCumulativeCo2 = currentCumulativeKwh * CO2_PER_KWH;
    smartCumulativeCo2 = smartCumulativeKwh * CO2_PER_KWH;

    hourly.push({
      hour_index,
      current_power_kw: CURRENT_SYSTEM_POWER_KW,
      smart_power_kw: smartSettings.power_kw,
      current_cumulative_kwh: currentCumulativeKwh,
      smart_cumulative_kwh: smartCumulativeKwh,
      current_cumulative_co2: currentCumulativeCo2,
      smart_cumulative_co2: smartCumulativeCo2,
    });
  });

  const current_energy_kwh = currentCumulativeKwh;
  const smart_energy_kwh = smartCumulativeKwh;
  const energySaved = current_energy_kwh - smart_energy_kwh;

  const summary: SimulationSummary = {
    duration_hours: peopleCounts.length,
    current_energy_kwh,
    smart_energy_kwh,
    current_co2_kg: current_energy_kwh * CO2_PER_KWH,
    smart_co2_kg: smart_energy_kwh * CO2_PER_KWH,
    current_cost_baht: current_energy_kwh * COST_PER_KWH_BAHT,
    smart_cost_baht: smart_energy_kwh * COST_PER_KWH_BAHT,
    pct_reduction: current_energy_kwh > 0 ? (energySaved / current_energy_kwh) * 100 : 0,
  };

  return { hourly, summary };
}
