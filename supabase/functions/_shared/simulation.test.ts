import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { getAcMode, type RoomSize } from "./acCalculation.ts";
import { calculateCoolSenseV2Settings } from "./coolSenseV2Calculation.ts";
import { calculateCoolSenseV3Settings } from "./coolSenseV3Calculation.ts";
import {
  CURRENT_SYSTEM_POWER_KW,
  DEFAULT_STATIC_TEMP_C,
  generateMockOccupancy,
  getDiurnalWeather,
  runSimulation,
} from "./simulation.ts";

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
  // PEAK_DENSITY == FULL_DENSITY (0.15) × 60 m² = 9 people exactly — lands
  // right on the full-mode threshold with zero noise, so ±15% noise tips it
  // into full or moderate roughly evenly across the week.
  assertEquals(mondayNoon!.people_count, 9);
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
  assertEquals(readings[0].people_count, 4); // WEEKEND_DENSITY (0.06) × 60 m² = 3.6 → 4
});

Deno.test("generateMockOccupancy: noise stays within ±15% of the base and is never negative", () => {
  const minReadings = generateMockOccupancy(24, "medium", { now: MONDAY_23, random: minRandom });
  const maxReadings = generateMockOccupancy(24, "medium", { now: MONDAY_23, random: maxRandom });
  const noonIndex = minReadings.findIndex((r) => new Date(r.captured_at).getHours() === 12);

  // Base is 9 (0.15 × 60, exact, no noise); -15% → 7.65 → rounds to 8, +15% → 10.35 → rounds to 10.
  assertEquals(minReadings[noonIndex].people_count, 8);
  assertEquals(maxReadings[noonIndex].people_count, 10);
  assertEquals(minReadings.every((r) => r.people_count >= 0), true);
});

Deno.test("generateMockOccupancy: all people counts are non-negative integers", () => {
  const readings = generateMockOccupancy(48, "large", { now: MONDAY_MIDNIGHT, random: () => Math.random() });
  for (const r of readings) {
    assertEquals(Number.isInteger(r.people_count), true);
    assertEquals(r.people_count >= 0, true);
  }
});

Deno.test("runSimulation: current_energy_kwh is duration_hours × 4.5 at the default 25°C static baseline", () => {
  const { summary } = runSimulation([0, 0, 20, 20, 0], "medium", 4.5, "warm");
  assertEquals(summary.current_energy_kwh, 5 * CURRENT_SYSTEM_POWER_KW);
});

Deno.test("runSimulation: a colder static_temp_c raises current_power_kw; a warmer one lowers it", () => {
  const cold = runSimulation([0], "medium", 4.5, "warm", undefined, 18);
  const baseline = runSimulation([0], "medium", 4.5, "warm", undefined, DEFAULT_STATIC_TEMP_C);
  const warm = runSimulation([0], "medium", 4.5, "warm", undefined, 28);
  assertEquals(cold.hourly[0].current_power_kw > baseline.hourly[0].current_power_kw, true);
  assertEquals(warm.hourly[0].current_power_kw < baseline.hourly[0].current_power_kw, true);
  assertEquals(baseline.hourly[0].current_power_kw, CURRENT_SYSTEM_POWER_KW);
});

Deno.test("runSimulation: smart hourly power matches calculateCoolSenseV2Settings (CoolSense V2, not V1) for that hour", () => {
  const peopleCounts = [0, 5, 20];
  const { hourly } = runSimulation(peopleCounts, "medium", 4.5, "warm");
  peopleCounts.forEach((people, i) => {
    const expected = calculateCoolSenseV2Settings(people, "medium", 4.5, 33, 60, "neutral"); // "warm" preset == baseline
    assertEquals(hourly[i].smart_power_kw, expected.power_kw);
  });
});

