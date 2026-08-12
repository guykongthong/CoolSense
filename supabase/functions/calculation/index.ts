// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { calculateAcSettings, type RoomSize } from "../_shared/acCalculation.ts";

// TODO: ML JSON shape may change occupancy_readings columns.
// TODO: weather is not factored in yet — pending criteria from the science team.
const DEFAULT_ROOM_SIZE: RoomSize = "medium";

interface RoomConfigRow {
  room_size: RoomSize;
}

interface OccupancyReadingRow {
  id: string;
  people_count: number;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (_req, ctx) => {
    // deno-lint-ignore no-explicit-any
    const db = ctx.supabaseAdmin as any;

    const [{ data: roomConfig }, { data: reading }]: [
      { data: RoomConfigRow | null },
      { data: OccupancyReadingRow | null },
    ] = await Promise.all([
      db.from("room_config").select("room_size").eq("id", 1).maybeSingle(),
      db
        .from("occupancy_readings")
        .select("id, people_count")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const roomSize = (roomConfig?.room_size as RoomSize) ?? DEFAULT_ROOM_SIZE;
    const peopleCount = reading?.people_count ?? 0;

    const settings = calculateAcSettings(peopleCount, roomSize);

    const { data: calculation, error } = await db
      .from("ac_calculations")
      .insert({
        occupancy_reading_id: reading?.id ?? null,
        weather: "warm", // placeholder — not used in calculateAcSettings yet
        ac_mode: settings.mode,
        temperature_c: settings.temperature_c,
        fan_speed: settings.fan_speed,
        power_kw: settings.power_kw,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error(error.message);
      return Response.json({ ...settings, people_count: peopleCount, room_size: roomSize });
    }

    return Response.json(calculation);
  }),
};

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request GET 'http://127.0.0.1:54321/functions/v1/calculation' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

*/
