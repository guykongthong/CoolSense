import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettings, type RoomSize } from "./acCalculation.ts";
import { calculateCoolSenseV2Settings } from "./coolSenseV2Calculation.ts";

Deno.test("at baseline conditions (33°C/60% RH), neutral comfort: CoolSense V2 matches the base model exactly", () => {
  const base = calculateAcSettings(20, "medium", 4.5, 33, 60);
  const v2 = calculateCoolSenseV2Settings(20, "medium", 4.5, 33, 60);
  assertEquals(v2.base_temp_c, base.temperature_c);
  assertEquals(v2.adjusted_temp_c, base.temperature_c);
  assertEquals(v2.power_kw, base.power_kw);
  assertEquals(v2.btu_per_hr, base.btu_per_hr);
});

Deno.test("hot + humid (above baseline): CoolSense V2 holds at the base temp, no double-counted tightening", () => {
  const base = calculateAcSettings(50, "medium", 4.5, 38, 85);
  const v2 = calculateCoolSenseV2Settings(50, "medium", 4.5, 38, 85);
  assertEquals(base.mode, "full");
  assertEquals(v2.adjusted_temp_c, v2.base_temp_c);
  assertEquals(v2.power_kw, base.power_kw);
  assertEquals(v2.btu_per_hr, base.btu_per_hr);
});

Deno.test("cool + dry (below baseline): setpoint eases warmer and power drops below the base model", () => {
  const baseSettings = calculateAcSettings(40, "medium", 4.5, 27, 30);
  const v2 = calculateCoolSenseV2Settings(40, "medium", 4.5, 27, 30);

  assertEquals(v2.base_temp_c, baseSettings.temperature_c);
  assertEquals(v2.adjusted_temp_c > v2.base_temp_c, true);
  assertEquals(v2.power_kw < baseSettings.power_kw, true);
  assertEquals(v2.btu_per_hr < baseSettings.btu_per_hr, true);
});

Deno.test("eco mode never eases from weather alone — its base temp already sits at its range ceiling", () => {
  const v2 = calculateCoolSenseV2Settings(1, "large", 4.5, 15, 10);
  assertEquals(v2.mode, "eco");
  assertEquals(v2.base_temp_c, 26);
  assertEquals(v2.adjusted_temp_c, 26);
});

Deno.test("moderate/full ease is clamped to the mode's range ceiling under extreme mild conditions", () => {
  // 50 people/medium room: density 50/60 = 0.833 → full mode. Extremely
  // cold/dry outside should still clamp adjusted_temp_c at the range max (23).
  const v2 = calculateCoolSenseV2Settings(50, "medium", 4.5, -20, 0);
  assertEquals(v2.mode, "full");
  assertEquals(v2.adjusted_temp_c, 23);
});

Deno.test("adjusted_temp_c always stays within [range.min, range.max] for its mode, across many conditions and comfort preferences", () => {
  const ranges: Record<string, { min: number; max: number }> = {
    eco: { min: 24, max: 26 },
    moderate: { min: 22, max: 26 },
    full: { min: 19, max: 23 },
  };
  const roomSizes: RoomSize[] = ["small", "medium", "large"];
  const temps = [-10, 0, 15, 27, 33, 38, 45];
  const humidities = [0, 30, 60, 85, 100];
  const peopleCounts = [0, 5, 20, 40, 60, 100];
  const comforts: Array<"cold" | "neutral" | "warm"> = ["cold", "neutral", "warm"];

  for (const roomSize of roomSizes) {
    for (const temp of temps) {
      for (const humidity of humidities) {
        for (const people of peopleCounts) {
          for (const comfort of comforts) {
            const v2 = calculateCoolSenseV2Settings(people, roomSize, 4.5, temp, humidity, comfort);
            const range = ranges[v2.mode];
            assertEquals(
              v2.adjusted_temp_c >= range.min && v2.adjusted_temp_c <= range.max,
              true,
              `mode=${v2.mode} comfort=${comfort} adjusted_temp_c=${v2.adjusted_temp_c} outside [${range.min},${range.max}]`,
            );
          }
        }
      }
    }
  }
});

Deno.test("CoolSense V2 power_kw never exceeds the base model's power_kw at neutral comfort", () => {
  const cases: Array<[number, RoomSize, number, number]> = [
    [0, "small", 33, 60],
    [10, "medium", 20, 40],
    [40, "medium", 27, 30],
    [70, "large", 38, 85],
    [100, "large", -5, 10],
  ];
  for (const [people, roomSize, temp, humidity] of cases) {
    const base = calculateAcSettings(people, roomSize, 4.5, temp, humidity);
    const v2 = calculateCoolSenseV2Settings(people, roomSize, 4.5, temp, humidity, "neutral");
    assertEquals(v2.power_kw <= base.power_kw, true, `v2 ${v2.power_kw} > base ${base.power_kw}`);
  }
});

