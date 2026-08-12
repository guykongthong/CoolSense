// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const VALID_ROOM_SIZES = ["small", "medium", "large"];
const VALID_EGAT_LABELS = ["1", "2", "3", "4", "5", "premium"];

// Same rule the frontend uses to decide whether to show the EGAT field —
// kept in sync so a direct API call can't bypass the "Thailand only" rule
// the UI enforces by hiding the input.
function isThailand(location: string | null | undefined): boolean {
  return (location ?? "").trim().toLowerCase().includes("thailand");
}

interface RoomConfigBody {
  building_name?: string;
  room_size?: string;
  location?: string;
  ac_seer?: number;
  egat_label?: string | null;
}

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ message: "Method not allowed" }, { status: 405 });
    }

    let body: RoomConfigBody;
    try {
      body = await req.json();
    } catch {
      return Response.json({ message: "Invalid JSON body" }, { status: 400 });
    }

    const { building_name, room_size, location, ac_seer, egat_label } = body;

    if (room_size !== undefined && !VALID_ROOM_SIZES.includes(room_size)) {
      return Response.json(
        { message: `room_size must be one of ${VALID_ROOM_SIZES.join(", ")}` },
        { status: 400 },
      );
    }
    if (ac_seer !== undefined && (typeof ac_seer !== "number" || ac_seer <= 0)) {
      return Response.json({ message: "ac_seer must be a positive number" }, { status: 400 });
    }
    if (egat_label !== undefined && egat_label !== null && !VALID_EGAT_LABELS.includes(egat_label)) {
      return Response.json(
        { message: `egat_label must be one of ${VALID_EGAT_LABELS.join(", ")}, or null` },
        { status: 400 },
      );
    }

    // deno-lint-ignore no-explicit-any
    const db = ctx.supabaseAdmin as any;

    if (egat_label !== undefined && egat_label !== null) {
      // location may be changing in this same request — resolve against
      // whichever value will actually be stored, not just what's on disk.
      let effectiveLocation = location;
      if (effectiveLocation === undefined) {
        const { data: current } = await db.from("room_config").select("location").eq("id", 1).maybeSingle();
        effectiveLocation = current?.location;
      }
      if (!isThailand(effectiveLocation)) {
        return Response.json(
          { message: "egat_label can only be set when location is Thailand" },
          { status: 400 },
        );
      }
    }

    const update: Record<string, unknown> = {};
    if (building_name !== undefined) update.building_name = building_name;
    if (room_size !== undefined) update.room_size = room_size;
    if (location !== undefined) update.location = location;
    if (ac_seer !== undefined) update.ac_seer = ac_seer;
    if (egat_label !== undefined) update.egat_label = egat_label;

    // Moving location away from Thailand invalidates any previously stored
    // label, even if this request didn't touch egat_label itself.
    if (location !== undefined && !isThailand(location) && egat_label === undefined) {
      update.egat_label = null;
    }

    const { data, error } = await db
      .from("room_config")
      .update(update)
      .eq("id", 1)
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

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/room-config' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --header 'Content-Type: application/json' \
    --data '{"building_name":"Central Library","room_size":"medium","location":"Thailand","ac_seer":4.5,"egat_label":"5"}'

*/
