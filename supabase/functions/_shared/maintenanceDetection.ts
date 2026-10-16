import type { RoomSize } from "./acCalculation.ts";
import { STANDARD_SEER_V3 } from "./acCalculationV3.ts";
import { calculateCoolSenseV3Settings } from "./coolSenseV3Calculation.ts";
import { generateMockOccupancy, getDiurnalWeather } from "./simulation.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

// Detection thresholds. A clogged filter or fouled coil makes the unit draw
// more power than CoolSense V3 expects for the same conditions, so we track
// measured / expected and look for it drifting up against the unit's own
// history.
export const BASELINE_MAX_DAYS = 90;
export const BASELINE_END_DAYS_AGO = 14;
export const RECENT_DAYS = 7;
export const MIN_BASELINE_DAYS = 14;
export const MIN_BASELINE_SAMPLES = 12;
export const MIN_RECENT_SAMPLES = 6;
export const MIN_QUALIFYING_BUCKETS = 3;
export const MIN_RECENT_SAMPLES_TOTAL = 24;
export const MIN_HALF_SAMPLES = 2;
export const MIN_POSITIVE_BUCKET_SHARE = 0.6;
export const OUTSIDE_TEMP_BAND_C = 2;

// Excess power over the unit's own baseline, as a fraction.
export const WATCH_EXCESS = 0.1;
export const WARNING_EXCESS = 0.2;
export const CRITICAL_EXCESS = 0.35;
export const RESOLVE_EXCESS = 0.05;
export const DISMISS_SUPPRESS_DAYS = 7;

export type Severity = "watch" | "warning" | "critical";
export type DetectionStatus = "insufficient_data" | "healthy" | "degraded";

export interface PowerReading {
  measured_at: string | Date;
  power_kw: number;
  expected_power_kw: number;
  setpoint_c: number;
  outside_temp_c: number;
  capacity_constrained?: boolean;
}

export interface BucketResult {
  setpoint_c: number;
  outside_temp_min_c: number;
  outside_temp_max_c: number;
  baseline_samples: number;
  recent_samples: number;
  excess_pct: number;
}

export interface DetectionResult {
  status: DetectionStatus;
  severity: Severity | null;
  excess_pct: number | null;
  baseline_ratio: number | null;
  recent_ratio: number | null;
  buckets_evaluated: number;
  buckets: BucketResult[];
  worst_bucket: BucketResult | null;
  baseline_days: number;
  recent_samples: number;
  window_start: string | null;
  window_end: string;
  reason?: string;
}

export interface DetectionOptions {
  watchExcess?: number;
  warningExcess?: number;
  criticalExcess?: number;
}

