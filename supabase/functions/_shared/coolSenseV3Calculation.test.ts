import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettingsV3 } from "./acCalculationV3.ts";
import { calculateCoolSenseV3Settings } from "./coolSenseV3Calculation.ts";
import type { RoomSize } from "./acCalculation.ts";

Deno.test("at baseline conditions (33°C/60% RH), neutral comfort: CoolSense V3 matches the base V3 model exactly", () => {
  const base = calculateAcSettingsV3(20, "medium", 15, 33, 60);
  const v3 = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60);
  assertEquals(v3.base_temp_c, base.temperature_c);
  assertEquals(v3.adjusted_temp_c, base.temperature_c);
  assertEquals(v3.power_kw, base.power_kw);
  assertEquals(v3.btu_per_hr, base.btu_per_hr);
});

Deno.test("hot + humid (above baseline): CoolSense V3 holds at the base temp, no double-counted tightening", () => {
  const base = calculateAcSettingsV3(50, "medium", 15, 38, 85);
  const v3 = calculateCoolSenseV3Settings(50, "medium", 15, 38, 85);
  assertEquals(base.mode, "full");
  assertEquals(v3.adjusted_temp_c, v3.base_temp_c);
  assertEquals(v3.power_kw, base.power_kw);
});

Deno.test("cool + dry (below baseline): setpoint eases warmer and power drops below the base V3 model", () => {
  const baseSettings = calculateAcSettingsV3(40, "medium", 15, 27, 30);
  const v3 = calculateCoolSenseV3Settings(40, "medium", 15, 27, 30);
  assertEquals(v3.adjusted_temp_c > v3.base_temp_c, true);
  assertEquals(v3.power_kw < baseSettings.power_kw, true);
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
            const v3 = calculateCoolSenseV3Settings(people, roomSize, 15, temp, humidity, comfort);
            const range = ranges[v3.mode];
            assertEquals(
              v3.adjusted_temp_c >= range.min && v3.adjusted_temp_c <= range.max,
              true,
              `mode=${v3.mode} comfort=${comfort} adjusted_temp_c=${v3.adjusted_temp_c} outside [${range.min},${range.max}]`,
            );
          }
        }
      }
    }
  }
});

Deno.test("CoolSense V3 power_kw never exceeds the base V3 model's power_kw at neutral comfort", () => {
  const cases: Array<[number, RoomSize, number, number]> = [
    [0, "small", 33, 60],
    [10, "medium", 20, 40],
    [40, "medium", 27, 30],
    [70, "large", 38, 85],
  ];
  for (const [people, roomSize, temp, humidity] of cases) {
    const base = calculateAcSettingsV3(people, roomSize, 15, temp, humidity);
    const v3 = calculateCoolSenseV3Settings(people, roomSize, 15, temp, humidity, "neutral");
    assertEquals(v3.power_kw <= base.power_kw, true, `v3 ${v3.power_kw} > base ${base.power_kw}`);
  }
});

Deno.test("comfort_preference defaults to neutral (no offset) when omitted", () => {
  const withDefault = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60);
  const explicitNeutral = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "neutral");
  assertEquals(withDefault, explicitNeutral);
});

Deno.test("comfort_preference 'warm': +2°C, clamped to moderate's ceiling", () => {
  const v3 = calculateCoolSenseV3Settings(5, "medium", 15, 33, 60, "warm");
  assertEquals(v3.mode, "moderate");
  assertEquals(v3.base_temp_c, 24);
  assertEquals(v3.adjusted_temp_c, 26);
});

Deno.test("comfort_preference 'cold': -2°C, and power_kw rises above the base V3 model", () => {
  const base = calculateAcSettingsV3(5, "medium", 15, 33, 60);
  const v3 = calculateCoolSenseV3Settings(5, "medium", 15, 33, 60, "cold");
  assertEquals(v3.adjusted_temp_c, 22);
  assertEquals(v3.power_kw > base.power_kw, true);
});

Deno.test("comfort_preference ordering: cold power >= neutral power >= warm power, for the same conditions", () => {
  const cold = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "cold");
  const neutral = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "neutral");
  const warm = calculateCoolSenseV3Settings(20, "medium", 15, 33, 60, "warm");
  assertEquals(cold.power_kw >= neutral.power_kw, true);
  assertEquals(neutral.power_kw >= warm.power_kw, true);
});

Deno.test("exact ease-degree math for a moderate-mode mild-condition case", () => {
  // moderate mode (5 people/medium room, density 5/60 = 0.083), 10°C below
  // baseline temp, 20%RH below baseline humidity. tempEase = 0.3*10 = 3,
  // humidityEase = 0.02*20 = 0.4 → raw ease 3.4, clamped to moderate's
  // ceiling (26), base 24 → applied change = 2.
  const v3 = calculateCoolSenseV3Settings(5, "medium", 15, 23, 40);
  assertEquals(v3.mode, "moderate");
  assertEquals(v3.base_temp_c, 24);
  assertEquals(v3.adjusted_temp_c, 26);
  const base = calculateAcSettingsV3(5, "medium", 15, 23, 40);
  assertAlmostEquals(v3.btu_per_hr, base.btu_per_hr * 0.9, 1e-9); // 1 - 0.05*2
});
