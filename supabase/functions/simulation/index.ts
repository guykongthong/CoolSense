// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import type { SupabaseContext } from "@supabase/server";
import { type RoomSize } from "../_shared/acCalculation.ts";
import { DEFAULT_STATIC_TEMP_C, generateMockOccupancy, runSimulation, type WeatherCondition } from "../_shared/simulation.ts";
import type { ComfortPreference } from "../_shared/coolSenseV2Calculation.ts";

const VALID_ROOM_SIZES = ["small", "medium", "large"];
const VALID_WEATHER_CONDITIONS = ["hot", "warm", "cool", "diurnal"];
const VALID_COMFORT_PREFERENCES = ["cold", "neutral", "warm"];
const DEFAULT_DURATION_HOURS = 168;
const DEFAULT_ROOM_SIZE: RoomSize = "medium";
const DEFAULT_AC_SEER = 4.5;
const DEFAULT_WEATHER_CONDITION: WeatherCondition = "warm";
const DEFAULT_COMFORT_PREFERENCE: ComfortPreference = "neutral";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECENT_SIMULATIONS_LIMIT = 10;

function isRoomSize(value: unknown): value is RoomSize {
  return typeof value === "string" && VALID_ROOM_SIZES.includes(value);
}

function isWeatherCondition(value: unknown): value is WeatherCondition {
  return typeof value === "string" && VALID_WEATHER_CONDITIONS.includes(value);
}

function isComfortPreference(value: unknown): value is ComfortPreference {
  return typeof value === "string" && VALID_COMFORT_PREFERENCES.includes(value);
}

interface GenerateMockDataBody {
  duration_hours?: number;
  room_size?: string;
}

async function handleGenerateMockData(req: Request, ctx: SupabaseContext): Promise<Response> {
  let body: GenerateMockDataBody;
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const durationHours = body.duration_hours ?? DEFAULT_DURATION_HOURS;
  if (typeof durationHours !== "number" || durationHours <= 0 || !Number.isInteger(durationHours)) {
    return Response.json({ message: "duration_hours must be a positive integer" }, { status: 400 });
  }

  const roomSize = body.room_size ?? DEFAULT_ROOM_SIZE;
  if (!isRoomSize(roomSize)) {
    return Response.json({ message: `room_size must be one of ${VALID_ROOM_SIZES.join(", ")}` }, { status: 400 });
  }

  const readings = generateMockOccupancy(durationHours, roomSize);

  // deno-lint-ignore no-explicit-any
  const db = ctx.supabaseAdmin as any;

  // Replace, not append — otherwise repeated calls (different durations,
  // different runs while testing) pile up in the table, and /run's "most
  // recent N mock rows" ends up mixing rows from multiple overlapping
  // batches instead of one coherent scenario. Scoped to source='mock' only,
  // never touches real ml_video/manual readings.
  const { error: deleteError } = await db.from("occupancy_readings").delete().eq("source", "mock");
  if (deleteError) {
    console.error(deleteError.message);
    return Response.json({ message: deleteError.message }, { status: 500 });
  }

  const { data, error } = await db.from("occupancy_readings").insert(readings).select("id, captured_at, people_count");

  if (error) {
    console.error(error.message);
    return Response.json({ message: error.message }, { status: 500 });
  }

  const peopleCounts = readings.map((r) => r.people_count);
  const weekdayCounts: number[] = [];
  const weekendCounts: number[] = [];
  readings.forEach((r) => {
    const day = new Date(r.captured_at).getDay();
    (day === 0 || day === 6 ? weekendCounts : weekdayCounts).push(r.people_count);
  });
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return Response.json({
    occupancy_reading_ids: (data ?? []).map((r: { id: string }) => r.id),
    room_size: roomSize,
    duration_hours: durationHours,
    summary: {
      avg_people_count: avg(peopleCounts),
      min_people_count: Math.min(...peopleCounts),
      max_people_count: Math.max(...peopleCounts),
      weekday_avg_people_count: avg(weekdayCounts),
      weekend_avg_people_count: avg(weekendCounts),
    },
  });
}

interface RunSimulationBody {
  duration_hours?: number;
  room_size?: string;
  ac_seer?: number;
  weather_condition?: string;
  static_temp_c?: number;
  comfort_preference?: string;
}

interface OccupancyReadingRow {
  people_count: number;
  captured_at: string;
}

