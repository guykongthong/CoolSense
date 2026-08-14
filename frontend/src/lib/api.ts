import { supabase } from './supabaseClient';

export type RoomSize = 'small' | 'medium' | 'large';
export type AcMode = 'eco' | 'moderate' | 'full';
export type ComfortPreference = 'cold' | 'neutral' | 'warm';
export type EgatLabel = '1' | '2' | '3' | '4' | '5' | 'premium';
export type WeatherCondition = 'hot' | 'warm' | 'cool' | 'diurnal';

// Mirrors supabase/functions/_shared/acCalculation.ts's ROOM_SIZE_SQM_RANGES
// — keep in sync if that changes (no shared build between frontend/functions).
export const ROOM_SIZE_SQM_RANGES: Record<RoomSize, string> = {
  small: '20-40 m²',
  medium: '40-80 m²',
  large: '80+ m²',
};

export interface RoomConfig {
  id: number;
  building_name: string;
  room_size: RoomSize;
  location: string;
  ac_seer: number;
  egat_label: EgatLabel | null;
  comfort_preference: ComfortPreference;
  rated_capacity_btu_per_hr: number | null;
  updated_at: string;
}

export interface RoomConfigUpdate {
  building_name?: string;
  room_size?: RoomSize;
  location?: string;
  ac_seer?: number;
  egat_label?: EgatLabel | null;
  comfort_preference?: ComfortPreference;
  rated_capacity_btu_per_hr?: number | null;
}

export interface OccupancyReading {
  id: string;
  people_count: number;
  source: string;
  captured_at: string;
}

export interface WeatherReading {
  id: string;
  location: string;
  temp_c: number;
  humidity_pct: number;
  condition: string;
  condition_icon_url: string | null;
  fetched_at: string;
}

// /calculation always computes + inserts fresh off current DB state, so this
// doubles as both "the result of a calculation" and "the current recommended
// AC settings" — there's no separate read-only endpoint for the latter.
export interface AcCalculation {
  id?: string;
  occupancy_reading_id: string | null;
  weather_reading_id: string | null;
  weather: 'hot' | 'warm' | 'cool';
  outside_temp_c: number;
  humidity_pct: number;
  weather_condition_icon_url: string | null;
  ac_mode: AcMode;
  temperature_c: number;
  base_temp_c: number;
  comfort_preference: ComfortPreference;
  fan_speed: number;
  power_kw: number;
  btu_per_hr: number;
  capacity_constrained: boolean;
  calculated_at?: string;
}

export interface GenerateMockDataResult {
  occupancy_reading_ids: string[];
  room_size: RoomSize;
  duration_hours: number;
  summary: {
    avg_people_count: number;
    min_people_count: number;
    max_people_count: number;
    weekday_avg_people_count: number;
    weekend_avg_people_count: number;
  };
}

export interface SimulationSummary {
  duration_hours: number;
  current_energy_kwh: number;
  smart_energy_kwh: number;
  current_co2_kg: number;
  smart_co2_kg: number;
  current_cost_baht: number;
  smart_cost_baht: number;
  pct_reduction: number;
  static_v3_energy_kwh: number;
  coolsense_v3_energy_kwh: number;
  static_v3_co2_kg: number;
  coolsense_v3_co2_kg: number;
  static_v3_cost_baht: number;
  coolsense_v3_cost_baht: number;
  v3_pct_reduction: number;
  app_energy_kwh: number;
  net_energy_saved_kwh: number;
  net_co2_saved_kg: number;
  net_cost_saved_baht: number;
}

export interface SimulationRunResult {
  simulation_run_id: string;
  summary: SimulationSummary;
}

export interface SimulationRun extends SimulationSummary {
  id: string;
  created_at: string;
}

export interface SimulationHourlyRow {
  id: string;
  simulation_run_id: string;
  hour_index: number;
  current_power_kw: number;
  smart_power_kw: number;
  current_cumulative_kwh: number;
  smart_cumulative_kwh: number;
  current_cumulative_co2: number;
  smart_cumulative_co2: number;
  static_v3_power_kw: number;
  coolsense_v3_power_kw: number;
  static_v3_cumulative_kwh: number;
  coolsense_v3_cumulative_kwh: number;
  static_v3_cumulative_co2: number;
  coolsense_v3_cumulative_co2: number;
  static_v3_temperature_c: number;
  coolsense_v3_temperature_c: number;
}

