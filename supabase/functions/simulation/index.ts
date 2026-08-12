// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Placeholder — mock data generator + 168-hour current-vs-smart comparison not implemented yet.
export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (_req, _ctx) => {
    return Response.json({ message: "not implemented yet" });
  }),
};

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request GET 'http://127.0.0.1:54321/functions/v1/simulation' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

*/
