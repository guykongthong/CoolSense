// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Placeholder — AC mode algorithm (people_count + room_size + weather -> mode/temp/fan/power) not implemented yet.
export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (_req, _ctx) => {
    return Response.json({ message: "not implemented yet" });
  }),
};

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request GET 'http://127.0.0.1:54321/functions/v1/calculation' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

*/