export interface SimulationListItem {
  id: string;
  duration_hours: number;
  pct_reduction: number;
  current_energy_kwh: number;
  smart_energy_kwh: number;
  created_at: string;
}

async function invoke<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: object } = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(path, {
    method: options.method ?? 'POST',
    body: options.body as Record<string, unknown> | undefined,
  });
  if (error) throw error;
  return data as T;
}

export function getRoomConfig(): Promise<RoomConfig> {
  return invoke('room-config', { method: 'GET' });
}

export function updateRoomConfig(update: RoomConfigUpdate): Promise<RoomConfig> {
  return invoke('room-config', { method: 'PUT', body: update });
}

export function getOccupancy(): Promise<OccupancyReading> {
  return invoke('occupancy', { method: 'GET' });
}

export interface OccupancyPeak {
  people_count: number;
  captured_at: string | null;
}

export function getPeakOccupancyToday(): Promise<OccupancyPeak> {
  return invoke('occupancy/peak-today', { method: 'GET' });
}

export function postOccupancyReading(peopleCount: number, source = 'manual'): Promise<OccupancyReading> {
  return invoke('occupancy-readings', { method: 'POST', body: { people_count: peopleCount, source } });
}

export interface OccupancyVisionResult {
  people_count: number;
  reading: OccupancyReading;
}

export function postOccupancyPhoto(imageBase64: string, mimeType: string): Promise<OccupancyVisionResult> {
  return invoke('occupancy-vision', { method: 'POST', body: { image_base64: imageBase64, mime_type: mimeType } });
}

export function fetchWeather(): Promise<WeatherReading> {
  return invoke('weather', { method: 'POST' });
}

export function getCalculation(): Promise<AcCalculation> {
  return invoke('calculation', { method: 'GET' });
}

export function generateMockData(durationHours: number, roomSize: RoomSize): Promise<GenerateMockDataResult> {
  return invoke('simulation/generate-mock-data', { method: 'POST', body: { duration_hours: durationHours, room_size: roomSize } });
}

export interface OperatingHoursSchedule {
  startHour: number;
  endHour: number;
}

export function runSimulation(
  durationHours: number,
  roomSize: RoomSize,
  acSeer: number,
  weatherCondition: WeatherCondition,
  schedule?: OperatingHoursSchedule,
  staticTempC?: number,
): Promise<SimulationRunResult> {
  return invoke('simulation/run', {
    method: 'POST',
    body: {
      duration_hours: durationHours,
      room_size: roomSize,
      ac_seer: acSeer,
      weather_condition: weatherCondition,
      ...(schedule ? { schedule_start_hour: schedule.startHour, schedule_end_hour: schedule.endHour } : {}),
      ...(staticTempC !== undefined ? { static_temp_c: staticTempC } : {}),
    },
  });
}

export function getSimulationRun(id: string): Promise<SimulationRun> {
  return invoke(`simulation/${id}`, { method: 'GET' });
}

export function getSimulationHourlyData(id: string): Promise<SimulationHourlyRow[]> {
  return invoke(`simulation/${id}/hourly-data`, { method: 'GET' });
}

export function listSimulations(): Promise<SimulationListItem[]> {
  return invoke('simulation/list', { method: 'GET' });
}

// ---- Analytics history (direct table reads against occupancy_readings/
// ac_calculations — anon has SELECT-only RLS policies on both, see
// 20260813100000_enable_rls_with_read_policies.sql; no dedicated history
// endpoint exists yet, see CLAUDE.md) ----

export type DateRange = 'today' | '7d' | '30d';

export interface HistoryPoint {
  bucket: number;
  value: number;
}

// "Today" buckets by 1-minute slice instead of by hour — camera readings
// arrive every ~5s, so hourly (or even 15-minute) buckets flattened out
// most of that detail into a near-static line. 1440 buckets/day still
// renders fine (LineAreaChart is a handful of SVG polylines) and matches
// the 30s poll interval closely enough that new readings show up promptly.
export const TODAY_BUCKET_MINUTES = 1;

