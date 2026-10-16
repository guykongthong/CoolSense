import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  decideAlertAction,
  detectDegradation,
  generateMockPowerReadings,
  type PowerReading,
} from "./maintenanceDetection.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date(2026, 9, 16, 12, 0, 0);

// Tiny seeded PRNG so noise is repeatable.
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface Options {
  days?: number;
  // Extra draw (fraction) as a function of how many days ago the hour was.
  extra?: (daysAgo: number) => number;
  constrained?: (daysAgo: number) => boolean;
  noise?: number;
}

// Hourly readings with a daily pattern of 4 setpoint/outside-temp combos, so
// there are several comparable buckets.
function build(opts: Options = {}): PowerReading[] {
  const days = opts.days ?? 60;
  const rand = seeded(7);
  const noise = opts.noise ?? 0.03;
  const out: PowerReading[] = [];
  for (let h = days * 24; h >= 0; h--) {
    const at = new Date(NOW.getTime() - h * HOUR_MS);
    const daysAgo = h / 24;
    const slot = at.getHours() % 4;
    const expected = 2 + slot * 0.5;
    const ratio = (1 + (rand() * 2 - 1) * noise) * (1 + (opts.extra?.(daysAgo) ?? 0));
    out.push({
      measured_at: at.toISOString(),
      power_kw: expected * ratio,
      expected_power_kw: expected,
      setpoint_c: 22 + slot,
      outside_temp_c: 28 + slot * 2,
      capacity_constrained: opts.constrained?.(daysAgo) ?? false,
    });
  }
  return out;
}

Deno.test("flat history is healthy", () => {
  const result = detectDegradation(build(), NOW, null);
  assertEquals(result.status, "healthy");
  assertEquals(result.severity, null);
  assert(Math.abs(result.excess_pct ?? 99) < 3);
});

Deno.test("a sustained +25% ramp raises a warning", () => {
  const result = detectDegradation(build({ extra: (d) => (d < 9 ? 0.25 : 0) }), NOW, null);
  assertEquals(result.status, "degraded");
  assertEquals(result.severity, "warning");
  assert((result.excess_pct ?? 0) > 20 && (result.excess_pct ?? 0) < 30);
  assert(result.worst_bucket !== null);
});

Deno.test("+40% maps to critical and +12% to watch", () => {
  assertEquals(detectDegradation(build({ extra: (d) => (d < 9 ? 0.4 : 0) }), NOW, null).severity, "critical");
  assertEquals(detectDegradation(build({ extra: (d) => (d < 9 ? 0.12 : 0) }), NOW, null).severity, "watch");
});

Deno.test("a single-day spike does not raise an alert", () => {
  const result = detectDegradation(build({ extra: (d) => (d > 1 && d < 2 ? 0.8 : 0) }), NOW, null);
  assertEquals(result.status, "healthy");
  assertEquals(result.severity, null);
});

Deno.test("less than 14 days of baseline is insufficient data", () => {
  const result = detectDegradation(build({ days: 20, extra: (d) => (d < 9 ? 0.3 : 0) }), NOW, null);
  assertEquals(result.status, "insufficient_data");
  assertEquals(result.severity, null);
});

Deno.test("capacity-constrained hours are ignored", () => {
  const readings = build({
    extra: (d) => (d < 9 ? 0.3 : 0),
    constrained: (d) => d < 9,
  });
  const result = detectDegradation(readings, NOW, null);
  assertEquals(result.status, "insufficient_data");
});

Deno.test("alerts clear once the unit has been serviced", () => {
  const readings = build({ extra: (d) => (d < 9 ? 0.3 : 0) });
  assertEquals(detectDegradation(readings, NOW, null).status, "degraded");
  const serviced = new Date(NOW.getTime() - 1 * DAY_MS);
  assertEquals(detectDegradation(readings, NOW, serviced).status, "insufficient_data");
});

Deno.test("fewer than 3 comparable buckets is insufficient data", () => {
  const readings = build({ extra: (d) => (d < 9 ? 0.3 : 0) }).filter((r) => r.setpoint_c < 24);
  const result = detectDegradation(readings, NOW, null);
  assertEquals(result.status, "insufficient_data");
  assert(result.buckets_evaluated < 3);
});

Deno.test("a mixed-direction change is not an alert", () => {
  // Two of four buckets run hot, two run cool.
  const readings = build().map((r) => {
    const daysAgo = (NOW.getTime() - new Date(r.measured_at).getTime()) / DAY_MS;
    if (daysAgo >= 7) return r;
    const factor = r.setpoint_c < 24 ? 1.3 : 0.8;
    return { ...r, power_kw: r.power_kw * factor };
  });
  assertEquals(detectDegradation(readings, NOW, null).severity, null);
});

Deno.test("decideAlertAction: creates, updates and resolves with hysteresis", () => {
  const degraded = detectDegradation(build({ extra: (d) => (d < 9 ? 0.25 : 0) }), NOW, null);
  assertEquals(decideAlertAction(degraded, null, null, NOW), { type: "create", severity: "warning" });
  const active = { id: "a1", severity: "warning" as const, status: "open" as const };
  assertEquals(decideAlertAction(degraded, active, null, NOW), { type: "update", id: "a1", severity: "warning" });

  const mid = { ...degraded, status: "healthy" as const, severity: null, excess_pct: 7 };
  assertEquals(decideAlertAction(mid, active, null, NOW), { type: "none" });
  const low = { ...mid, excess_pct: 4 };
  assertEquals(decideAlertAction(low, active, null, NOW), { type: "resolve", id: "a1" });
});

Deno.test("decideAlertAction: dismissed alert suppresses same severity but not escalation", () => {
  const degraded = detectDegradation(build({ extra: (d) => (d < 9 ? 0.25 : 0) }), NOW, null);
  const dismissed = { severity: "warning" as const, dismissed_at: new Date(NOW.getTime() - 2 * DAY_MS).toISOString() };
  assertEquals(decideAlertAction(degraded, null, dismissed, NOW), { type: "none" });

  const worse = { ...degraded, severity: "critical" as const };
  assertEquals(decideAlertAction(worse, null, dismissed, NOW), { type: "create", severity: "critical" });

  const old = { severity: "warning" as const, dismissed_at: new Date(NOW.getTime() - 9 * DAY_MS).toISOString() };
  assertEquals(decideAlertAction(degraded, null, old, NOW), { type: "create", severity: "warning" });
});

Deno.test("generateMockPowerReadings: hourly count, and degradation shows up in detection", () => {
  const readings = generateMockPowerReadings(60, 45, 25, NOW, seeded(11));
  assertEquals(readings.length, 60 * 24);
  assertEquals(readings[readings.length - 1].measured_at, NOW.toISOString());
  const result = detectDegradation(readings, NOW, null);
  assertEquals(result.status, "degraded");
  assert((result.excess_pct ?? 0) > 15);
});

Deno.test("generateMockPowerReadings: no degradation stays healthy", () => {
  const readings = generateMockPowerReadings(60, 45, 0, NOW, seeded(3));
  const result = detectDegradation(readings, NOW, null);
  assertEquals(result.status, "healthy");
});
