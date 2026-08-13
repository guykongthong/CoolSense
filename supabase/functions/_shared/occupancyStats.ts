export interface OccupancyPeak {
  people_count: number;
  captured_at: string | null;
}

/**
 * Highest people_count among readings, with the timestamp it happened at.
 * Ties keep the earliest occurrence (first max found, since input is
 * expected oldest-or-newest-first from a DB query either way — this just
 * needs *a* correct peak, not a specific tie-break policy). Empty input is
 * a valid "no readings yet today" case, not an error.
 */
export function findPeakOccupancy(readings: { people_count: number; captured_at: string }[]): OccupancyPeak {
  if (readings.length === 0) return { people_count: 0, captured_at: null };
  return readings.reduce<OccupancyPeak>(
    (peak, r) => (r.people_count > peak.people_count ? { people_count: r.people_count, captured_at: r.captured_at } : peak),
    { people_count: readings[0].people_count, captured_at: readings[0].captured_at },
  );
}

/**
 * Start of the current UTC calendar day. Occupancy readings don't carry a
 * timezone/location-aware "local today" concept yet (room_config.location is
 * free-text, not a tz), so "today" here means the UTC calendar day — a
 * documented simplification, not a bug, until per-room timezone support
 * exists. `now` is injectable for deterministic tests.
 */
export function getUtcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