export function isRunningReading(r: PowerReading): boolean {
  return r.power_kw > 0 && r.expected_power_kw > 0 && !r.capacity_constrained;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function severityFor(excess: number, opts: DetectionOptions = {}): Severity | null {
  if (excess >= (opts.criticalExcess ?? CRITICAL_EXCESS)) return "critical";
  if (excess >= (opts.warningExcess ?? WARNING_EXCESS)) return "warning";
  if (excess >= (opts.watchExcess ?? WATCH_EXCESS)) return "watch";
  return null;
}

const SEVERITY_RANK: Record<Severity, number> = { watch: 1, warning: 2, critical: 3 };

interface Sample {
  t: number;
  ratio: number;
}

interface Bucket {
  setpoint: number;
  band: number;
  baseline: number[];
  recent: Sample[];
}

function insufficient(
  now: Date,
  windowStart: number,
  baselineDays: number,
  reason: string,
  extra: Partial<DetectionResult> = {},
): DetectionResult {
  return {
    status: "insufficient_data",
    severity: null,
    excess_pct: null,
    baseline_ratio: null,
    recent_ratio: null,
    buckets_evaluated: 0,
    buckets: [],
    worst_bucket: null,
    baseline_days: Math.max(0, Math.floor(baselineDays)),
    recent_samples: 0,
    window_start: new Date(windowStart).toISOString(),
    window_end: now.toISOString(),
    reason,
    ...extra,
  };
}

/**
 * Compares the last 7 days of measured/expected power against the unit's own
 * baseline (from the last service, or 90 days back, up to 14 days ago) within
 * matching setpoint x outdoor temperature buckets, so weather and occupancy
 * changes are not mistaken for dirt. Pure function.
 */
export function detectDegradation(
  readings: PowerReading[],
  now: Date,
  lastServicedAt: Date | null,
  opts: DetectionOptions = {},
): DetectionResult {
  const nowMs = now.getTime();
  const recentStart = nowMs - RECENT_DAYS * DAY_MS;
  const baselineEnd = nowMs - BASELINE_END_DAYS_AGO * DAY_MS;
  const baselineStart = Math.max(lastServicedAt?.getTime() ?? -Infinity, nowMs - BASELINE_MAX_DAYS * DAY_MS);

  const buckets = new Map<string, Bucket>();
  let earliestBaseline = Infinity;

  for (const r of readings) {
    if (!isRunningReading(r)) continue;
    const t = new Date(r.measured_at).getTime();
    const inBaseline = t >= baselineStart && t < baselineEnd;
    const inRecent = t >= recentStart && t <= nowMs;
    if (!inBaseline && !inRecent) continue;

    const setpoint = Math.round(r.setpoint_c);
    const band = Math.floor(r.outside_temp_c / OUTSIDE_TEMP_BAND_C);
    const key = `${setpoint}|${band}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { setpoint, band, baseline: [], recent: [] };
      buckets.set(key, bucket);
    }
    const ratio = r.power_kw / r.expected_power_kw;
    if (inBaseline) {
      bucket.baseline.push(ratio);
      earliestBaseline = Math.min(earliestBaseline, t);
    } else {
      bucket.recent.push({ t, ratio });
    }
  }

  const baselineDays = Number.isFinite(earliestBaseline) ? (baselineEnd - earliestBaseline) / DAY_MS : 0;
  if (baselineDays < MIN_BASELINE_DAYS) {
    return insufficient(now, baselineStart, baselineDays, "baseline_too_short");
  }

  const midpoint = recentStart + (RECENT_DAYS * DAY_MS) / 2;
  const qualifying = [...buckets.values()].filter(
    (b) => b.baseline.length >= MIN_BASELINE_SAMPLES && b.recent.length >= MIN_RECENT_SAMPLES,
  );
  const recentTotal = qualifying.reduce((sum, b) => sum + b.recent.length, 0);

  if (qualifying.length < MIN_QUALIFYING_BUCKETS || recentTotal < MIN_RECENT_SAMPLES_TOTAL) {
    return insufficient(now, baselineStart, baselineDays, "too_few_comparable_hours", {
      buckets_evaluated: qualifying.length,
      recent_samples: recentTotal,
    });
  }

  const results: BucketResult[] = [];
  let weightedExcess = 0;
  let weightedBaseline = 0;
  let weightedRecent = 0;
  let positive = 0;
  // Persistence: each half of the recent window must show the excess on its own.
  const half = [
    { weighted: 0, weight: 0 }, // newer half
    { weighted: 0, weight: 0 }, // older half
  ];

  for (const b of qualifying) {
    const baselineMedian = median(b.baseline);
    const recentMedian = median(b.recent.map((s) => s.ratio));
    const excess = recentMedian / baselineMedian - 1;
    const n = b.recent.length;
    weightedExcess += excess * n;
    weightedBaseline += baselineMedian * n;
    weightedRecent += recentMedian * n;
    if (excess > 0) positive++;

    const halves = [b.recent.filter((s) => s.t >= midpoint), b.recent.filter((s) => s.t < midpoint)];
    halves.forEach((samples, i) => {
      if (samples.length < MIN_HALF_SAMPLES) return;
      half[i].weighted += (median(samples.map((s) => s.ratio)) / baselineMedian - 1) * samples.length;
      half[i].weight += samples.length;
    });

    results.push({
      setpoint_c: b.setpoint,
      outside_temp_min_c: b.band * OUTSIDE_TEMP_BAND_C,
      outside_temp_max_c: (b.band + 1) * OUTSIDE_TEMP_BAND_C,
      baseline_samples: b.baseline.length,
      recent_samples: n,
      excess_pct: excess * 100,
    });
  }

  const excess = weightedExcess / recentTotal;
  const watch = opts.watchExcess ?? WATCH_EXCESS;
  const halfExcess = half.map((h) => (h.weight > 0 ? h.weighted / h.weight : 0));
  const persistent = half.every((h) => h.weight > 0) && halfExcess.every((e) => e >= watch);
  const broad = positive / qualifying.length >= MIN_POSITIVE_BUCKET_SHARE;
  const severity = broad && persistent ? severityFor(excess, opts) : null;
  const worst = results.reduce((a, b) => (b.excess_pct > a.excess_pct ? b : a));

  return {
    status: severity ? "degraded" : "healthy",
    severity,
    excess_pct: excess * 100,
    baseline_ratio: weightedBaseline / recentTotal,
    recent_ratio: weightedRecent / recentTotal,
    buckets_evaluated: qualifying.length,
    buckets: results,
    worst_bucket: worst,
    baseline_days: Math.floor(baselineDays),
    recent_samples: recentTotal,
    window_start: new Date(baselineStart).toISOString(),
    window_end: now.toISOString(),
  };
}

export interface ActiveAlert {
  id: string;
  severity: Severity;
  status: "open" | "acknowledged";
}

export interface DismissedAlert {
  severity: Severity;
  dismissed_at: string | null;
}

export type AlertAction =
  | { type: "none" }
  | { type: "create"; severity: Severity }
  | { type: "update"; id: string; severity: Severity }
  | { type: "resolve"; id: string };

/**
 * Decides what to do with maintenance_alerts after an evaluation.
 * - A live alert resolves once excess falls under 5% (hysteresis: it stays
 *   while excess sits between 5% and the 10% watch line).
 * - A dismissed alert silences the same or a lower severity for 7 days;
 *   a worse severity opens a new alert.
 */
export function decideAlertAction(
  result: DetectionResult,
  active: ActiveAlert | null,
  lastDismissed: DismissedAlert | null,
  now: Date,
): AlertAction {
  if (result.status === "insufficient_data") return { type: "none" };

  if (result.status === "healthy") {
    if (active && result.excess_pct !== null && result.excess_pct < RESOLVE_EXCESS * 100) {
      return { type: "resolve", id: active.id };
    }
    return { type: "none" };
  }

  const severity = result.severity as Severity;
  if (active) return { type: "update", id: active.id, severity };

  if (lastDismissed?.dismissed_at) {
    const age = now.getTime() - new Date(lastDismissed.dismissed_at).getTime();
    const suppressed = age < DISMISS_SUPPRESS_DAYS * DAY_MS && SEVERITY_RANK[severity] <= SEVERITY_RANK[lastDismissed.severity];
    if (suppressed) return { type: "none" };
  }
  return { type: "create", severity };
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

export const MOCK_NOISE_AMPLITUDE = 0.08;
export const MOCK_RAMP_DAYS = 7;

export interface MockPowerReading {
  measured_at: string;
  power_kw: number;
  expected_power_kw: number;
  setpoint_c: number;
  outside_temp_c: number;
  humidity_pct: number;
  people_count: number;
  capacity_constrained: boolean;
  source: "mock";
}

/**
 * Hourly demo readings ending at `now`. Measured power follows what CoolSense
 * V3 expects (+-8% noise); from `degradationStartDay` (counted from the first
 * reading) it ramps up over a week to `degradationPct` percent extra draw,
 * the way a clogging filter would. Pure; `now` and `random` are injectable.
 */
export function generateMockPowerReadings(
  days: number,
  degradationStartDay: number,
  degradationPct: number,
  now: Date = new Date(),
  random: () => number = Math.random,
  config: { roomSize?: RoomSize; seer?: number } = {},
): MockPowerReading[] {
  const roomSize = config.roomSize ?? "medium";
  const seer = config.seer ?? STANDARD_SEER_V3;
  const hours = days * 24;
  const occupancy = generateMockOccupancy(hours, roomSize, { now, random });
  const startMs = now.getTime() - (hours - 1) * 60 * 60 * 1000;

  return occupancy.map((o) => {
    const at = new Date(o.captured_at);
    const weather = getDiurnalWeather(at);
    const expected = calculateCoolSenseV3Settings(o.people_count, roomSize, seer, weather.tempC, weather.humidityPct);

    const dayIndex = (at.getTime() - startMs) / DAY_MS;
    const ramp = Math.min(1, Math.max(0, (dayIndex - degradationStartDay) / MOCK_RAMP_DAYS));
    const noise = 1 + MOCK_NOISE_AMPLITUDE * (random() * 2 - 1);
    const measured = expected.power_kw * noise * (1 + ramp * (degradationPct / 100));

    return {
      measured_at: o.captured_at,
      power_kw: measured,
      expected_power_kw: expected.power_kw,
      setpoint_c: expected.adjusted_temp_c,
      outside_temp_c: weather.tempC,
      humidity_pct: weather.humidityPct,
      people_count: o.people_count,
      capacity_constrained: false,
      source: "mock" as const,
    };
  });
}
