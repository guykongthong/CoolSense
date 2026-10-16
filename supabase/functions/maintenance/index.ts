// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import type { SupabaseContext } from "@supabase/server";
import {
  type ActiveAlert,
  BASELINE_MAX_DAYS,
  decideAlertAction,
  type DetectionResult,
  detectDegradation,
  type DismissedAlert,
  generateMockPowerReadings,
  isRunningReading,
  type PowerReading,
} from "../_shared/maintenanceDetection.ts";
import type { RoomSize } from "../_shared/acCalculation.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const INSERT_CHUNK = 500;
const DEFAULT_MOCK_DAYS = 60;
const DEFAULT_DEGRADATION_START_DAY = 45;
const DEFAULT_DEGRADATION_PCT = 25;
const MAX_MOCK_DAYS = 120;
const ALERT_LIST_LIMIT = 50;
const VALID_STATUSES = ["open", "acknowledged", "dismissed", "resolved"];

// deno-lint-ignore no-explicit-any
type Db = any;

interface StoredReading extends PowerReading {
  source: string;
}

function errorResponse(message: string, status = 500): Response {
  if (status >= 500) console.error(message);
  return Response.json({ message }, { status });
}

async function fetchReadings(db: Db, since: Date): Promise<StoredReading[]> {
  // PostgREST caps a response at 1000 rows, so page through the window.
  const rows: StoredReading[] = [];
  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("ac_power_readings")
      .select("measured_at, power_kw, expected_power_kw, setpoint_c, outside_temp_c, capacity_constrained, source")
      .gte("measured_at", since.toISOString())
      .order("measured_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      power_kw: Number(r.power_kw),
      expected_power_kw: Number(r.expected_power_kw),
      setpoint_c: Number(r.setpoint_c),
      outside_temp_c: Number(r.outside_temp_c),
    }));
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchLastServicedAt(db: Db): Promise<Date | null> {
  const { data, error } = await db.from("room_config").select("last_serviced_at").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.last_serviced_at ? new Date(data.last_serviced_at) : null;
}

async function loadEvaluationInputs(db: Db, now: Date) {
  const [readings, lastServicedAt] = await Promise.all([
    fetchReadings(db, new Date(now.getTime() - BASELINE_MAX_DAYS * DAY_MS)),
    fetchLastServicedAt(db),
  ]);
  return { readings, lastServicedAt };
}

function evaluationBody(result: DetectionResult, readings: StoredReading[], lastServicedAt: Date | null) {
  const first = readings[0]?.measured_at;
  return {
    ...result,
    readings_count: readings.length,
    history_days: first ? Math.floor((Date.now() - new Date(first).getTime()) / DAY_MS) : 0,
    demo_data: readings.some((r) => r.source === "mock"),
    last_serviced_at: lastServicedAt?.toISOString() ?? null,
  };
}

