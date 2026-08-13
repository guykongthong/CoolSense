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

/**
 * Reads the current room config + latest occupancy/weather readings, runs
 * CoolSense V2, and inserts a fresh ac_calculations row. Shared by the
 * `calculation` endpoint (GET, on-demand) and `occupancy-vision` (fires
 * automatically after each camera-detected occupancy reading, so the AC
 * setting actually reacts to the camera instead of only updating when
 * someone happens to hit GET /calculation).
 */
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
    comfort_preference: ComfortPreference;
    people_count: number;
    room_size: RoomSize;
  };
}

export async function runCalculation(
  // deno-lint-ignore no-explicit-any
  db: any,
): Promise<RunCalculationResult> {
  const [{ data: roomConfig }, { data: reading }, { data: weatherReading }]: [
    { data: RoomConfigRow | null },
    { data: OccupancyReadingRow | null },
    { data: WeatherReadingRow | null },
  ] = await Promise.all([
    db.from("room_config").select("room_size, ac_seer, comfort_preference").eq("id", 1).maybeSingle(),
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
      power_kw: settings.power_kw,
      btu_per_hr: settings.btu_per_hr,
    })
    .select()
    .maybeSingle();

  const fallback = {
    mode: settings.mode,
    temperature_c: settings.adjusted_temp_c,
    fan_speed: settings.fan_speed,
    power_kw: settings.power_kw,
    btu_per_hr: settings.btu_per_hr,
    comfort_preference: comfortPreference,
    people_count: peopleCount,
    room_size: roomSize,
  };

  if (error) {
    return { calculation: null, error: { message: error.message }, fallback };
  }

  return { calculation, error: null, fallback };
}
