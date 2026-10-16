import type { MaintenanceEvaluation } from '../../lib/maintenanceApi';

export type StatusKey = 'healthy' | 'watch' | 'warning' | 'critical' | 'insufficient';

export const STATUS_STYLE: Record<StatusKey, { icon: string; chip: string }> = {
  healthy: { icon: 'check_circle', chip: 'bg-surface-container-low text-success' },
  watch: { icon: 'visibility', chip: 'bg-warning-container text-on-warning-container' },
  warning: { icon: 'cleaning_services', chip: 'bg-warning-container text-on-warning-container' },
  critical: { icon: 'error', chip: 'bg-error-container text-on-error-container' },
  insufficient: { icon: 'hourglass_empty', chip: 'bg-surface-container-low text-on-surface-variant' },
};

// Lower number comes first in a list.
const ORDER: Record<StatusKey, number> = { critical: 0, warning: 1, watch: 2, insufficient: 3, healthy: 4 };

export function statusKey(e: MaintenanceEvaluation): StatusKey {
  if (e.status === 'insufficient_data') return 'insufficient';
  return e.severity ?? 'healthy';
}

export function needsAttention(e: MaintenanceEvaluation): boolean {
  const k = statusKey(e);
  return k === 'watch' || k === 'warning' || k === 'critical';
}

export function compareByStatus(a: MaintenanceEvaluation, b: MaintenanceEvaluation): number {
  return ORDER[statusKey(a)] - ORDER[statusKey(b)] || (b.excess_pct ?? 0) - (a.excess_pct ?? 0);
}
