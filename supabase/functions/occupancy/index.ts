// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// TODO: ML JSON shape — response shape will change once teammate's
// Google Cloud service and the `occupancy_readings` table are finalized.
const MOCK_READING = {
  id: "mock-reading-1",
  people_count: 2,
  source: "mock",
  captured_at: new Date(0).toISOString(),
};

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (_req, ctx) => {
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
  }),
};

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request GET 'http://127.0.0.1:54321/functions/v1/occupancy' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

*/
