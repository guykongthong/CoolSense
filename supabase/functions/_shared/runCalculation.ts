import { type RoomSize } from "./acCalculation.ts";
import { calculateCoolSenseV2Settings, type ComfortPreference } from "./coolSenseV2Calculation.ts";

// TODO: ML JSON shape may change occupancy_readings columns.
const DEFAULT_ROOM_SIZE: RoomSize = "medium";

const DEFAULT_AC_SEER = 4.5;
const DEFAULT_COMFORT_PREFERENCE: ComfortPreference = "neutral";
// Matches acCalculation.ts's WEATHER_BASELINE_TEMP_C / WEATHER_BASELINE_HUMIDITY_PCT —
// used when no weather reading has been fetched yet (weather multiplier = 1).
const DEFAULT_OUTSIDE_TEMP_C = 33;
const DEFAULT_HUMIDITY_PCT = 60;

interface RoomConfigRow {
  room_size: RoomSize;
  ac_seer: number;
  comfort_preference: ComfortPreference;
  rated_capacity_btu_per_hr: number | null;
}

interface OccupancyReadingRow {
  id: string;
  people_count: number;
}

interface WeatherReadingRow {
  id: string;
  temp_c: number;
  humidity_pct: number;
  condition_icon_url: string | null;
}

function weatherLabel(tempC: number): "hot" | "warm" | "cool" {
  if (tempC >= 33) return "hot";
  if (tempC >= 25) return "warm";
  return "cool";
}

// If the room's actual AC unit (room_config.rated_capacity_btu_per_hr,
// entered on the Information page) can't deliver the computed required
// BTU/hr, the unit runs at its own max and still can't fully meet demand.
// required_btu_per_hr itself is left unchanged (it still reports true
// demand) — only power_kw is capped at what the unit can actually draw, and
// capacity_constrained flags the mismatch. No rated capacity set (the
// common case) is a no-op — behavior is identical to before this existed.
export function applyCapacityCeiling(
  requiredBtuPerHr: number,
  powerKw: number,
  seer: number,
  ratedCapacityBtuPerHr: number | null,
): { power_kw: number; capacity_constrained: boolean } {
  if (ratedCapacityBtuPerHr === null || ratedCapacityBtuPerHr >= requiredBtuPerHr) {
    return { power_kw: powerKw, capacity_constrained: false };
  }
  return { power_kw: ratedCapacityBtuPerHr / (seer * 1000), capacity_constrained: true };
}

/**
 * Reads the current room config + latest occupancy/weather readings, runs
 * CoolSense V2, and inserts a fresh ac_calculations row. Shared by the
 * `calculation` endpoint (GET, on-demand) and `occupancy-vision` (fires
 * automatically after each camera-detected occupancy reading, so the AC
 * setting actually reacts to the camera instead of only updating when
 * someone happens to hit GET /calculation).
 */
export async function runCalculation(
  // deno-lint-ignore no-explicit-any
  db: any,
): Promise<RunCalculationResult> {
  const [{ data: roomConfig }, { data: reading }, { data: weatherReading }]: [
    { data: RoomConfigRow | null },
    { data: OccupancyReadingRow | null },
    { data: WeatherReadingRow | null },
  ] = await Promise.all([
    db.from("room_config").select("room_size, ac_seer, comfort_preference, rated_capacity_btu_per_hr").eq("id", 1).maybeSingle(),
    db
      .from("occupancy_readings")
      // Excludes mock/simulation data — this is the live calculation path,
      // and mock rows can have captured_at close to "now", which would
      // otherwise let a simulation run transiently hijack live results.
      .select("id, people_count")
      .neq("source", "mock")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("weather_readings")
      .select("id, temp_c, humidity_pct, condition_icon_url")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const roomSize = (roomConfig?.room_size as RoomSize) ?? DEFAULT_ROOM_SIZE;
  const peopleCount = reading?.people_count ?? 0;
  const acSeer = roomConfig?.ac_seer ?? DEFAULT_AC_SEER;
  const outsideTempC = weatherReading?.temp_c ?? DEFAULT_OUTSIDE_TEMP_C;
  const humidityPct = weatherReading?.humidity_pct ?? DEFAULT_HUMIDITY_PCT;
  const comfortPreference = roomConfig?.comfort_preference ?? DEFAULT_COMFORT_PREFERENCE;
  const ratedCapacityBtuPerHr = roomConfig?.rated_capacity_btu_per_hr ?? null;

  // CoolSense V2: base mode/BTU/weather calc, plus setpoint relaxation
  // under mild weather and the occupant's comfort_preference. See
  // supabase/functions/_shared/coolSenseV2Calculation.ts.
  const settings = calculateCoolSenseV2Settings(
    peopleCount,
    roomSize,
    acSeer,
    outsideTempC,
    humidityPct,
    comfortPreference,
  );

  const { power_kw, capacity_constrained } = applyCapacityCeiling(
    settings.btu_per_hr,
    settings.power_kw,
    acSeer,
    ratedCapacityBtuPerHr,
  );

  const { data: calculation, error } = await db
    .from("ac_calculations")
    .insert({
      occupancy_reading_id: reading?.id ?? null,
      weather_reading_id: weatherReading?.id ?? null,
      weather: weatherLabel(outsideTempC),
      outside_temp_c: outsideTempC,
      humidity_pct: humidityPct,
      weather_condition_icon_url: weatherReading?.condition_icon_url ?? null,
      ac_mode: settings.mode,
      // temperature_c is the actual setpoint the AC uses (adjusted_temp_c);
      // base_temp_c is what the base model alone would have set.
      temperature_c: settings.adjusted_temp_c,
      base_temp_c: settings.base_temp_c,
      comfort_preference: comfortPreference,
      fan_speed: settings.fan_speed,
      power_kw,
      btu_per_hr: settings.btu_per_hr,
      capacity_constrained,
    })
    .select()
    .maybeSingle();

  const fallback = {
    mode: settings.mode,
    temperature_c: settings.adjusted_temp_c,
    fan_speed: settings.fan_speed,
    power_kw,
    btu_per_hr: settings.btu_per_hr,
    capacity_constrained,
    comfort_preference: comfortPreference,
    people_count: peopleCount,
    room_size: roomSize,
  };

  if (error) {
    return { calculation: null, error: { message: error.message }, fallback };
  }

  return { calculation, error: null, fallback };
}

export interface RunCalculationResult {
  calculation: Record<string, unknown> | null;
  error: { message: string } | null;
  // Present even on error, so callers can build a fallback response (matches
  // the shape calculation/index.ts returned before this was extracted).
  fallback: {
    mode: string;
    temperature_c: number;
    fan_speed: number;
    power_kw: number;
    btu_per_hr: number;
    capacity_constrained: boolean;
    comfort_preference: ComfortPreference;
    people_count: number;
    room_size: RoomSize;
  };
}
