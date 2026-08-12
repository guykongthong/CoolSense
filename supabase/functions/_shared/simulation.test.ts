import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettings, getAcMode, type RoomSize } from "./acCalculation.ts";
import { CURRENT_SYSTEM_POWER_KW, generateMockOccupancy, getDiurnalWeather, runSimulation } from "./simulation.ts";

const noRandom = () => 0.5; // random()*2-1 = 0 → no noise
const minRandom = () => 0; // noise = -15%
const maxRandom = () => 1; // noise = +15%

// A fixed Monday 00:00 local time, so hour-of-day arithmetic is exact and
// day-of-week is deterministic across the whole 168-hour window.
const MONDAY_MIDNIGHT = new Date(2026, 7, 10, 0, 0, 0); // 2026-08-10 is a Monday
// End of that same Monday — anchor for 24-hour-window tests, so the window
// (now - 23h .. now) stays entirely within Monday instead of spilling into
// the preceding Sunday.
const MONDAY_23 = new Date(2026, 7, 10, 23, 0, 0);

Deno.test("generateMockOccupancy returns exactly durationHours readings", () => {
  const readings = generateMockOccupancy(168, "medium", { now: MONDAY_MIDNIGHT, random: noRandom });
  assertEquals(readings.length, 168);
});

Deno.test("generateMockOccupancy spaces readings exactly 1 hour apart, ending at `now`", () => {
  const readings = generateMockOccupancy(5, "medium", { now: MONDAY_MIDNIGHT, random: noRandom });
  assertEquals(readings[readings.length - 1].captured_at, MONDAY_MIDNIGHT.toISOString());
  for (let i = 1; i < readings.length; i++) {
    const gapMs = new Date(readings[i].captured_at).getTime() - new Date(readings[i - 1].captured_at).getTime();
    assertEquals(gapMs, 60 * 60 * 1000);
  }
});

Deno.test("generateMockOccupancy marks all readings as source 'mock'", () => {
  const readings = generateMockOccupancy(10, "medium", { now: MONDAY_MIDNIGHT, random: noRandom });
  assertEquals(readings.every((r) => r.source === "mock"), true);
});

Deno.test("generateMockOccupancy: weekday night hours are near-empty", () => {
  // Monday 03:00 (night) — hoursAgo puts it well within the first day.
  const readings = generateMockOccupancy(168, "medium", { now: MONDAY_MIDNIGHT, random: noRandom });
  const mondayThreeAm = readings.find((r) => new Date(r.captured_at).getHours() === 3 && new Date(r.captured_at).getDay() === 1);
  assertEquals(mondayThreeAm !== undefined, true);
  assertEquals(mondayThreeAm!.people_count <= 1, true);
});

Deno.test("generateMockOccupancy: weekday peak hours (medium room) land right at the full-mode threshold", () => {
  const readings = generateMockOccupancy(168, "medium", { now: MONDAY_MIDNIGHT, random: noRandom });
  const mondayNoon = readings.find((r) => new Date(r.captured_at).getHours() === 12 && new Date(r.captured_at).getDay() === 1);
  // PEAK_DENSITY == FULL_DENSITY (0.15) × 275 m² = 41.25 → 41 people —
  // just under the 42-person full threshold with zero noise, so ±15% noise
  // tips it into full or moderate roughly evenly across the week.
  assertEquals(mondayNoon!.people_count, 41);
});

Deno.test("generateMockOccupancy: room size scales peak occupancy proportionally", () => {
  const small = generateMockOccupancy(24, "small", { now: MONDAY_MIDNIGHT, random: noRandom });
  const medium = generateMockOccupancy(24, "medium", { now: MONDAY_MIDNIGHT, random: noRandom });
  const large = generateMockOccupancy(24, "large", { now: MONDAY_MIDNIGHT, random: noRandom });

  const peakOf = (readings: typeof small) => readings.find((r) => new Date(r.captured_at).getHours() === 12)!.people_count;

  const smallPeak = peakOf(small);
  const mediumPeak = peakOf(medium);
  const largePeak = peakOf(large);

  assertEquals(smallPeak < mediumPeak, true);
  assertEquals(mediumPeak < largePeak, true);
});