export function rangeStart(range: DateRange): Date {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  const days = range === '7d' ? 7 : 30;
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  return start;
}

function bucketCountFor(range: DateRange): number {
  return range === 'today' ? (24 * 60) / TODAY_BUCKET_MINUTES : range === '7d' ? 7 : 30;
}

function bucketIndexFor(timestamp: string, range: DateRange, start: Date): number {
  const ts = new Date(timestamp);
  if (range === 'today') return Math.floor((ts.getHours() * 60 + ts.getMinutes()) / TODAY_BUCKET_MINUTES);
  return Math.floor((ts.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

// Aggregates raw (timestamp, value) rows into evenly-spaced buckets — one
// per hour-of-day for "today", one per calendar day for "7d"/"30d" — so the
// chart's x-axis stays evenly spaced regardless of how sparse or dense the
// underlying readings are (there's no automatic polling yet, only
// on-demand writes — see CLAUDE.md). Buckets with no readings default to 0
// rather than a fabricated/interpolated value.
//
// `aggregate` defaults to 'avg' (right for continuous quantities like power/
// temperature). People-count uses 'max': camera readings arrive every ~5s
// and a room's occupancy can spike briefly (e.g. 30+ people) then drop back
// to 0 between detections within the same 15-minute bucket — averaging that
// window flattens a real 30-person spike down to single digits, which reads
// as the y-axis being "capped" when it's actually the aggregation hiding
// the peak. Peak-per-bucket is also the more useful number for an occupancy
// chart anyway (what's the most people this room had, not the mean).
function bucketize(
  rows: { timestamp: string; value: number }[],
  range: DateRange,
  aggregate: 'avg' | 'max' = 'avg',
): HistoryPoint[] {
  const start = rangeStart(range);
  const count = bucketCountFor(range);
  const buckets = new Map<number, { sum: number; n: number; max: number }>();

  for (const row of rows) {
    const idx = bucketIndexFor(row.timestamp, range, start);
    if (idx < 0 || idx >= count) continue;
    const existing = buckets.get(idx);
    if (existing) {
      existing.sum += row.value;
      existing.n += 1;
      existing.max = Math.max(existing.max, row.value);
    } else {
      buckets.set(idx, { sum: row.value, n: 1, max: row.value });
    }
  }

  return Array.from({ length: count }, (_, i) => {
    const bucket = buckets.get(i);
    if (!bucket) return { bucket: i, value: 0 };
    return { bucket: i, value: aggregate === 'max' ? bucket.max : bucket.sum / bucket.n };
  });
}

export async function getPeopleHistory(range: DateRange): Promise<HistoryPoint[]> {
  const { data, error } = await supabase
    .from('occupancy_readings')
    .select('people_count, captured_at')
    .neq('source', 'mock')
    .gte('captured_at', rangeStart(range).toISOString())
    .order('captured_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).map((r: { people_count: number; captured_at: string }) => ({
    timestamp: r.captured_at,
    value: r.people_count,
  }));
  return bucketize(rows, range, 'max');
}

export async function getElectricHistory(range: DateRange): Promise<HistoryPoint[]> {
  const { data, error } = await supabase
    .from('ac_calculations')
    .select('power_kw, calculated_at')
    .gte('calculated_at', rangeStart(range).toISOString())
    .order('calculated_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).map((r: { power_kw: number; calculated_at: string }) => ({
    timestamp: r.calculated_at,
    value: r.power_kw,
  }));
  return bucketize(rows, range);
}

export async function getTemperatureHistory(range: DateRange): Promise<HistoryPoint[]> {
  const { data, error } = await supabase
    .from('ac_calculations')
    .select('temperature_c, calculated_at')
    .gte('calculated_at', rangeStart(range).toISOString())
    .order('calculated_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).map((r: { temperature_c: number; calculated_at: string }) => ({
    timestamp: r.calculated_at,
    value: r.temperature_c,
  }));
  return bucketize(rows, range);
}
