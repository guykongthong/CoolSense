import { supabase } from './supabaseClient';
import { isDemoMode } from './mock/mode';
import * as mock from './mock/maintenance';

export type MaintenanceSeverity = 'watch' | 'warning' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'dismissed' | 'resolved';
export type DetectionStatus = 'insufficient_data' | 'healthy' | 'degraded';

export interface WorstBucket {
  setpoint_c: number;
  outside_temp_min_c: number;
  outside_temp_max_c: number;
  baseline_samples: number;
  recent_samples: number;
  excess_pct: number;
}

export interface MaintenanceAlert {
  id: string;
  // Demo mode only, the real backend tracks a single unit.
  unit_id?: string;
  room_id?: string;
  created_at: string;
  updated_at: string;
  severity: MaintenanceSeverity;
  status: AlertStatus;
  excess_pct: number;
  baseline_ratio: number | null;
  recent_ratio: number | null;
  buckets_evaluated: number;
  worst_bucket: WorstBucket | null;
  window_start: string | null;
  window_end: string | null;
  acknowledged_at: string | null;
  dismissed_at: string | null;
  resolved_at: string | null;
  note: string | null;
}

export interface MaintenanceEvaluation {
  status: DetectionStatus;
  severity: MaintenanceSeverity | null;
  excess_pct: number | null;
  baseline_ratio: number | null;
  recent_ratio: number | null;
  buckets_evaluated: number;
  worst_bucket: WorstBucket | null;
  baseline_days: number;
  recent_samples: number;
  readings_count: number;
  history_days: number;
  demo_data: boolean;
  last_serviced_at: string | null;
  reason?: string;
}

export interface EvaluateResult {
  evaluation: MaintenanceEvaluation;
  alert: MaintenanceAlert | null;
}

export interface TrendPoint {
  date: string;
  actual_kwh: number;
  expected_baseline_kwh: number;
  ratio: number | null;
}

export interface TrendResult {
  baseline_ratio: number | null;
  points: TrendPoint[];
}

async function invoke<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH'; body?: object } = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(path, {
    method: options.method ?? 'POST',
    body: options.body as Record<string, unknown> | undefined,
  });
  if (error) throw error;
  return data as T;
}

// floorId / unitId (here and below) only matter in demo mode.
export function evaluateMaintenance(floorId?: string): Promise<EvaluateResult> {
  if (isDemoMode) return Promise.resolve(mock.mockEvaluate(floorId));
  return invoke('maintenance/evaluate');
}

export function listMaintenanceAlerts(status?: AlertStatus, floorId?: string): Promise<MaintenanceAlert[]> {
  if (isDemoMode) return Promise.resolve(mock.mockListAlerts(status, floorId));
  const query = status ? `?status=${status}` : '';
  return invoke(`maintenance/alerts${query}`, { method: 'GET' });
}

export function getMaintenanceTrend(days = 30, unitId?: string): Promise<TrendResult> {
  if (isDemoMode) return Promise.resolve(mock.mockTrend(days, unitId));
  return invoke(`maintenance/trend?days=${days}`, { method: 'GET' });
}

export function updateMaintenanceAlert(
  id: string,
  status: 'acknowledged' | 'dismissed',
  note?: string,
): Promise<MaintenanceAlert> {
  if (isDemoMode) return Promise.resolve(mock.mockUpdateAlert(id, status, note));
  return invoke(`maintenance/alerts/${id}`, { method: 'PATCH', body: { status, note } });
}

export function markServiced(unitId?: string): Promise<{ last_serviced_at: string; resolved_alerts: number }> {
  if (isDemoMode) return Promise.resolve(mock.mockMarkServiced(unitId));
  return invoke('maintenance/mark-serviced');
}

export function generateMaintenanceDemoData(): Promise<{ readings_inserted: number }> {
  if (isDemoMode) return Promise.resolve(mock.mockGenerateDemoData());
  return invoke('maintenance/generate-mock-data', { body: {} });
}

export type UnitEvaluation = mock.UnitEvaluation;

// Demo mode: one evaluation per unit in the selected room (or all rooms).
// The real backend has a single unit, so there is nothing to list.
export function evaluateMaintenanceUnits(floorId?: string): Promise<UnitEvaluation[]> {
  if (isDemoMode) return Promise.resolve(mock.mockEvaluateUnits(floorId));
  return Promise.resolve([]);
}
