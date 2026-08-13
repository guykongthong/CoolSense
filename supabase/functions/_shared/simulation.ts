import { FULL_DENSITY, MODERATE_DENSITY, ROOM_SIZE_SQM, type RoomSize } from "./acCalculation.ts";
import { calculateAcSettingsV3 } from "./acCalculationV3.ts";
import { calculateCoolSenseV2Settings, type ComfortPreference } from "./coolSenseV2Calculation.ts";
import { calculateCoolSenseV3Settings } from "./coolSenseV3Calculation.ts";

export type WeatherCondition = "hot" | "warm" | "cool" | "diurnal";

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
  app_energy_kwh: number;
  net_energy_saved_kwh: number;
  net_co2_saved_kg: number;
  net_cost_saved_baht: number;
}

// The "current system" (static) baseline every simulation compares
// CoolSense V2 against — always-on, fan 3, constant draw. Historically a
// fixed 25°C/4.5kW; the setpoint is now configurable (`staticTempC` on
// runSimulation) so different naive baselines can be tested. 4.5kW is the
// power at the default 25°C setpoint — see CLAUDE.md.
export const DEFAULT_STATIC_TEMP_C = 25;
export const CURRENT_SYSTEM_POWER_KW = 4.5;

// A colder static setpoint needs proportionally more constant cooling
// capacity to hold, and vice versa for warmer — same 5%/°C rate
// coolSenseV2Calculation.ts uses for its own setpoint-to-power scaling, for
// consistency. Floor mirrors that module's MIN_POWER_MULTIPLIER.
const STATIC_POWER_CHANGE_PER_DEGREE_C = 0.05;
const STATIC_MIN_POWER_MULTIPLIER = 0.5;

function staticSystemPowerKw(staticTempC: number): number {
  const degreesColderThanDefault = DEFAULT_STATIC_TEMP_C - staticTempC;
  const multiplier = Math.max(
    STATIC_MIN_POWER_MULTIPLIER,
    1 + STATIC_POWER_CHANGE_PER_DEGREE_C * degreesColderThanDefault,
  );
  return CURRENT_SYSTEM_POWER_KW * multiplier;
}

// Worst-case outdoor conditions for a given weather_condition, used to size
// the static-v3 baseline's capacity. For the flat presets this is just the
// preset itself; for "diurnal" it's the cycle's peak (3pm: 36C/80%), since
// that's the hottest/most humid point the naive system has to survive.
function worstCaseWeatherFor(weatherCondition: WeatherCondition): { tempC: number; humidityPct: number } {
  if (weatherCondition === "diurnal") {
    return {
      tempC: DIURNAL_MID_TEMP_C + DIURNAL_TEMP_AMPLITUDE_C,
      humidityPct: DIURNAL_MID_HUMIDITY_PCT + DIURNAL_HUMIDITY_AMPLITUDE_PCT,
    };
  }
  return WEATHER_CONDITION_PRESETS[weatherCondition];
}

// The static-v3 baseline for the CoolSense V3 comparison: sized for the
// room's full-mode occupancy AND the run's worst-case weather load (never
// under-capacity for real peak load), and never backs off below what that
// peak load requires — a naive system doesn't adapt to actual occupancy or
// weather, so its effective setpoint can't be milder than what full
// occupancy under worst-case weather already demands. Sizing this against
// the baseline weather (multiplier=1) regardless of the run's actual
// weather_condition previously let CoolSense V3's real per-hour weather
// multiplier exceed this frozen capacity under "hot"/"diurnal" peak
// conditions — see simulation.test.ts "never exceeds the static-v3 baseline
// ... under hot/diurnal peak weather". `staticTempC` can still push it
// COLDER than full mode's own base temp (an explicitly configured
// aggressive baseline), which raises power further; it just can't make the
// baseline complacently warmer than what peak crowding needs. Reuses the
// same 5%/°C scaling rate and floor as staticSystemPowerKw, for consistency.
function staticV3PowerKw(roomSize: RoomSize, seer: number, staticTempC: number, weatherCondition: WeatherCondition): number {
  const fullOccupancyPeople = Math.ceil(FULL_DENSITY * ROOM_SIZE_SQM[roomSize]);
  const worstWeather = worstCaseWeatherFor(weatherCondition);
  const worstCase = calculateAcSettingsV3(fullOccupancyPeople, roomSize, seer, worstWeather.tempC, worstWeather.humidityPct);
  const effectiveStaticTempC = Math.min(staticTempC, worstCase.temperature_c);
  const degreesColderThanFullModeBase = worstCase.temperature_c - effectiveStaticTempC;
  const multiplier = Math.max(
    STATIC_MIN_POWER_MULTIPLIER,
    1 + STATIC_POWER_CHANGE_PER_DEGREE_C * degreesColderThanFullModeBase,
  );
  return worstCase.power_kw * multiplier;
}