Deno.test("fan speed and mode are identical between base and CoolSense V2 models (only temperature/power differ)", () => {
  const base = calculateAcSettings(15, "small", 4.5, 20, 25);
  const v2 = calculateCoolSenseV2Settings(15, "small", 4.5, 20, 25);
  assertEquals(v2.mode, base.mode);
  assertEquals(v2.fan_speed, base.fan_speed);
});

Deno.test("humidity easing alone (temp at baseline) still reduces power", () => {
  const base = calculateAcSettings(40, "medium", 4.5, 33, 20);
  const v2 = calculateCoolSenseV2Settings(40, "medium", 4.5, 33, 20);
  assertEquals(v2.adjusted_temp_c > v2.base_temp_c, true);
  assertEquals(v2.power_kw < base.power_kw, true);
});

Deno.test("exact ease-degree math for a moderate-mode mild-condition case", () => {
  // moderate mode (5 people/medium room, density 5/60 = 0.083), 10°C below
  // baseline temp, 20%RH below baseline humidity. tempEase = 0.3*10 = 3,
  // humidityEase = 0.02*20 = 0.4 → raw ease 3.4, clamped to moderate's
  // ceiling (26), base 24 → applied change = 2.
  const v2 = calculateCoolSenseV2Settings(5, "medium", 4.5, 23, 40);
  assertEquals(v2.mode, "moderate");
  assertEquals(v2.base_temp_c, 24);
  assertEquals(v2.adjusted_temp_c, 26);
  const base = calculateAcSettings(5, "medium", 4.5, 23, 40);
  assertAlmostEquals(v2.btu_per_hr, base.btu_per_hr * 0.9, 1e-9); // 1 - 0.05*2

});

// ---- comfort_preference ----

Deno.test("comfort_preference defaults to neutral (no offset) when omitted", () => {
  const withDefault = calculateCoolSenseV2Settings(20, "medium", 4.5, 33, 60);
  const explicitNeutral = calculateCoolSenseV2Settings(20, "medium", 4.5, 33, 60, "neutral");
  assertEquals(withDefault, explicitNeutral);
});

Deno.test("comfort_preference 'warm' at baseline weather: +2°C, clamped to moderate's ceiling (matches the peer spec example)", () => {
  // 5 people/medium room at baseline (33/60) → moderate mode, base 24°C.
  // warm: 24 + 2 = 26, within moderate's 22-26 range.
  const v2 = calculateCoolSenseV2Settings(5, "medium", 4.5, 33, 60, "warm");
  assertEquals(v2.mode, "moderate");
  assertEquals(v2.base_temp_c, 24);
  assertEquals(v2.adjusted_temp_c, 26);
});

Deno.test("comfort_preference 'cold' at baseline weather: -2°C, and power_kw rises above the base model", () => {
  const base = calculateAcSettings(5, "medium", 4.5, 33, 60);
  const v2 = calculateCoolSenseV2Settings(5, "medium", 4.5, 33, 60, "cold");
  assertEquals(v2.mode, "moderate");
  assertEquals(v2.adjusted_temp_c, 22); // 24 - 2, within 22-26 range
  assertEquals(v2.power_kw > base.power_kw, true);
});

Deno.test("comfort_preference 'cold' is clamped to the mode's range floor, never goes below it", () => {
  // eco base is already 26 (range 24-26); cold would want 24, which is
  // exactly the floor — still valid. Push further with mild weather easing
  // (which for eco is a no-op, base already at ceiling) to confirm clamping.
  const v2 = calculateCoolSenseV2Settings(1, "large", 4.5, 33, 60, "cold");
  assertEquals(v2.mode, "eco");
  assertEquals(v2.adjusted_temp_c, 24); // 26 - 2, exactly at the floor
});

Deno.test("comfort_preference 'warm' composes with weather easing, still clamped to the ceiling", () => {
  // Mild weather already eases moderate mode to 26 (the ceiling); warm
  // preference can't push it any further past the ceiling.
  const v2 = calculateCoolSenseV2Settings(5, "medium", 4.5, 23, 40, "warm");
  assertEquals(v2.mode, "moderate");
  assertEquals(v2.adjusted_temp_c, 26);
});

Deno.test("comfort_preference ordering: cold power >= neutral power >= warm power, for the same conditions", () => {
  const cold = calculateCoolSenseV2Settings(20, "medium", 4.5, 33, 60, "cold");
  const neutral = calculateCoolSenseV2Settings(20, "medium", 4.5, 33, 60, "neutral");
  const warm = calculateCoolSenseV2Settings(20, "medium", 4.5, 33, 60, "warm");
  assertEquals(cold.power_kw >= neutral.power_kw, true);
  assertEquals(neutral.power_kw >= warm.power_kw, true);
});
