import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettings, type RoomSize } from "./acCalculation.ts";
import { calculateHybridSettings } from "./hybridCalculation.ts";

Deno.test("at baseline conditions (33°C/60% RH), hybrid matches the base model exactly", () => {
  const base = calculateAcSettings(20, "medium", 4.5, 33, 60);
  const hybrid = calculateHybridSettings(20, "medium", 4.5, 33, 60);
  assertEquals(hybrid.base_temp_c, base.temperature_c);
  assertEquals(hybrid.adjusted_temp_c, base.temperature_c);
  assertEquals(hybrid.power_kw, base.power_kw);
  assertEquals(hybrid.btu_per_hr, base.btu_per_hr);
});

Deno.test("hot + humid (above baseline): hybrid holds at the base temp, no double-counted tightening", () => {
  // Mirrors the peer spec's own example — 50 people, medium room, 38°C/85% RH.
  const base = calculateAcSettings(50, "medium", 4.5, 38, 85);
  const hybrid = calculateHybridSettings(50, "medium", 4.5, 38, 85);
  assertEquals(base.mode, "full");
  assertEquals(hybrid.adjusted_temp_c, hybrid.base_temp_c);
  assertEquals(hybrid.power_kw, base.power_kw);
  assertEquals(hybrid.btu_per_hr, base.btu_per_hr);
});

Deno.test("cool + dry (below baseline): setpoint eases warmer and power drops below the base model", () => {
  const baseSettings = calculateAcSettings(40, "medium", 4.5, 27, 30);
  const hybrid = calculateHybridSettings(40, "medium", 4.5, 27, 30);

  assertEquals(hybrid.base_temp_c, baseSettings.temperature_c);
  assertEquals(hybrid.adjusted_temp_c > hybrid.base_temp_c, true);
  assertEquals(hybrid.power_kw < baseSettings.power_kw, true);
  assertEquals(hybrid.btu_per_hr < baseSettings.btu_per_hr, true);
});

Deno.test("eco mode never eases — its base temp already sits at its range ceiling", () => {
  // Very mild conditions, still eco occupancy (low density).
  const hybrid = calculateHybridSettings(1, "large", 4.5, 15, 10);
  assertEquals(hybrid.mode, "eco");
  assertEquals(hybrid.base_temp_c, 28);
  assertEquals(hybrid.adjusted_temp_c, 28);
});

Deno.test("moderate/full ease is clamped to the mode's range ceiling under extreme mild conditions", () => {
  // 50 people/medium room: density 50/275 = 0.182 → full mode. Extremely
  // cold/dry outside should still clamp adjusted_temp_c at the range max (23).
  const hybrid = calculateHybridSettings(50, "medium", 4.5, -20, 0);
  assertEquals(hybrid.mode, "full");
  assertEquals(hybrid.adjusted_temp_c, 23);
});

Deno.test("adjusted_temp_c always stays within [range.min, range.max] for its mode, across many conditions", () => {
  const ranges: Record<string, { min: number; max: number }> = {
    eco: { min: 26, max: 28 },
    moderate: { min: 22, max: 26 },
    full: { min: 19, max: 23 },
  };
  const roomSizes: RoomSize[] = ["small", "medium", "large"];
  const temps = [-10, 0, 15, 27, 33, 38, 45];
  const humidities = [0, 30, 60, 85, 100];
  const peopleCounts = [0, 5, 20, 40, 60, 100];

  for (const roomSize of roomSizes) {
    for (const temp of temps) {
      for (const humidity of humidities) {
        for (const people of peopleCounts) {
          const hybrid = calculateHybridSettings(people, roomSize, 4.5, temp, humidity);
          const range = ranges[hybrid.mode];
          assertEquals(
            hybrid.adjusted_temp_c >= range.min && hybrid.adjusted_temp_c <= range.max,
            true,
            `mode=${hybrid.mode} adjusted_temp_c=${hybrid.adjusted_temp_c} outside [${range.min},${range.max}]`,
          );
        }
      }
    }
  }
});

Deno.test("hybrid power_kw never exceeds the base model's power_kw for the same inputs", () => {
  const cases: Array<[number, RoomSize, number, number]> = [
    [0, "small", 33, 60],
    [10, "medium", 20, 40],
    [40, "medium", 27, 30],
    [70, "large", 38, 85],
    [100, "large", -5, 10],
  ];
  for (const [people, roomSize, temp, humidity] of cases) {
    const base = calculateAcSettings(people, roomSize, 4.5, temp, humidity);
    const hybrid = calculateHybridSettings(people, roomSize, 4.5, temp, humidity);
    assertEquals(hybrid.power_kw <= base.power_kw, true, `hybrid ${hybrid.power_kw} > base ${base.power_kw}`);
  }
});

Deno.test("fan speed and mode are identical between base and hybrid models (only temperature/power differ)", () => {
  const base = calculateAcSettings(15, "small", 4.5, 20, 25);
  const hybrid = calculateHybridSettings(15, "small", 4.5, 20, 25);
  assertEquals(hybrid.mode, base.mode);
  assertEquals(hybrid.fan_speed, base.fan_speed);
});

Deno.test("humidity easing alone (temp at baseline) still reduces power", () => {
  const base = calculateAcSettings(40, "medium", 4.5, 33, 20);
  const hybrid = calculateHybridSettings(40, "medium", 4.5, 33, 20);
  assertEquals(hybrid.adjusted_temp_c > hybrid.base_temp_c, true);
  assertEquals(hybrid.power_kw < base.power_kw, true);
});

Deno.test("exact ease-degree math for a moderate-mode mild-condition case", () => {
  // moderate mode, 10°C below baseline temp, 20%RH below baseline humidity.
  // tempEase = 0.3*10 = 3, humidityEase = 0.02*20 = 0.4 → raw ease 3.4,
  // clamped to moderate's ceiling (26), base 24 → applied ease = 2.
  const hybrid = calculateHybridSettings(15, "medium", 4.5, 23, 40);
  assertEquals(hybrid.mode, "moderate");
  assertEquals(hybrid.base_temp_c, 24);
  assertEquals(hybrid.adjusted_temp_c, 26);
  // powerEaseMultiplier = 1 - 0.05*2 = 0.9
  const base = calculateAcSettings(15, "medium", 4.5, 23, 40);
  assertAlmostEquals(hybrid.btu_per_hr, base.btu_per_hr * 0.9, 1e-9);
});