// Thailand grid figures — see CLAUDE.md "Metrics Calculated".
const CO2_PER_KWH = 0.5;
const COST_PER_KWH_BAHT = 5;

// App infrastructure energy footprint — Vercel frontend, Supabase Postgres,
// edge functions, weatherapi.com calls. See
// docs/superpowers/specs/2026-08-13-app-energy-integration-design.md for the
// component-by-component derivation. Kept as separate exported constants
// (not folded into one number) so they stay independently testable/tunable.
export const APP_BASELINE_KWH_PER_DAY = 0.1051;
export const APP_PER_RUN_OVERHEAD_KWH = 0.00185;

// Zero duration means no run happened at all — no baseline prorated, no
// per-run overhead charged. Guards the "empty input" summary staying
// all-zero (matches the existing empty-input test for the other fields).
function appEnergyKwh(durationHours: number): number {
  if (durationHours <= 0) return 0;
  return (APP_BASELINE_KWH_PER_DAY / 24) * durationHours + APP_PER_RUN_OVERHEAD_KWH;
}

// Representative outdoor conditions per categorical weather_condition input,
// for scenario simulation where hitting weatherapi.com 168 times per run
// isn't practical. "warm" reproduces acCalculation.ts's own baseline (33°C/
// 60% RH → multiplier 1), so it's the closest thing to "no adjustment".
const WEATHER_CONDITION_PRESETS: Record<Exclude<WeatherCondition, "diurnal">, { tempC: number; humidityPct: number }> = {
  cool: { tempC: 27, humidityPct: 55 },
  warm: { tempC: 33, humidityPct: 60 },
  hot: { tempC: 38, humidityPct: 75 },
};

// A continuous day/night cycle instead of one flat value for the whole run —
// "warm" and "hot" both sit at/above acCalculation.ts's own weather
// baseline (33°C/60%), so with a flat preset CoolSense V2's setpoint
// relaxation never has mild-enough conditions to fire and it collapses to
// the same power draw it would have without any easing at all, for the
// entire simulation. Cosine
// curve, 24h period: temp/humidity trough at 3am, peak at 3pm — anchored to
// the peer's example figures (cool morning ~27°C/50%, hot midday ~36°C/80%).
const DIURNAL_PEAK_HOUR = 15;
const DIURNAL_MID_TEMP_C = 31.5;
const DIURNAL_TEMP_AMPLITUDE_C = 4.5; // → 27°C trough / 36°C peak
const DIURNAL_MID_HUMIDITY_PCT = 65;
const DIURNAL_HUMIDITY_AMPLITUDE_PCT = 15; // → 50% trough / 80% peak

export function getDiurnalWeather(timestamp: Date): { tempC: number; humidityPct: number } {
  const hour = timestamp.getHours() + timestamp.getMinutes() / 60;
  const phase = (2 * Math.PI * (hour - DIURNAL_PEAK_HOUR)) / 24;
  return {
    tempC: DIURNAL_MID_TEMP_C + DIURNAL_TEMP_AMPLITUDE_C * Math.cos(phase),
    humidityPct: DIURNAL_MID_HUMIDITY_PCT + DIURNAL_HUMIDITY_AMPLITUDE_PCT * Math.cos(phase),
  };
}

function getWeatherForHour(weatherCondition: WeatherCondition, timestamp: Date | undefined): { tempC: number; humidityPct: number } {
  if (weatherCondition === "diurnal") {
    if (!timestamp) throw new Error("diurnal weather_condition requires capturedAt timestamps");
    return getDiurnalWeather(timestamp);
  }
  return WEATHER_CONDITION_PRESETS[weatherCondition];
}

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
 * Runs the static-vs-CoolSense-V2 comparison over a sequence of hourly
 * people counts (oldest first). Pure function over already-fetched data —
 * no DB access — so it's independently testable and reusable regardless of
 * where the readings came from. `capturedAt` (same order/length as
 * `peopleCounts`) is only required when weatherCondition is "diurnal".
 * `staticTempC` configures the static/current baseline's setpoint (default
 * 25°C); `comfortPreference` feeds CoolSense V2's ±2°C occupant offset
 * (default neutral, since a simulation run has no single "occupant").
 */
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
  const staticV3Kw = staticV3PowerKw(roomSize, seer, staticTempC, weatherCondition);

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

    // Power (kW) sustained for a 1-hour slice == energy (kWh) for that hour.
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

  const app_energy_kwh = appEnergyKwh(peopleCounts.length);
  const net_energy_saved_kwh = v3EnergySaved - app_energy_kwh;

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
    app_energy_kwh,
    net_energy_saved_kwh,
    net_co2_saved_kg: net_energy_saved_kwh * CO2_PER_KWH,
    net_cost_saved_baht: net_energy_saved_kwh * COST_PER_KWH_BAHT,
  };

  return { hourly, summary };
}
