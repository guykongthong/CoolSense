// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const WEATHERAPI_BASE_URL = "https://api.weatherapi.com/v1/current.json";

interface WeatherApiResponse {
  current: {
    temp_c: number;
    humidity: number;
    condition: { text: string; icon: string };
  };
}

// weatherapi.com returns protocol-relative icon URLs (e.g. "//cdn.weatherapi.com/...").
function toAbsoluteUrl(protocolRelativeUrl: string): string {
  return protocolRelativeUrl.startsWith("//") ? `https:${protocolRelativeUrl}` : protocolRelativeUrl;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "Method not allowed" }, { status: 405 });
    }

    const apiKey = Deno.env.get("WEATHERAPI_KEY");
    if (!apiKey) {
      return Response.json({ message: "WEATHERAPI_KEY is not configured" }, { status: 500 });
    }

    // deno-lint-ignore no-explicit-any
    const db = ctx.supabaseAdmin as any;

    const { data: roomConfig } = await db.from("room_config").select("location").eq("id", 1).maybeSingle();
    const location = roomConfig?.location?.trim();
    if (!location) {
      return Response.json(
        { message: "room_config.location is not set — call room-config first" },
        { status: 400 },
      );
    }

    const url = `${WEATHERAPI_BASE_URL}?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(location)}`;
    const weatherRes = await fetch(url);
    if (!weatherRes.ok) {
      const body = await weatherRes.text();
      console.error(`weatherapi.com error: ${weatherRes.status} ${body}`);
      return Response.json({ message: `weatherapi.com request failed (${weatherRes.status})` }, { status: 502 });
    }

    const weather = (await weatherRes.json()) as WeatherApiResponse;

    const { data, error } = await db
      .from("weather_readings")
      .insert({
        location,
        temp_c: weather.current.temp_c,
        humidity_pct: weather.current.humidity,
        condition: weather.current.condition.text,
        condition_icon_url: toAbsoluteUrl(weather.current.condition.icon),
      })
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

  1. Run `supabase start` and `supabase functions serve --env-file supabase/.env`
  2. Make an HTTP request (room_config.location must already be set — see room-config):

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/weather' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

*/
