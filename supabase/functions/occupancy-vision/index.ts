// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { buildGeminiRequestBody, GeminiParseError, parseGeminiPeopleCount, vertexEndpointUrl } from "../_shared/geminiOccupancy.ts";
import { getAccessToken, type ServiceAccountCredentials } from "../_shared/googleServiceAuth.ts";

interface OccupancyVisionBody {
  image_base64?: string;
  mime_type?: string;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "Method not allowed" }, { status: 405 });
    }

    const serviceAccountJson = Deno.env.get("GCP_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      return Response.json({ message: "GCP_SERVICE_ACCOUNT_JSON is not configured" }, { status: 500 });
    }
    let credentials: ServiceAccountCredentials;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch {
      return Response.json({ message: "GCP_SERVICE_ACCOUNT_JSON is not valid JSON" }, { status: 500 });
    }

    let body: OccupancyVisionBody;
    try {
      body = await req.json();
    } catch {
      return Response.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const { image_base64, mime_type } = body;
    if (typeof image_base64 !== "string" || image_base64.length === 0) {
      return Response.json({ message: "image_base64 is required" }, { status: 400 });
    }
    if (typeof mime_type !== "string" || mime_type.length === 0) {
      return Response.json({ message: "mime_type is required" }, { status: 400 });
    }

    let geminiRes: Response;
    try {
      const accessToken = await getAccessToken(credentials);
      geminiRes = await fetch(vertexEndpointUrl(credentials.project_id), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify(buildGeminiRequestBody(image_base64, mime_type)),
      });
    } catch (e) {
      console.error(`Vertex AI request failed: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
      return Response.json({ message: "Failed to reach Vertex AI" }, { status: 502 });
    }

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error(`Vertex AI error: ${geminiRes.status} ${errBody}`);
      return Response.json({ message: `Vertex AI request failed (${geminiRes.status})` }, { status: 502 });
    }

    let peopleCount: number;
    try {
      peopleCount = parseGeminiPeopleCount(await geminiRes.json());
    } catch (e) {
      if (e instanceof GeminiParseError) {
        console.error(e.message);
        return Response.json({ message: "Gemini did not return a usable people count" }, { status: 502 });
      }
      throw e;
    }

    // deno-lint-ignore no-explicit-any
    const db = ctx.supabaseAdmin as any;
    const { data, error } = await db
      .from("occupancy_readings")
      .insert({ people_count: peopleCount, source: "camera_gemini" })
      .select()
      .maybeSingle();

    if (error) {
      console.error(error.message);
      return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json({ people_count: peopleCount, reading: data });
  }),
};

/* To invoke locally:

  1. Run `supabase start` and `supabase functions serve --env-file supabase/.env`
     (supabase/.env must set GCP_SERVICE_ACCOUNT_JSON to the full JSON key of a
     service account with the "Vertex AI User" role, on one line — see supabase/.env.example)
  2. Make an HTTP request with a base64-encoded JPEG/PNG frame:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/occupancy-vision' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --header 'Content-Type: application/json' \
    --data '{"image_base64":"<base64 jpeg data, no data: prefix>","mime_type":"image/jpeg"}'

*/
