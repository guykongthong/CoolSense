import { supabase } from './supabaseClient';
import { isDemoMode } from './mock/mode';
import { mockBreakdownRows, mockCalcRows } from './mock/api';
import {
  type DateRange,
  getSimulationHourlyData,
  listSimulations,
  rangeStart,
  type SimulationListItem,
} from './api';

// Thailand grid factor. Mirrors CO2_PER_KWH in supabase/functions/_shared/simulation.ts.
export const CO2_KG_PER_KWH = 0.5;

// A row's power draw is assumed to hold until the next row arrives, but not
// longer than this, so a gap in readings is not counted as running time.
export const MAX_GAP_MIN = 60;

const MS_PER_MIN = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const PAGE_SIZE = 1000;

export interface CarbonPoint {
  bucket: number;
  actualKg: number;
  baselineKg: number;
  savedKg: number;
  cumulativeSavedKg: number;
}

export interface CarbonTotals {
  actualKg: number;
  baselineKg: number;
  savedKg: number;
  pctReduction: number;
  rowsUsed: number;
  rowsExcluded: number;
}

export interface CarbonHistory {
  points: CarbonPoint[];
  totals: CarbonTotals;
}

interface CalcRow {
  power_kw: number | null;
  baseline_power_kw: number | null;
  calculated_at: string;
}

export interface Interval {
  start: number;
  end: number;
  actualKw: number;
  baselineKw: number;
}

export interface KwhBucket {
  actualKwh: number;
  baselineKwh: number;
}

// Turns irregular rows into step-function intervals: each row holds its
// power until the next row's timestamp, capped at MAX_GAP_MIN. The last row
// holds until `now` (also capped). Rows with no baseline are skipped.
export function buildIntervals(rows: CalcRow[], now: number): { intervals: Interval[]; excluded: number } {
  const intervals: Interval[] = [];
  let excluded = 0;
  const capMs = MAX_GAP_MIN * MS_PER_MIN;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.baseline_power_kw === null || row.baseline_power_kw === undefined || row.power_kw === null) {
      excluded += 1;
      continue;
    }
    const start = new Date(row.calculated_at).getTime();
    const nextStart = i + 1 < rows.length ? new Date(rows[i + 1].calculated_at).getTime() : now;
    const end = Math.min(nextStart, start + capMs, now);
    if (end <= start) continue;
    intervals.push({
      start,
      end,
      actualKw: Number(row.power_kw),
      baselineKw: Number(row.baseline_power_kw),
    });
  }
  return { intervals, excluded };
}

// Adds each interval's energy to the buckets it overlaps, splitting it at
// bucket boundaries.
export function integrateKwh(
  intervals: Interval[],
  rangeStartMs: number,
  bucketMs: number,
  bucketCount: number,
): KwhBucket[] {
  const buckets: KwhBucket[] = Array.from({ length: bucketCount }, () => ({ actualKwh: 0, baselineKwh: 0 }));
  const rangeEndMs = rangeStartMs + bucketMs * bucketCount;
  for (const iv of intervals) {
    let cursor = Math.max(iv.start, rangeStartMs);
    const end = Math.min(iv.end, rangeEndMs);
    while (cursor < end) {
      const idx = Math.floor((cursor - rangeStartMs) / bucketMs);
      const bucketEnd = rangeStartMs + (idx + 1) * bucketMs;
      const sliceEnd = Math.min(end, bucketEnd);
      const hours = (sliceEnd - cursor) / MS_PER_HOUR;
      buckets[idx].actualKwh += iv.actualKw * hours;
      buckets[idx].baselineKwh += iv.baselineKw * hours;
      cursor = sliceEnd;
    }
  }
  return buckets;
}

