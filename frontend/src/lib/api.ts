import { supabase } from './supabaseClient';

export type RoomSize = 'small' | 'medium' | 'large';
export type AcMode = 'eco' | 'moderate' | 'full';
export type ComfortPreference = 'cold' | 'neutral' | 'warm';
export type EgatLabel = '1' | '2' | '3' | '4' | '5' | 'premium';
export type WeatherCondition = 'hot' | 'warm' | 'cool' | 'diurnal';

export const ROOM_SIZE_SQM_RANGES: Record<RoomSize, string> = {
  small: '50-150 m²',
  medium: '150-400 m²',
  large: '400+ m²',
};

export interface RoomConfig {
  id: number;
  building_name: string;
  room_size: RoomSize;
  location: string;
  ac_seer: number;
  egat_label: EgatLabel | null;
  comfort_preference: ComfortPreference;
  updated_at: string;
}

export interface RoomConfigUpdate {
  building_name?: string;
  room_size?: RoomSize;
  location?: string;
  ac_seer?: number;
  egat_label?: EgatLabel | null;
  comfort_preference?: ComfortPreference;
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
}

export interface SimulationListItem {
  id: string;
  duration_hours: number;
  pct_reduction: number;
  current_energy_kwh: number;
  smart_energy_kwh: number;
  created_at: string;
}

async function invoke<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(path, {
    method: options.method ?? 'POST',
    body: options.body,
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

export function postOccupancyReading(peopleCount: number, source = 'manual'): Promise<OccupancyReading> {
  return invoke('occupancy-readings', { method: 'POST', body: { people_count: peopleCount, source } });
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

export function runSimulation(
  durationHours: number,
  roomSize: RoomSize,
  acSeer: number,
  weatherCondition: WeatherCondition,
): Promise<SimulationRunResult> {
  return invoke('simulation/run', {
    method: 'POST',
    body: { duration_hours: durationHours, room_size: roomSize, ac_seer: acSeer, weather_condition: weatherCondition },
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