Deno.test("runSimulation: comfort_preference feeds through to CoolSense V2's smart power", () => {
  const neutral = runSimulation([20], "medium", 4.5, "warm", undefined, DEFAULT_STATIC_TEMP_C, "neutral");
  const cold = runSimulation([20], "medium", 4.5, "warm", undefined, DEFAULT_STATIC_TEMP_C, "cold");
  const warmPref = runSimulation([20], "medium", 4.5, "warm", undefined, DEFAULT_STATIC_TEMP_C, "warm");
  assertEquals(cold.hourly[0].smart_power_kw >= neutral.hourly[0].smart_power_kw, true);
  assertEquals(neutral.hourly[0].smart_power_kw >= warmPref.hourly[0].smart_power_kw, true);
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

Deno.test("runSimulation: app_energy_kwh is the per-day baseline prorated over duration_hours plus the fixed per-run overhead", () => {
  const { summary } = runSimulation(new Array(24).fill(20), "medium", 4.5, "warm");
  // 0.1051 kWh/day / 24h * 24h + 0.00185 kWh overhead == 0.1051 + 0.00185
  assertAlmostEquals(summary.app_energy_kwh, 0.1051 + 0.00185, 1e-9);
});

Deno.test("runSimulation: app_energy_kwh scales linearly with duration_hours", () => {
  const short = runSimulation(new Array(24).fill(20), "medium", 4.5, "warm").summary;
  const long = runSimulation(new Array(48).fill(20), "medium", 4.5, "warm").summary;
  const expectedDelta = (0.1051 / 24) * 24; // one more day's baseline, same fixed overhead
  assertAlmostEquals(long.app_energy_kwh - short.app_energy_kwh, expectedDelta, 1e-9);
});

Deno.test("runSimulation: empty input has zero app_energy_kwh (no run means no overhead)", () => {
  const { summary } = runSimulation([], "medium", 4.5, "warm");
  assertEquals(summary.app_energy_kwh, 0);
  assertEquals(summary.net_energy_saved_kwh, 0);
  assertEquals(summary.net_co2_saved_kg, 0);
  assertEquals(summary.net_cost_saved_baht, 0);
});

Deno.test("runSimulation: net savings equal V3 energy saved minus app_energy_kwh, priced at the Thailand grid figures", () => {
  const { summary } = runSimulation([0, 5, 20, 41, 3], "medium", 4.5, "warm");
  const v3EnergySaved = summary.static_v3_energy_kwh - summary.coolsense_v3_energy_kwh;
  const expectedNet = v3EnergySaved - summary.app_energy_kwh;
  assertAlmostEquals(summary.net_energy_saved_kwh, expectedNet, 1e-9);
  assertAlmostEquals(summary.net_co2_saved_kg, expectedNet * 0.5, 1e-9);
  assertAlmostEquals(summary.net_cost_saved_baht, expectedNet * 5, 1e-9);
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

Deno.test("runSimulation: diurnal weather at the exact peak/trough hours matches calculateCoolSenseV2Settings directly", () => {
  const peopleCounts = [40, 40];
  const capturedAt = [new Date(2026, 7, 10, 3, 0, 0), new Date(2026, 7, 10, 15, 0, 0)];
  const { hourly } = runSimulation(peopleCounts, "medium", 4.5, "diurnal", capturedAt);
  const trough = calculateCoolSenseV2Settings(40, "medium", 4.5, 27, 50, "neutral");
  const peak = calculateCoolSenseV2Settings(40, "medium", 4.5, 36, 80, "neutral");
  assertAlmostEquals(hourly[0].smart_power_kw, trough.power_kw, 1e-9);
  assertAlmostEquals(hourly[1].smart_power_kw, peak.power_kw, 1e-9);
});

// ---- CoolSense V3 / static-v3 baseline ----

Deno.test("runSimulation: static_v3 baseline scales with room size (small < medium < large) at default static temp", () => {
  const small = runSimulation([0], "small", 15, "warm");
  const medium = runSimulation([0], "medium", 15, "warm");
  const large = runSimulation([0], "large", 15, "warm");
  assertEquals(small.hourly[0].static_v3_power_kw < medium.hourly[0].static_v3_power_kw, true);
  assertEquals(medium.hourly[0].static_v3_power_kw < large.hourly[0].static_v3_power_kw, true);
});

Deno.test("runSimulation: static_v3 baseline at default static_temp_c (25°C, clamped to full mode's 21°C) equals the headroom-sized full-occupancy V3 power exactly", () => {
  // medium room: full-mode threshold is ceil(0.15 * 60) = 9 people; sizing
  // occupancy adds the 1.2x headroom margin (see STATIC_V3_SIZING_HEADROOM
  // in simulation.ts) → ceil(9 * 1.2) = 11 people. 25°C is warmer than full
  // mode's 21°C base, so it clamps to 21°C — no multiplier adjustment
  // (degreesColderThanFullModeBase = 0).
  const { hourly } = runSimulation([0], "medium", 15, "warm", undefined, DEFAULT_STATIC_TEMP_C);
  const worstCase = calculateCoolSenseV3Settings(11, "medium", 15, 33, 60, "neutral");
  assertAlmostEquals(hourly[0].static_v3_power_kw, worstCase.power_kw, 1e-9);
});

Deno.test("runSimulation: a static_temp_c colder than full mode's base (21°C) raises static_v3 power further", () => {
  const default25 = runSimulation([0], "medium", 15, "warm", undefined, DEFAULT_STATIC_TEMP_C);
  const colder18 = runSimulation([0], "medium", 15, "warm", undefined, 18);
  assertEquals(colder18.hourly[0].static_v3_power_kw > default25.hourly[0].static_v3_power_kw, true);
});

Deno.test("runSimulation: CoolSense V3 hourly power matches calculateCoolSenseV3Settings for that hour", () => {
  const peopleCounts = [0, 5, 20];
  const { hourly } = runSimulation(peopleCounts, "medium", 15, "warm");
  peopleCounts.forEach((people, i) => {
    const expected = calculateCoolSenseV3Settings(people, "medium", 15, 33, 60, "neutral"); // "warm" preset == baseline
    assertEquals(hourly[i].coolsense_v3_power_kw, expected.power_kw);
  });
});

Deno.test("runSimulation: CoolSense V3 (neutral comfort) never exceeds the static-v3 baseline, even at full occupancy", () => {
  // large room, full-mode implied occupancy = ceil(0.15*120) = 18 people, baseline weather.
  const { hourly } = runSimulation([18], "large", 15, "warm", undefined, DEFAULT_STATIC_TEMP_C, "neutral");
  assertEquals(hourly[0].coolsense_v3_power_kw <= hourly[0].static_v3_power_kw, true);
});

Deno.test("runSimulation: CoolSense V3 never exceeds the static-v3 baseline at full occupancy under hot weather", () => {
  // small room, full-mode implied occupancy = ceil(0.15*30) = 5 people.
  // "hot" (38C/75%) sits well above the 33C/60% baseline the static
  // sizing must also account for, not just baseline-weather worst-case.
  const { hourly } = runSimulation([5], "small", 15, "hot", undefined, DEFAULT_STATIC_TEMP_C, "neutral");
  assertEquals(hourly[0].coolsense_v3_power_kw <= hourly[0].static_v3_power_kw, true);
});

Deno.test("runSimulation: CoolSense V3 never exceeds the static-v3 baseline at full occupancy under diurnal peak weather", () => {
  const peakHour = new Date(2026, 7, 10, 15, 0, 0); // 3pm, diurnal peak (36C/80%)
  const { hourly } = runSimulation([5], "small", 15, "diurnal", [peakHour], DEFAULT_STATIC_TEMP_C, "neutral");
  assertEquals(hourly[0].coolsense_v3_power_kw <= hourly[0].static_v3_power_kw, true);
});

Deno.test("runSimulation: CoolSense V3 never exceeds the static-v3 baseline when occupancy overshoots the full threshold by realistic noise (+15%)", () => {
  // medium room: full-mode threshold is 9 people (ceil(0.15*60)). generateMockOccupancy's
  // own ±15% noise can realistically push a peak reading to ceil(9*1.15) = 11 people —
  // this isn't a contrived crowd, it's within the noise band the mock generator itself
  // produces. static_v3 must be sized with enough headroom to still cover it.
  const { hourly } = runSimulation([11], "medium", 15, "warm", undefined, DEFAULT_STATIC_TEMP_C, "neutral");
  assertEquals(hourly[0].coolsense_v3_power_kw <= hourly[0].static_v3_power_kw, true);
});

Deno.test("runSimulation: static_v3 and coolsense_v3 cumulative sums are monotonic and match the summary totals at the last hour", () => {
  const { hourly, summary } = runSimulation([0, 5, 10, 20, 3], "medium", 15, "hot");
  for (let i = 1; i < hourly.length; i++) {
    assertEquals(hourly[i].static_v3_cumulative_kwh >= hourly[i - 1].static_v3_cumulative_kwh, true);
    assertEquals(hourly[i].coolsense_v3_cumulative_kwh >= hourly[i - 1].coolsense_v3_cumulative_kwh, true);
  }
  const last = hourly[hourly.length - 1];
  assertAlmostEquals(last.static_v3_cumulative_kwh, summary.static_v3_energy_kwh, 1e-9);
  assertAlmostEquals(last.coolsense_v3_cumulative_kwh, summary.coolsense_v3_energy_kwh, 1e-9);
});

Deno.test("runSimulation: v3 CO2 and cost use the Thailand grid figures (0.5 kg/kWh, 5 baht/kWh)", () => {
  const { summary } = runSimulation([0, 0, 0], "medium", 15, "warm");
  assertEquals(summary.static_v3_co2_kg, summary.static_v3_energy_kwh * 0.5);
  assertEquals(summary.static_v3_cost_baht, summary.static_v3_energy_kwh * 5);
  assertEquals(summary.coolsense_v3_co2_kg, summary.coolsense_v3_energy_kwh * 0.5);
  assertEquals(summary.coolsense_v3_cost_baht, summary.coolsense_v3_energy_kwh * 5);
});

Deno.test("runSimulation: v3_pct_reduction is positive across a realistic mixed-occupancy week", () => {
  const readings = generateMockOccupancy(168, "medium", { now: new Date(2026, 7, 10, 0, 0, 0), random: () => 0.5 });
  const { summary } = runSimulation(readings.map((r) => r.people_count), "medium", 15, "warm");
  assertEquals(summary.coolsense_v3_energy_kwh < summary.static_v3_energy_kwh, true);
  assertEquals(summary.v3_pct_reduction > 0, true);
  assertAlmostEquals(
    summary.v3_pct_reduction,
    ((summary.static_v3_energy_kwh - summary.coolsense_v3_energy_kwh) / summary.static_v3_energy_kwh) * 100,
    1e-9,
  );
});

Deno.test("runSimulation: empty input produces a zeroed-out v3 summary too, not a crash", () => {
  const { summary } = runSimulation([], "medium", 15, "warm");
  assertEquals(summary.static_v3_energy_kwh, 0);
  assertEquals(summary.coolsense_v3_energy_kwh, 0);
  assertEquals(summary.v3_pct_reduction, 0);
});

// ---- optional operating-hours schedule ----

Deno.test("runSimulation: operating-hours schedule requires capturedAt timestamps", () => {
  let threw = false;
  try {
    runSimulation([10], "medium", 15, "warm", undefined, DEFAULT_STATIC_TEMP_C, "neutral", { startHour: 9, endHour: 20 });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("runSimulation: hours outside the schedule window draw zero power for all four models", () => {
  const peopleCounts = [20, 20, 20]; // 8am, noon, 9pm — same occupancy, only the hour differs
  const capturedAt = [
    new Date(2026, 7, 10, 8, 0, 0), // before window
    new Date(2026, 7, 10, 12, 0, 0), // inside window
    new Date(2026, 7, 10, 21, 0, 0), // after window
  ];
  const { hourly } = runSimulation(peopleCounts, "medium", 15, "warm", capturedAt, DEFAULT_STATIC_TEMP_C, "neutral", {
    startHour: 9,
    endHour: 20,
  });

  assertEquals(hourly[0].current_power_kw, 0);
  assertEquals(hourly[0].smart_power_kw, 0);
  assertEquals(hourly[0].static_v3_power_kw, 0);
  assertEquals(hourly[0].coolsense_v3_power_kw, 0);

  assertEquals(hourly[1].current_power_kw > 0, true);
  assertEquals(hourly[1].smart_power_kw > 0, true);
  assertEquals(hourly[1].static_v3_power_kw > 0, true);
  assertEquals(hourly[1].coolsense_v3_power_kw > 0, true);

  assertEquals(hourly[2].current_power_kw, 0);
  assertEquals(hourly[2].smart_power_kw, 0);
  assertEquals(hourly[2].static_v3_power_kw, 0);
  assertEquals(hourly[2].coolsense_v3_power_kw, 0);
});

Deno.test("runSimulation: overnight-wrapping schedule (start > end) treats hours past midnight as within the window", () => {
  const peopleCounts = [20, 20, 20];
  const capturedAt = [
    new Date(2026, 7, 10, 23, 0, 0), // 11pm — within a 22-6 overnight window
    new Date(2026, 7, 10, 2, 0, 0), // 2am — within a 22-6 overnight window
    new Date(2026, 7, 10, 12, 0, 0), // noon — outside a 22-6 overnight window
  ];
  const { hourly } = runSimulation(peopleCounts, "medium", 15, "warm", capturedAt, DEFAULT_STATIC_TEMP_C, "neutral", {
    startHour: 22,
    endHour: 6,
  });

  assertEquals(hourly[0].coolsense_v3_power_kw > 0, true);
  assertEquals(hourly[1].coolsense_v3_power_kw > 0, true);
  assertEquals(hourly[2].coolsense_v3_power_kw, 0);
});

Deno.test("runSimulation: schedule reduces total energy compared to the same run without a schedule", () => {
  const readings = generateMockOccupancy(168, "medium", { now: new Date(2026, 7, 10, 0, 0, 0), random: () => 0.5 });
  const peopleCounts = readings.map((r) => r.people_count);
  const capturedAt = readings.map((r) => new Date(r.captured_at));

  const unscheduled = runSimulation(peopleCounts, "medium", 15, "warm", capturedAt);
  const scheduled = runSimulation(peopleCounts, "medium", 15, "warm", capturedAt, DEFAULT_STATIC_TEMP_C, "neutral", {
    startHour: 9,
    endHour: 20,
  });

  assertEquals(scheduled.summary.coolsense_v3_energy_kwh < unscheduled.summary.coolsense_v3_energy_kwh, true);
  assertEquals(scheduled.summary.static_v3_energy_kwh < unscheduled.summary.static_v3_energy_kwh, true);
});

Deno.test("runSimulation: cumulative sums stay monotonic and match summary totals with a schedule applied", () => {
  const capturedAt = Array.from({ length: 24 }, (_, h) => new Date(2026, 7, 10, h, 0, 0));
  const peopleCounts = capturedAt.map(() => 20);
  const { hourly, summary } = runSimulation(peopleCounts, "medium", 15, "warm", capturedAt, DEFAULT_STATIC_TEMP_C, "neutral", {
    startHour: 9,
    endHour: 20,
  });
  for (let i = 1; i < hourly.length; i++) {
    assertEquals(hourly[i].static_v3_cumulative_kwh >= hourly[i - 1].static_v3_cumulative_kwh, true);
    assertEquals(hourly[i].coolsense_v3_cumulative_kwh >= hourly[i - 1].coolsense_v3_cumulative_kwh, true);
  }
  const last = hourly[hourly.length - 1];
  assertAlmostEquals(last.static_v3_cumulative_kwh, summary.static_v3_energy_kwh, 1e-9);
  assertAlmostEquals(last.coolsense_v3_cumulative_kwh, summary.coolsense_v3_energy_kwh, 1e-9);
});

// ---- per-hour temperature (for the Simulation page's temperature-over-time graph) ----

Deno.test("runSimulation: coolsense_v3_temperature_c matches calculateCoolSenseV3Settings's adjusted_temp_c for that hour", () => {
  const peopleCounts = [0, 5, 20];
  const { hourly } = runSimulation(peopleCounts, "medium", 15, "warm");
  peopleCounts.forEach((people, i) => {
    const expected = calculateCoolSenseV3Settings(people, "medium", 15, 33, 60, "neutral");
    assertEquals(hourly[i].coolsense_v3_temperature_c, expected.adjusted_temp_c);
  });
});

Deno.test("runSimulation: static_v3_temperature_c is constant across the whole run (a naive system doesn't adapt)", () => {
  const { hourly } = runSimulation([0, 5, 20, 42], "medium", 15, "diurnal", [
    new Date(2026, 7, 10, 3, 0, 0),
    new Date(2026, 7, 10, 9, 0, 0),
    new Date(2026, 7, 10, 15, 0, 0),
    new Date(2026, 7, 10, 21, 0, 0),
  ]);
  const first = hourly[0].static_v3_temperature_c;
  hourly.forEach((h) => assertEquals(h.static_v3_temperature_c, first));
});

Deno.test("runSimulation: static_v3_temperature_c matches full mode's base temp (21°C) when static_temp_c is warmer", () => {
  const { hourly } = runSimulation([0], "medium", 15, "warm", undefined, DEFAULT_STATIC_TEMP_C);
  assertEquals(hourly[0].static_v3_temperature_c, 21);
});

Deno.test("runSimulation: temperature fields stay populated (not zeroed) during scheduled-off hours", () => {
  const capturedAt = [new Date(2026, 7, 10, 3, 0, 0)]; // 3am — outside a 9-20 window
  const { hourly } = runSimulation([10], "medium", 15, "warm", capturedAt, DEFAULT_STATIC_TEMP_C, "neutral", {
    startHour: 9,
    endHour: 20,
  });
  assertEquals(hourly[0].coolsense_v3_power_kw, 0); // power is off...
  assertEquals(typeof hourly[0].coolsense_v3_temperature_c, "number"); // ...but the setpoint value is still reported
});