async function handleRun(req: Request, ctx: SupabaseContext): Promise<Response> {
  let body: RunSimulationBody;
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const durationHours = body.duration_hours ?? DEFAULT_DURATION_HOURS;
  if (typeof durationHours !== "number" || durationHours <= 0 || !Number.isInteger(durationHours)) {
    return Response.json({ message: "duration_hours must be a positive integer" }, { status: 400 });
  }

  const roomSize = body.room_size ?? DEFAULT_ROOM_SIZE;
  if (!isRoomSize(roomSize)) {
    return Response.json({ message: `room_size must be one of ${VALID_ROOM_SIZES.join(", ")}` }, { status: 400 });
  }

  const acSeer = body.ac_seer ?? DEFAULT_AC_SEER;
  if (typeof acSeer !== "number" || acSeer <= 0) {
    return Response.json({ message: "ac_seer must be a positive number" }, { status: 400 });
  }

  const weatherCondition = body.weather_condition ?? DEFAULT_WEATHER_CONDITION;
  if (!isWeatherCondition(weatherCondition)) {
    return Response.json(
      { message: `weather_condition must be one of ${VALID_WEATHER_CONDITIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const staticTempC = body.static_temp_c ?? DEFAULT_STATIC_TEMP_C;
  if (typeof staticTempC !== "number" || !Number.isFinite(staticTempC)) {
    return Response.json({ message: "static_temp_c must be a number" }, { status: 400 });
  }

  const comfortPreference = body.comfort_preference ?? DEFAULT_COMFORT_PREFERENCE;
  if (!isComfortPreference(comfortPreference)) {
    return Response.json(
      { message: `comfort_preference must be one of ${VALID_COMFORT_PREFERENCES.join(", ")}` },
      { status: 400 },
    );
  }

  // deno-lint-ignore no-explicit-any
  const db = ctx.supabaseAdmin as any;
  const { data: readings, error: readError } = await db
    .from("occupancy_readings")
    .select("people_count, captured_at")
    .eq("source", "mock")
    .order("captured_at", { ascending: false })
    .limit(durationHours);

  if (readError) {
    console.error(readError.message);
    return Response.json({ message: readError.message }, { status: 500 });
  }

  if (!readings || readings.length < durationHours) {
    return Response.json(
      {
        message:
          `Not enough mock occupancy data — found ${readings?.length ?? 0}, need ${durationHours}. ` +
          "Call /simulation/generate-mock-data first.",
      },
      { status: 400 },
    );
  }

  // DB returned newest-first; simulate oldest-first (hour 0 = oldest).
  const orderedReadings = (readings as OccupancyReadingRow[]).slice().reverse();
  const peopleCounts = orderedReadings.map((r) => r.people_count);
  const capturedAt = orderedReadings.map((r) => new Date(r.captured_at));

  const { hourly, summary } = runSimulation(
    peopleCounts,
    roomSize,
    acSeer,
    weatherCondition,
    capturedAt,
    staticTempC,
    comfortPreference,
  );

  const { data: run, error: runError } = await db
    .from("simulation_runs")
    .insert({
      duration_hours: summary.duration_hours,
      current_energy_kwh: summary.current_energy_kwh,
      smart_energy_kwh: summary.smart_energy_kwh,
      current_co2_kg: summary.current_co2_kg,
      smart_co2_kg: summary.smart_co2_kg,
      current_cost_baht: summary.current_cost_baht,
      smart_cost_baht: summary.smart_cost_baht,
      pct_reduction: summary.pct_reduction,
      static_temp_c: staticTempC,
      comfort_preference: comfortPreference,
      static_v3_energy_kwh: summary.static_v3_energy_kwh,
      coolsense_v3_energy_kwh: summary.coolsense_v3_energy_kwh,
      static_v3_co2_kg: summary.static_v3_co2_kg,
      coolsense_v3_co2_kg: summary.coolsense_v3_co2_kg,
      static_v3_cost_baht: summary.static_v3_cost_baht,
      coolsense_v3_cost_baht: summary.coolsense_v3_cost_baht,
      v3_pct_reduction: summary.v3_pct_reduction,
      app_energy_kwh: summary.app_energy_kwh,
      net_energy_saved_kwh: summary.net_energy_saved_kwh,
      net_co2_saved_kg: summary.net_co2_saved_kg,
      net_cost_saved_baht: summary.net_cost_saved_baht,
    })
    .select()
    .maybeSingle();

  if (runError || !run) {
    console.error(runError?.message);
    return Response.json({ message: runError?.message ?? "Failed to create simulation_runs row" }, { status: 500 });
  }

  const hourlyRows = hourly.map((h) => ({ simulation_run_id: run.id, ...h }));
  const { error: hourlyError } = await db.from("simulation_hourly_data").insert(hourlyRows);

  if (hourlyError) {
    console.error(hourlyError.message);
    return Response.json({ message: hourlyError.message }, { status: 500 });
  }

  return Response.json({ simulation_run_id: run.id, summary });
}

async function handleGetRun(id: string, ctx: SupabaseContext): Promise<Response> {
  // deno-lint-ignore no-explicit-any
  const db = ctx.supabaseAdmin as any;
  const { data, error } = await db.from("simulation_runs").select("*").eq("id", id).maybeSingle();

  if (error) {
    console.error(error.message);
    return Response.json({ message: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ message: `simulation_runs row not found for id ${id}` }, { status: 404 });
  }
  return Response.json(data);
}

async function handleGetHourlyData(id: string, ctx: SupabaseContext): Promise<Response> {
  // deno-lint-ignore no-explicit-any
  const db = ctx.supabaseAdmin as any;

  // 404 the run itself if it doesn't exist, distinct from "run exists but
  // has no hourly rows yet" which returns [].
  const { data: run, error: runError } = await db.from("simulation_runs").select("id").eq("id", id).maybeSingle();
  if (runError) {
    console.error(runError.message);
    return Response.json({ message: runError.message }, { status: 500 });
  }
  if (!run) {
    return Response.json({ message: `simulation_runs row not found for id ${id}` }, { status: 404 });
  }

  const { data, error } = await db
    .from("simulation_hourly_data")
    .select("*")
    .eq("simulation_run_id", id)
    .order("hour_index", { ascending: true });

  if (error) {
    console.error(error.message);
    return Response.json({ message: error.message }, { status: 500 });
  }
  return Response.json(data ?? []);
}

async function handleListSimulations(ctx: SupabaseContext): Promise<Response> {
  // deno-lint-ignore no-explicit-any
  const db = ctx.supabaseAdmin as any;
  const { data, error } = await db
    .from("simulation_runs")
    .select("id, duration_hours, pct_reduction, current_energy_kwh, smart_energy_kwh, v3_pct_reduction, coolsense_v3_energy_kwh, created_at")
    .order("created_at", { ascending: false })
    .limit(RECENT_SIMULATIONS_LIMIT);

  if (error) {
    console.error(error.message);
    return Response.json({ message: error.message }, { status: 500 });
  }
  return Response.json(data ?? []);
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    const path = new URL(req.url).pathname;
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    const secondLast = segments[segments.length - 2];

    if (req.method === "POST") {
      if (last === "generate-mock-data") return handleGenerateMockData(req, ctx);
      if (last === "run") return handleRun(req, ctx);
      return Response.json(
        { message: "Unknown route — use /simulation/generate-mock-data or /simulation/run" },
        { status: 404 },
      );
    }

    if (req.method === "GET") {
      if (last === "list") return handleListSimulations(ctx);
      if (last === "hourly-data" && UUID_RE.test(secondLast ?? "")) return handleGetHourlyData(secondLast, ctx);
      if (UUID_RE.test(last ?? "")) return handleGetRun(last, ctx);
      return Response.json(
        { message: "Unknown route — use GET /simulation/list, /simulation/:id, or /simulation/:id/hourly-data" },
        { status: 404 },
      );
    }

    return Response.json({ message: "Method not allowed" }, { status: 405 });
  }),
};

/* To invoke locally:

  1. Run `supabase start` and `supabase functions serve --no-verify-jwt`
  2. Generate mock data, then run the simulation:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/simulation/generate-mock-data' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --header 'Content-Type: application/json' \
    --data '{"duration_hours":168,"room_size":"medium"}'

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/simulation/run' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --header 'Content-Type: application/json' \
    --data '{"duration_hours":168,"room_size":"medium","weather_condition":"hot","static_temp_c":25,"comfort_preference":"neutral"}'

  3. Then retrieve results using the simulation_run_id from step 2's response:

  curl -i 'http://127.0.0.1:54321/functions/v1/simulation/<simulation_run_id>' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

  curl -i 'http://127.0.0.1:54321/functions/v1/simulation/<simulation_run_id>/hourly-data' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

  curl -i 'http://127.0.0.1:54321/functions/v1/simulation/list' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

*/
