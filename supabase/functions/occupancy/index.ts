// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import type { SupabaseContext } from "@supabase/server";
import { findPeakOccupancy, getUtcDayStart } from "../_shared/occupancyStats.ts";

// TODO: ML JSON shape — response shape will change once teammate's
// Google Cloud service and the `occupancy_readings` table are finalized.
const MOCK_READING = {
  id: "mock-reading-1",
  people_count: 2,
  source: "mock",
  captured_at: new Date(0).toISOString(),
};

async function handleLatest(ctx: SupabaseContext): Promise<Response> {
  const { data, error } = await ctx.supabaseAdmin
    .from("occupancy_readings")
    .select("*")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table doesn't exist yet (created later once ML JSON shape is known) — fall back to mock.
    console.error(error.message);
    return Response.json(MOCK_READING);
  }

  return Response.json(data ?? MOCK_READING);
}

// Backs the People page's "Peak Occupancy Today" stat card, which was a
// hardcoded placeholder value before this endpoint existed. "Today" is the
// UTC calendar day — see getUtcDayStart's doc comment for why. Excludes
// source='mock' the same way /calculation does, so a simulation run can't
// make the live page report a fake peak.
async function handlePeakToday(ctx: SupabaseContext): Promise<Response> {
  const { data, error } = await ctx.supabaseAdmin
    .from("occupancy_readings")
    .select("people_count, captured_at")
    .neq("source", "mock")
    .gte("captured_at", getUtcDayStart().toISOString());

  if (error) {
    console.error(error.message);
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json(findPeakOccupancy(data ?? []));
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, (req, ctx) => {
    const path = new URL(req.url).pathname;
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1];

    if (last === "peak-today") return handlePeakToday(ctx);
    return handleLatest(ctx);
  }),
};

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request GET 'http://127.0.0.1:54321/functions/v1/occupancy' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

  3. Or get today's peak occupancy:

  curl -i --location --request GET 'http://127.0.0.1:54321/functions/v1/occupancy/peak-today' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

*/