async function handleEvaluate(ctx: SupabaseContext): Promise<Response> {
  const db = ctx.supabaseAdmin as Db;
  const now = new Date();
  try {
    const { readings, lastServicedAt } = await loadEvaluationInputs(db, now);
    const result = detectDegradation(readings, now, lastServicedAt);

    const [activeRes, dismissedRes] = await Promise.all([
      db.from("maintenance_alerts").select("id, severity, status").in("status", ["open", "acknowledged"]).maybeSingle(),
      db.from("maintenance_alerts").select("severity, dismissed_at").eq("status", "dismissed")
        .order("dismissed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (activeRes.error) throw new Error(activeRes.error.message);
    if (dismissedRes.error) throw new Error(dismissedRes.error.message);

    const active = activeRes.data as ActiveAlert | null;
    const dismissed = dismissedRes.data as DismissedAlert | null;
    const action = decideAlertAction(result, active, dismissed, now);
    const nowIso = now.toISOString();
    const fields = {
      excess_pct: result.excess_pct,
      baseline_ratio: result.baseline_ratio,
      recent_ratio: result.recent_ratio,
      buckets_evaluated: result.buckets_evaluated,
      worst_bucket: result.worst_bucket,
      window_start: result.window_start,
      window_end: result.window_end,
      updated_at: nowIso,
    };

    if (action.type === "create") {
      const { error } = await db.from("maintenance_alerts").insert({ ...fields, severity: action.severity });
      if (error) throw new Error(error.message);
    } else if (action.type === "update") {
      const { error } = await db.from("maintenance_alerts").update({ ...fields, severity: action.severity }).eq("id", action.id);
      if (error) throw new Error(error.message);
    } else if (action.type === "resolve") {
      const { error } = await db.from("maintenance_alerts")
        .update({ status: "resolved", resolved_at: nowIso, updated_at: nowIso }).eq("id", action.id);
      if (error) throw new Error(error.message);
    }

    const { data: alert, error: alertError } = await db
      .from("maintenance_alerts")
      .select("*")
      .in("status", ["open", "acknowledged"])
      .maybeSingle();
    if (alertError) throw new Error(alertError.message);

    return Response.json({ evaluation: evaluationBody(result, readings, lastServicedAt), alert: alert ?? null, action: action.type });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

async function handleListAlerts(url: URL, ctx: SupabaseContext): Promise<Response> {
  const db = ctx.supabaseAdmin as Db;
  const status = url.searchParams.get("status");
  if (status && !VALID_STATUSES.includes(status)) {
    return errorResponse(`status must be one of ${VALID_STATUSES.join(", ")}`, 400);
  }
  let query = db.from("maintenance_alerts").select("*").order("created_at", { ascending: false }).limit(ALERT_LIST_LIMIT);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return errorResponse(error.message);
  return Response.json(data ?? []);
}

async function handleTrend(url: URL, ctx: SupabaseContext): Promise<Response> {
  const db = ctx.supabaseAdmin as Db;
  const days = Number(url.searchParams.get("days") ?? 30);
  if (!Number.isInteger(days) || days <= 0 || days > BASELINE_MAX_DAYS) {
    return errorResponse(`days must be an integer between 1 and ${BASELINE_MAX_DAYS}`, 400);
  }
  const now = new Date();
  try {
    const { readings, lastServicedAt } = await loadEvaluationInputs(db, now);
    const result = detectDegradation(readings, now, lastServicedAt);
    const baselineRatio = result.baseline_ratio ?? 1;

    const since = now.getTime() - days * DAY_MS;
    const byDay = new Map<string, { actual: number; expected: number }>();
    for (const r of readings) {
      if (!isRunningReading(r)) continue;
      const t = new Date(r.measured_at).getTime();
      if (t < since) continue;
      const key = new Date(r.measured_at).toISOString().slice(0, 10);
      const day = byDay.get(key) ?? { actual: 0, expected: 0 };
      // Hourly readings, so kW over the hour is kWh.
      day.actual += r.power_kw;
      day.expected += r.expected_power_kw * baselineRatio;
      byDay.set(key, day);
    }

    const points = [...byDay.entries()].map(([date, d]) => ({
      date,
      actual_kwh: d.actual,
      expected_baseline_kwh: d.expected,
      ratio: d.expected > 0 ? d.actual / d.expected : null,
    }));
    return Response.json({ baseline_ratio: result.baseline_ratio, points });
  } catch (e) {
    return errorResponse((e as Error).message);
  }
}

interface PatchBody {
  status?: string;
  note?: string;
}

async function handlePatchAlert(id: string, req: Request, ctx: SupabaseContext): Promise<Response> {
  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  if (body.status !== "acknowledged" && body.status !== "dismissed") {
    return errorResponse("status must be 'acknowledged' or 'dismissed'", 400);
  }
  if (body.note !== undefined && typeof body.note !== "string") {
    return errorResponse("note must be a string", 400);
  }

  const db = ctx.supabaseAdmin as Db;
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = { status: body.status, updated_at: nowIso };
  if (body.status === "acknowledged") update.acknowledged_at = nowIso;
  if (body.status === "dismissed") update.dismissed_at = nowIso;
  if (body.note !== undefined) update.note = body.note.trim() || null;

  const { data, error } = await db
    .from("maintenance_alerts")
    .update(update)
    .eq("id", id)
    .in("status", ["open", "acknowledged"])
    .select("*")
    .maybeSingle();
  if (error) return errorResponse(error.message);
  if (!data) return errorResponse("No open alert with that id", 404);
  return Response.json(data);
}

async function handleMarkServiced(ctx: SupabaseContext): Promise<Response> {
  const db = ctx.supabaseAdmin as Db;
  const nowIso = new Date().toISOString();

  const { error: configError } = await db.from("room_config").update({ last_serviced_at: nowIso }).eq("id", 1);
  if (configError) return errorResponse(configError.message);

  const { data, error } = await db
    .from("maintenance_alerts")
    .update({ status: "resolved", resolved_at: nowIso, updated_at: nowIso })
    .in("status", ["open", "acknowledged"])
    .select("id");
  if (error) return errorResponse(error.message);
  return Response.json({ last_serviced_at: nowIso, resolved_alerts: (data ?? []).length });
}

interface MockBody {
  days?: number;
  degradation_start_day?: number;
  degradation_pct?: number;
}

async function handleGenerateMockData(req: Request, ctx: SupabaseContext): Promise<Response> {
  let body: MockBody;
  try {
    body = req.body ? await req.json() : {};
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  const days = body.days ?? DEFAULT_MOCK_DAYS;
  const startDay = body.degradation_start_day ?? DEFAULT_DEGRADATION_START_DAY;
  const pct = body.degradation_pct ?? DEFAULT_DEGRADATION_PCT;
  if (!Number.isInteger(days) || days < 1 || days > MAX_MOCK_DAYS) {
    return errorResponse(`days must be an integer between 1 and ${MAX_MOCK_DAYS}`, 400);
  }
  if (typeof startDay !== "number" || startDay < 0) {
    return errorResponse("degradation_start_day must be a non-negative number", 400);
  }
  if (typeof pct !== "number" || pct < 0 || pct > 200) {
    return errorResponse("degradation_pct must be a number between 0 and 200", 400);
  }

  const db = ctx.supabaseAdmin as Db;
  const { data: config, error: configError } = await db.from("room_config").select("room_size, ac_seer").eq("id", 1).maybeSingle();
  if (configError) return errorResponse(configError.message);

  const readings = generateMockPowerReadings(days, startDay, pct, new Date(), Math.random, {
    roomSize: (config?.room_size as RoomSize | undefined) ?? "medium",
    seer: config?.ac_seer ? Number(config.ac_seer) : undefined,
  });

  // Replace, not append, same as simulation/generate-mock-data. Only touches
  // source='mock' rows, never real meter readings.
  const { error: deleteError } = await db.from("ac_power_readings").delete().eq("source", "mock");
  if (deleteError) return errorResponse(deleteError.message);

  for (let i = 0; i < readings.length; i += INSERT_CHUNK) {
    const { error } = await db.from("ac_power_readings").insert(readings.slice(i, i + INSERT_CHUNK));
    if (error) return errorResponse(error.message);
  }

  // The demo history replaces whatever the old alerts described, and a stale
  // service date would shrink the new baseline window.
  const { error: resetError } = await db.from("room_config").update({ last_serviced_at: null }).eq("id", 1);
  if (resetError) return errorResponse(resetError.message);
  const { error: alertsError } = await db.from("maintenance_alerts").delete().neq("status", "");
  if (alertsError) return errorResponse(alertsError.message);

  return Response.json({ readings_inserted: readings.length, days, degradation_start_day: startDay, degradation_pct: pct });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, (req, ctx) => {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    const secondLast = segments[segments.length - 2];

    if (req.method === "POST") {
      if (last === "evaluate") return handleEvaluate(ctx);
      if (last === "mark-serviced") return handleMarkServiced(ctx);
      if (last === "generate-mock-data") return handleGenerateMockData(req, ctx);
    } else if (req.method === "GET") {
      if (last === "alerts") return handleListAlerts(url, ctx);
      if (last === "trend") return handleTrend(url, ctx);
    } else if (req.method === "PATCH") {
      if (secondLast === "alerts" && UUID_RE.test(last ?? "")) return handlePatchAlert(last, req, ctx);
    } else {
      return Promise.resolve(errorResponse("Method not allowed", 405));
    }

    return Promise.resolve(errorResponse(
      "Unknown route. Use POST /maintenance/evaluate, /mark-serviced, /generate-mock-data, GET /maintenance/alerts, /trend, or PATCH /maintenance/alerts/:id",
      404,
    ));
  }),
};

/* To invoke locally:

  1. Run `supabase start` and `supabase functions serve --no-verify-jwt`
  2. Generate demo history (60 days, filter degrades from day 45, +25% power), then evaluate:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/maintenance/generate-mock-data' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --header 'Content-Type: application/json' \
    --data '{"days":60,"degradation_start_day":45,"degradation_pct":25}'

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/maintenance/evaluate' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

  3. List alerts, read the trend, update an alert, record a cleaning:

  curl -i 'http://127.0.0.1:54321/functions/v1/maintenance/alerts?status=open' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

  curl -i 'http://127.0.0.1:54321/functions/v1/maintenance/trend?days=30' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

  curl -i --location --request PATCH 'http://127.0.0.1:54321/functions/v1/maintenance/alerts/<alert_id>' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
    --header 'Content-Type: application/json' \
    --data '{"status":"acknowledged","note":"Technician booked for Friday"}'

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/maintenance/mark-serviced' \
    --header 'apiKey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'

*/