Deno.test("generateMockOccupancy: weekend daytime occupancy is ~40% of weekday peak density", () => {
  // Saturday is 5 days after the Monday anchor.
  const saturdayNoon = new Date(2026, 7, 15, 12, 0, 0);
  const readings = generateMockOccupancy(1, "medium", { now: saturdayNoon, random: noRandom });
  assertEquals(readings[0].people_count, 17); // WEEKEND_DENSITY (0.06) × 275 m² = 16.5 → 17
});

Deno.test("generateMockOccupancy: noise stays within ±15% of the base and is never negative", () => {
  const minReadings = generateMockOccupancy(24, "medium", { now: MONDAY_23, random: minRandom });
  const maxReadings = generateMockOccupancy(24, "medium", { now: MONDAY_23, random: maxRandom });
  const noonIndex = minReadings.findIndex((r) => new Date(r.captured_at).getHours() === 12);

  // Base is 41.25 (rounds to 41 with no noise); -15% → ~35.06 → rounds to 35, +15% → ~47.44 → rounds to 47.
  assertEquals(minReadings[noonIndex].people_count, 35);
  assertEquals(maxReadings[noonIndex].people_count, 47);
  assertEquals(minReadings.every((r) => r.people_count >= 0), true);
});

Deno.test("generateMockOccupancy: all people counts are non-negative integers", () => {
  const readings = generateMockOccupancy(48, "large", { now: MONDAY_MIDNIGHT, random: () => Math.random() });
  for (const r of readings) {
    assertEquals(Number.isInteger(r.people_count), true);
    assertEquals(r.people_count >= 0, true);
  }
});

Deno.test("runSimulation: current_energy_kwh is duration_hours × 4.5 regardless of occupancy", () => {
  const { summary } = runSimulation([0, 0, 20, 20, 0], "medium", 4.5, "warm");
  assertEquals(summary.current_energy_kwh, 5 * CURRENT_SYSTEM_POWER_KW);
});

Deno.test("runSimulation: smart hourly power matches calculateAcSettings for that hour", () => {
  const peopleCounts = [0, 5, 20];
  const { hourly } = runSimulation(peopleCounts, "medium", 4.5, "warm");
  peopleCounts.forEach((people, i) => {
    const expected = calculateAcSettings(people, "medium", 4.5, 33, 60); // "warm" preset == baseline
    assertEquals(hourly[i].smart_power_kw, expected.power_kw);
  });
});

Deno.test("runSimulation: cumulative sums are monotonic and match the summary totals at the last hour", () => {
  const { hourly, summary } = runSimulation([0, 5, 10, 20, 3], "medium", 4.5, "hot");
  for (let i = 1; i < hourly.length; i++) {
    assertEquals(hourly[i].current_cumulative_kwh >= hourly[i - 1].current_cumulative_kwh, true);
    assertEquals(hourly[i].smart_cumulative_kwh >= hourly[i - 1].smart_cumulative_kwh, true);
  }
  const last = hourly[hourly.length - 1];
  assertAlmostEquals(last.current_cumulative_kwh, summary.current_energy_kwh, 1e-9);
  assertAlmostEquals(last.smart_cumulative_kwh, summary.smart_energy_kwh, 1e-9);
});

Deno.test("runSimulation: CO2 and cost use the Thailand grid figures (0.5 kg/kWh, 5 baht/kWh)", () => {
  const { summary } = runSimulation([0, 0, 0], "medium", 4.5, "warm");
  assertEquals(summary.current_co2_kg, summary.current_energy_kwh * 0.5);
  assertEquals(summary.current_cost_baht, summary.current_energy_kwh * 5);
  assertEquals(summary.smart_co2_kg, summary.smart_energy_kwh * 0.5);
  assertEquals(summary.smart_cost_baht, summary.smart_energy_kwh * 5);
});

Deno.test("runSimulation: pct_reduction is positive whenever the smart system uses less energy", () => {
  const { summary } = runSimulation([0, 1, 2, 0, 1], "medium", 4.5, "warm");
  assertEquals(summary.smart_energy_kwh < summary.current_energy_kwh, true);
  assertEquals(summary.pct_reduction > 0, true);
  assertAlmostEquals(
    summary.pct_reduction,
    ((summary.current_energy_kwh - summary.smart_energy_kwh) / summary.current_energy_kwh) * 100,
    1e-9,
  );
});