async function fetchRows(from: Date, floorId?: string): Promise<CalcRow[]> {
  if (isDemoMode) return mockCalcRows(from, floorId);
  const rows: CalcRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('ac_calculations')
      .select('power_kw, baseline_power_kw, calculated_at')
      .gte('calculated_at', from.toISOString())
      .order('calculated_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as CalcRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

// floorId only matters in demo mode, the real backend has a single room.
export async function getCarbonHistory(range: DateRange, floorId?: string): Promise<CarbonHistory> {
  const start = rangeStart(range);
  const now = Date.now();
  // Pull one extra gap-length before the range so a row just before
  // midnight still contributes to the first bucket.
  const rows = await fetchRows(new Date(start.getTime() - MAX_GAP_MIN * MS_PER_MIN), floorId);
  const { intervals, excluded } = buildIntervals(rows, now);

  const bucketMs = range === 'today' ? MS_PER_HOUR : MS_PER_DAY;
  const bucketCount = range === 'today' ? 24 : range === '7d' ? 7 : 30;
  const kwh = integrateKwh(intervals, start.getTime(), bucketMs, bucketCount);

  let cumulative = 0;
  let actualKg = 0;
  let baselineKg = 0;
  const points = kwh.map((b, bucket) => {
    const a = b.actualKwh * CO2_KG_PER_KWH;
    const base = b.baselineKwh * CO2_KG_PER_KWH;
    const saved = base - a;
    cumulative += saved;
    actualKg += a;
    baselineKg += base;
    return { bucket, actualKg: a, baselineKg: base, savedKg: saved, cumulativeSavedKg: cumulative };
  });

  const savedKg = baselineKg - actualKg;
  return {
    points,
    totals: {
      actualKg,
      baselineKg,
      savedKg,
      pctReduction: baselineKg > 0 ? (savedKg / baselineKg) * 100 : 0,
      rowsUsed: intervals.length,
      rowsExcluded: excluded,
    },
  };
}

export interface SimulationCarbonPoint {
  hour_index: number;
  staticKg: number;
  coolsenseKg: number;
  savedKg: number;
}

export interface SimulationCarbon {
  run: SimulationListItem;
  points: SimulationCarbonPoint[];
}

export async function getLatestSimulationCarbon(floorId?: string): Promise<SimulationCarbon | null> {
  const runs = await listSimulations(floorId);
  if (runs.length === 0) return null;
  const run = runs[0];
  const hourly = await getSimulationHourlyData(run.id);
  if (hourly.length === 0) return null;
  return {
    run,
    points: hourly.map((h) => ({
      hour_index: h.hour_index,
      staticKg: h.static_v3_cumulative_co2,
      coolsenseKg: h.coolsense_v3_cumulative_co2,
      savedKg: h.static_v3_cumulative_co2 - h.coolsense_v3_cumulative_co2,
    })),
  };
}

// ---- Demo-only breakdown: one entry per floor (all floors) or per room (one floor) ----

export interface UsageBreakdownItem {
  id: string;
  kind: 'floor' | 'room';
  actualKwh: number;
  baselineKwh: number;
  savedKwh: number;
  savedKg: number;
}

export async function getUsageBreakdown(range: DateRange, floorId?: string): Promise<UsageBreakdownItem[]> {
  if (!isDemoMode) return [];
  const start = rangeStart(range);
  const now = Date.now();
  const groups = mockBreakdownRows(new Date(start.getTime() - MAX_GAP_MIN * MS_PER_MIN), floorId);
  const spanMs = (range === 'today' ? MS_PER_DAY : range === '7d' ? 7 * MS_PER_DAY : 30 * MS_PER_DAY) + MS_PER_HOUR;
  return groups.map((g) => {
    const { intervals } = buildIntervals(g.rows, now);
    const [total] = integrateKwh(intervals, start.getTime(), spanMs, 1);
    const saved = total.baselineKwh - total.actualKwh;
    return {
      id: g.id,
      kind: g.kind,
      actualKwh: total.actualKwh,
      baselineKwh: total.baselineKwh,
      savedKwh: saved,
      savedKg: saved * CO2_KG_PER_KWH,
    };
  });
}
