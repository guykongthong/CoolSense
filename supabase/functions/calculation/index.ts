// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { runCalculation } from "../_shared/runCalculation.ts";

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (_req, ctx) => {
    // deno-lint-ignore no-explicit-any
    const db = ctx.supabaseAdmin as any;
    const { calculation, error, fallback } = await runCalculation(db);

    if (error) {
      console.error(error.message);
      return Response.json(fallback, { status: 500 });
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
