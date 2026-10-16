import type {
  AlertStatus,
  EvaluateResult,
  MaintenanceAlert,
  MaintenanceEvaluation,
  MaintenanceSeverity,
  TrendPoint,
  TrendResult,
} from '../maintenanceApi';
import { isoAt, round, seededRandom } from './model';
import { ALL_FLOORS, findUnit, unitsInScope, type DemoRoom, type DemoUnit } from './rooms';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEMO_READINGS = 2880;
const BASELINE_RATIO = 0.99;

// Demo scenario: most units are fine. Open Office North unit 2 has not been
// cleaned for months and has drifted about 24% above its own normal draw,
// Meeting Room A unit 1 is slightly up (about 12%).
const SCENARIOS: Record<string, { excess: number; severity: MaintenanceSeverity }> = {
  'north-2': { excess: 24, severity: 'warning' },
  'meeting-1': { excess: 12, severity: 'watch' },
};

const SEVERITY_RANK = { watch: 1, warning: 2, critical: 3 } as const;

interface UnitState {
  serviced: boolean;
  lastServicedAt: string;
  excess: number;
  severity: MaintenanceSeverity | null;
}

export interface UnitEvaluation {
  unit_id: string;
  room_id: string;
  evaluation: MaintenanceEvaluation;
}

function hash(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const states = new Map<string, UnitState>();

function stateOf(unitId: string): UnitState {
  let state = states.get(unitId);
  if (!state) {
    const scenario = SCENARIOS[unitId];
    const daysAgo = scenario ? 119 : 30 + (hash(unitId) % 40);
    state = {
      serviced: false,
      lastServicedAt: isoAt(Date.now() - daysAgo * MS_PER_DAY),
      excess: scenario ? scenario.excess : 1 + (hash(unitId) % 3),
      severity: scenario ? scenario.severity : null,
    };
    states.set(unitId, state);
  }
  return state;
}

function currentExcess(state: UnitState): number {
  return state.serviced ? 2 : state.excess;
}

function currentSeverity(state: UnitState): MaintenanceSeverity | null {
  return state.serviced ? null : state.severity;
}

let alertCounter = 0;
let alerts: MaintenanceAlert[] = [];

function worstBucket(excess: number) {
  return {
    setpoint_c: 24,
    outside_temp_min_c: 30,
    outside_temp_max_c: 32,
    baseline_samples: 412,
    recent_samples: 96,
    excess_pct: excess,
  };
}

function newAlert(room: DemoRoom, unit: DemoUnit, state: UnitState): MaintenanceAlert {
  const now = Date.now();
  alertCounter += 1;
  const excess = state.excess;
  return {
    id: `demo-alert-${alertCounter}`,
    unit_id: unit.id,
    room_id: room.id,
    created_at: isoAt(now - 3 * 60 * 60 * 1000),
    updated_at: isoAt(now - 3 * 60 * 60 * 1000),
    severity: state.severity ?? 'warning',
    status: 'open',
    excess_pct: excess,
    baseline_ratio: BASELINE_RATIO,
    recent_ratio: round(1 + excess / 100, 2),
    buckets_evaluated: 4,
    worst_bucket: worstBucket(excess),
    window_start: isoAt(now - 14 * MS_PER_DAY),
    window_end: isoAt(now),
    acknowledged_at: null,
    dismissed_at: null,
    resolved_at: null,
    note: null,
  };
}

function seedAlerts() {
  const now = Date.now();
  alerts = [];
  for (const id of Object.keys(SCENARIOS)) {
    const found = findUnit(id);
    if (found) alerts.push(newAlert(found.room, found.unit, stateOf(id)));
  }
  const north = findUnit('north-2');
  if (north) {
    alertCounter += 1;
    alerts.push({
      id: `demo-alert-${alertCounter}`,
      unit_id: north.unit.id,
      room_id: north.room.id,
      created_at: isoAt(now - 121 * MS_PER_DAY),
      updated_at: isoAt(now - 119 * MS_PER_DAY),
      severity: 'watch',
      status: 'resolved',
      excess_pct: 12,
      baseline_ratio: 1.01,
      recent_ratio: 1.13,
      buckets_evaluated: 3,
      worst_bucket: { ...worstBucket(12), setpoint_c: 25 },
      window_start: isoAt(now - 135 * MS_PER_DAY),
      window_end: isoAt(now - 121 * MS_PER_DAY),
      acknowledged_at: null,
      dismissed_at: null,
      resolved_at: isoAt(now - 119 * MS_PER_DAY),
      note: null,
    });
  }
}

seedAlerts();

const isActive = (a: MaintenanceAlert) => a.status === 'open' || a.status === 'acknowledged';

// Alerts of units that were removed on the Information page are hidden.
function liveAlerts(): MaintenanceAlert[] {
  return alerts.filter((a) => !a.unit_id || findUnit(a.unit_id));
}

function evaluationFor(unitId: string): MaintenanceEvaluation {
  const state = stateOf(unitId);
  const excess = currentExcess(state);
  const severity = currentSeverity(state);
  const base = {
    buckets_evaluated: 4,
    baseline_days: 16,
    readings_count: DEMO_READINGS,
    history_days: 30,
    demo_data: true,
    last_serviced_at: state.lastServicedAt,
    baseline_ratio: BASELINE_RATIO,
    recent_samples: 96,
  };
  if (!severity) {
    return {
      ...base,
      status: 'healthy',
      severity: null,
      excess_pct: excess,
      recent_ratio: round(1 + excess / 100, 2),
      worst_bucket: null,
    };
  }
  return {
    ...base,
    status: 'degraded',
    severity,
    excess_pct: excess,
    recent_ratio: round(1 + excess / 100, 2),
    worst_bucket: worstBucket(excess),
  };
}

function evaluateUnit(room: DemoRoom, unit: DemoUnit): UnitEvaluation {
  const state = stateOf(unit.id);
  const evaluation = evaluationFor(unit.id);
  if (evaluation.status === 'degraded') {
    // Open an alert only if nothing is already tracking this episode.
    const tracked = alerts.some(
      (a) => a.unit_id === unit.id && a.created_at > state.lastServicedAt && a.status !== 'resolved',
    );
    if (!tracked) alerts.unshift(newAlert(room, unit, state));
  }
  return { unit_id: unit.id, room_id: room.id, evaluation };
}

export function mockUnitSeverity(unitId: string): MaintenanceSeverity | null {
  return currentSeverity(stateOf(unitId));
}

export function mockOpenAlertCount(): number {
  return liveAlerts().filter((a) => a.status === 'open').length;
}

export function mockEvaluateUnits(scope: string = ALL_FLOORS): UnitEvaluation[] {
  return unitsInScope(scope).map(({ room, unit }) => evaluateUnit(room, unit));
}

function severityScore(e: MaintenanceEvaluation): number {
  return e.severity ? SEVERITY_RANK[e.severity] : 0;
}

// The unit with the highest severity, then the largest excess.
export function worstUnit(list: UnitEvaluation[]): UnitEvaluation | undefined {
  return [...list].sort(
    (a, b) =>
      severityScore(b.evaluation) - severityScore(a.evaluation) ||
      (b.evaluation.excess_pct ?? 0) - (a.evaluation.excess_pct ?? 0),
  )[0];
}

export function mockEvaluate(scope: string = ALL_FLOORS): EvaluateResult {
  const list = mockEvaluateUnits(scope);
  const worst = worstUnit(list);
  if (!worst) {
    // Cannot normally happen, every room keeps at least one unit.
    const fallback = evaluationFor('none');
    return { evaluation: fallback, alert: null };
  }
  const alert = liveAlerts().find((a) => a.unit_id === worst.unit_id && isActive(a)) ?? null;
  return { evaluation: worst.evaluation, alert };
}

export function mockListAlerts(status?: AlertStatus, scope: string = ALL_FLOORS): MaintenanceAlert[] {
  const ids = new Set(unitsInScope(scope).map((x) => x.unit.id));
  const list = liveAlerts().filter((a) => (!a.unit_id || ids.has(a.unit_id)) && (!status || a.status === status));
  return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function mockUpdateAlert(id: string, status: 'acknowledged' | 'dismissed', note?: string): MaintenanceAlert {
  const alert = alerts.find((a) => a.id === id);
  if (!alert) throw new Error('Alert not found');
  const now = isoAt(Date.now());
  alert.status = status;
  alert.updated_at = now;
  if (status === 'acknowledged') alert.acknowledged_at = now;
  else alert.dismissed_at = now;
  if (note) alert.note = note;
  return { ...alert };
}

// With a unit id only that unit is cleaned, without one every unit is.
export function mockMarkServiced(unitId?: string): { last_serviced_at: string; resolved_alerts: number } {
  const now = isoAt(Date.now());
  const ids = unitId ? [unitId] : unitsInScope(ALL_FLOORS).map((x) => x.unit.id);
  let resolved = 0;
  for (const id of ids) {
    for (const a of alerts) {
      if (a.unit_id !== id || !isActive(a)) continue;
      a.status = 'resolved';
      a.resolved_at = now;
      a.updated_at = now;
      resolved += 1;
    }
    const state = stateOf(id);
    state.serviced = true;
    state.lastServicedAt = now;
  }
  return { last_serviced_at: now, resolved_alerts: resolved };
}

export function mockGenerateDemoData(): { readings_inserted: number } {
  states.clear();
  seedAlerts();
  return { readings_inserted: DEMO_READINGS };
}

function localDate(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Daily kWh for one unit. Without an id this is the unit with the most
// drift, which keeps older callers working.
export function mockTrend(days: number, unitId?: string): TrendResult {
  let unit = unitId ? findUnit(unitId)?.unit : undefined;
  if (!unit) {
    const all = unitsInScope(ALL_FLOORS).map(({ room, unit: u }) => ({
      unit_id: u.id,
      room_id: room.id,
      evaluation: evaluationFor(u.id),
    }));
    const worst = worstUnit(all);
    unit = worst ? findUnit(worst.unit_id)?.unit : undefined;
  }
  const id = unit?.id ?? 'none';
  const state = stateOf(id);
  const seed = hash(id) % 1000;
  const size = (unit?.capacityBtu ?? 24000) / 24000;
  const finalDrift = currentExcessForTrend(state) / 100;

  const now = Date.now();
  const points: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const ms = now - (days - 1 - i) * MS_PER_DAY;
    const dow = new Date(ms).getDay();
    const dayNoise = seededRandom(Math.floor(ms / MS_PER_DAY) + 303 + seed);
    const expected = ((dow === 0 || dow === 6 ? 12.5 : 18) + (dayNoise - 0.5) * 2.4) * size;

    // Flat for the first half, then a steady climb over the last 14 days.
    const sinceDrift = i - (days - 15);
    const drift = state.serviced || sinceDrift <= 0 ? 0 : finalDrift * Math.pow(sinceDrift / 14, 1.15);
    const wobble = (seededRandom(Math.floor(ms / MS_PER_DAY) + 811 + seed) - 0.5) * 0.03;
    const ratio = 1 + drift + wobble;

    const baselineKwh = round(expected);
    const actualKwh = round(expected * ratio);
    points.push({
      date: localDate(ms),
      actual_kwh: actualKwh,
      expected_baseline_kwh: baselineKwh,
      ratio: round(actualKwh / baselineKwh, 3),
    });
  }
  return { baseline_ratio: BASELINE_RATIO, points };
}

// Healthy units only wobble, they do not climb.
function currentExcessForTrend(state: UnitState): number {
  return state.severity ? state.excess : 0;
}