Deno.test("runSimulation: hotter weather_condition raises smart power draw for the same occupancy", () => {
  const cool = runSimulation([20], "medium", 4.5, "cool");
  const warm = runSimulation([20], "medium", 4.5, "warm");
  const hot = runSimulation([20], "medium", 4.5, "hot");
  assertEquals(cool.summary.smart_energy_kwh < warm.summary.smart_energy_kwh, true);
  assertEquals(warm.summary.smart_energy_kwh < hot.summary.smart_energy_kwh, true);
});

Deno.test("regression: a full week's mock occupancy visits more than one AC mode, for every room size", () => {
  // Guards against the bug where peak occupancy was calibrated to an
  // absolute people-count scale instead of density — that left medium/large
  // rooms stuck in "eco" for the entire 168-hour simulation, with no
  // fluctuation in smart_power_kw at all.
  for (const roomSize of ["small", "medium", "large"] as RoomSize[]) {
    const readings = generateMockOccupancy(168, roomSize, { now: MONDAY_MIDNIGHT, random: noRandom });
    const modesSeen = new Set(readings.map((r) => getAcMode(r.people_count, roomSize)));
    assertEquals(modesSeen.size > 1, true, `${roomSize} room only ever reached mode(s): ${[...modesSeen]}`);
  }
});

Deno.test("runSimulation: empty input produces a zeroed-out summary, not a crash", () => {
  const { hourly, summary } = runSimulation([], "medium", 4.5, "warm");
  assertEquals(hourly.length, 0);
  assertEquals(summary.duration_hours, 0);
  assertEquals(summary.current_energy_kwh, 0);
  assertEquals(summary.pct_reduction, 0); // guarded against divide-by-zero
});

Deno.test("getDiurnalWeather: peak hour (3pm) matches the hot-midday anchor", () => {
  const w = getDiurnalWeather(new Date(2026, 7, 10, 15, 0, 0));
  assertAlmostEquals(w.tempC, 36, 1e-9);
  assertAlmostEquals(w.humidityPct, 80, 1e-9);
});

Deno.test("getDiurnalWeather: trough hour (3am) matches the cool-morning anchor", () => {
  const w = getDiurnalWeather(new Date(2026, 7, 10, 3, 0, 0));
  assertAlmostEquals(w.tempC, 27, 1e-9);
  assertAlmostEquals(w.humidityPct, 50, 1e-9);
});

Deno.test("getDiurnalWeather: stays within [trough, peak] across every hour of the day", () => {
  for (let hour = 0; hour < 24; hour++) {
    const w = getDiurnalWeather(new Date(2026, 7, 10, hour, 0, 0));
    assertEquals(w.tempC >= 27 && w.tempC <= 36, true, `hour ${hour} tempC=${w.tempC}`);
    assertEquals(w.humidityPct >= 50 && w.humidityPct <= 80, true, `hour ${hour} humidityPct=${w.humidityPct}`);
  }
});

Deno.test("runSimulation: diurnal weather requires capturedAt timestamps", () => {
  let threw = false;
  try {
    runSimulation([10], "medium", 4.5, "diurnal");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("runSimulation: diurnal weather varies smart_power_kw by time of day even at constant occupancy", () => {
  const peopleCounts = [40, 40]; // same occupancy both hours — only weather differs
  const capturedAt = [new Date(2026, 7, 10, 3, 0, 0), new Date(2026, 7, 10, 15, 0, 0)]; // trough, then peak
  const { hourly } = runSimulation(peopleCounts, "medium", 4.5, "diurnal", capturedAt);
  assertEquals(hourly[0].smart_power_kw < hourly[1].smart_power_kw, true);
});

Deno.test("runSimulation: diurnal weather at the exact peak/trough hours matches calculateAcSettings directly", () => {
  const peopleCounts = [40, 40];
  const capturedAt = [new Date(2026, 7, 10, 3, 0, 0), new Date(2026, 7, 10, 15, 0, 0)];
  const { hourly } = runSimulation(peopleCounts, "medium", 4.5, "diurnal", capturedAt);
  const trough = calculateAcSettings(40, "medium", 4.5, 27, 50);
  const peak = calculateAcSettings(40, "medium", 4.5, 36, 80);
  assertAlmostEquals(hourly[0].smart_power_kw, trough.power_kw, 1e-9);
  assertAlmostEquals(hourly[1].smart_power_kw, peak.power_kw, 1e-9);
});
