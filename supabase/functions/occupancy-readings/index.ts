// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

interface OccupancyReadingBody {
  people_count?: number;
  source?: string;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "Method not allowed" }, { status: 405 });
    }

    let body: OccupancyReadingBody;
    try {
      body = await req.json();
    } catch {
      return Response.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const { people_count, source } = body;

    if (typeof people_count !== "number" || people_count < 0) {
      return Response.json({ message: "people_count must be a non-negative number" }, { status: 400 });
    }

    // deno-lint-ignore no-explicit-any
    const db = ctx.supabaseAdmin as any;
    const { data, error } = await db
      .from("occupancy_readings")
      .insert({ people_count, source: source ?? "manual" })
      .select()
      .maybeSingle();

    if (error) {
      console.error(error.message);
      return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json(data);
  }),
};

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/occupancy-readings' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --header 'Content-Type: application/json' \
    --data '{"people_count":5,"source":"manual"}'

*/
