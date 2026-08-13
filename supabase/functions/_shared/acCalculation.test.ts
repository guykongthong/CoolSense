import { assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettings, getAcMode } from "./acCalculation.ts";

// Room m² midpoints used for density: small=30, medium=60, large=120.
// Density thresholds: moderate >= 0.05 people/m², full >= 0.15 people/m².
// power_kw = btu_per_hr / (seer * 1000); default seer is the standard 4.5.

Deno.test("small room thresholds (30 m²)", () => {
  assertEquals(getAcMode(1, "small"), "eco"); // 0.0333
  assertEquals(getAcMode(2, "small"), "moderate"); // 0.0667
  assertEquals(getAcMode(4, "small"), "moderate"); // 0.1333
  assertEquals(getAcMode(5, "small"), "full"); // 0.1667
});

Deno.test("medium room thresholds (60 m²)", () => {
  assertEquals(getAcMode(2, "medium"), "eco"); // 0.0333
  assertEquals(getAcMode(3, "medium"), "moderate"); // 0.05
  assertEquals(getAcMode(8, "medium"), "moderate"); // 0.1333
  assertEquals(getAcMode(9, "medium"), "full"); // 0.15
});

Deno.test("large room thresholds (120 m²)", () => {
  assertEquals(getAcMode(5, "large"), "eco"); // 0.0417
  assertEquals(getAcMode(6, "large"), "moderate"); // 0.05
  assertEquals(getAcMode(17, "large"), "moderate"); // 0.1417
  assertEquals(getAcMode(18, "large"), "full"); // 0.15
});

Deno.test("calculateAcSettings returns base settings for eco/moderate", () => {
  assertEquals(calculateAcSettings(0, "medium"), {
    mode: "eco",
    temperature_c: 26,
    fan_speed: 1,
    power_kw: 0.5,
    btu_per_hr: 2250,
  });
  assertEquals(calculateAcSettings(3, "medium"), {
    mode: "moderate",
    temperature_c: 24,
    fan_speed: 2,
    power_kw: 2.5,
    btu_per_hr: 11250,
  });
});

Deno.test("calculateAcSettings applies the room-size multiplier to BTU and power", () => {
  assertEquals(calculateAcSettings(0, "small").power_kw, 0.35); // 2250 * 0.7 / 4500
  assertEquals(calculateAcSettings(0, "small").btu_per_hr, 1575);
  assertEquals(calculateAcSettings(0, "medium").power_kw, 0.5);
  assertEquals(calculateAcSettings(0, "medium").btu_per_hr, 2250);
  assertEquals(calculateAcSettings(0, "large").power_kw, 0.75); // 2250 * 1.5 / 4500
  assertEquals(calculateAcSettings(0, "large").btu_per_hr, 3375);
});

Deno.test("calculateAcSettings holds temp/fan but scales power+BTU in full mode", () => {
  // small room: full density threshold is 4.5 people (0.15 * 30), base BTU = 20250 * 0.7 = 14175
  assertEquals(calculateAcSettings(5, "small"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 3.175, // (14175 + (5 - 4.5) * 225) / 4500
    btu_per_hr: 14287.5,
  });
  assertEquals(calculateAcSettings(10, "small"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 3.425, // (14175 + (10 - 4.5) * 225) / 4500
    btu_per_hr: 15412.5,
  });
});

Deno.test("calculateAcSettings scales power+BTU for library-sized crowds", () => {
  // large room: full density threshold is 18 people (0.15 * 120), base BTU = 20250 * 1.5 = 30375
  assertEquals(calculateAcSettings(40, "large"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 7.85, // (30375 + (40 - 18) * 225) / 4500
    btu_per_hr: 35325,
  });
});

Deno.test("calculateAcSettings defaults to the standard SEER (4.5) when omitted — power unchanged", () => {
  assertEquals(calculateAcSettings(0, "medium").power_kw, 0.5);
  assertEquals(calculateAcSettings(0, "medium", 4.5).power_kw, 0.5);
});

Deno.test("calculateAcSettings scales power down for a more efficient unit", () => {
  // SEER 9 vs standard 4.5 → half the power for the same BTU/hr
  assertEquals(calculateAcSettings(0, "medium", 9).power_kw, 0.25); // 2250 / (9 * 1000)
  assertEquals(calculateAcSettings(0, "small", 9).power_kw, 0.175); // 1575 / (9 * 1000)
});

Deno.test("calculateAcSettings scales power up for a less efficient unit", () => {
  // SEER 2.25 vs standard 4.5 → double the power for the same BTU/hr
  assertEquals(calculateAcSettings(0, "medium", 2.25).power_kw, 1.0); // 2250 / (2.25 * 1000)
});

Deno.test("calculateAcSettings keeps required BTU/hr constant across SEER — only power_kw changes", () => {
  const lowEfficiency = calculateAcSettings(10, "small", 2.25);
  const standard = calculateAcSettings(10, "small", 4.5);
  const highEfficiency = calculateAcSettings(10, "small", 9);

  assertEquals(lowEfficiency.btu_per_hr, 15412.5);
  assertEquals(standard.btu_per_hr, 15412.5);
  assertEquals(highEfficiency.btu_per_hr, 15412.5);

  assertEquals(lowEfficiency.power_kw, 6.85); // 15412.5 / 2250
  assertEquals(standard.power_kw, 3.425); // 15412.5 / 4500
  assertEquals(highEfficiency.power_kw, 1.7125); // 15412.5 / 9000
});

Deno.test("calculateAcSettings defaults to baseline weather (33°C, 60% RH) when omitted — unchanged", () => {
  assertEquals(calculateAcSettings(0, "medium").btu_per_hr, 2250);
  assertEquals(calculateAcSettings(0, "medium", 4.5, 33, 60).btu_per_hr, 2250);
});

Deno.test("calculateAcSettings raises required BTU/hr for hotter-than-baseline outside temp", () => {
  // 43°C is 10° above the 33° baseline → +2%/°C = 1.2x
  const settings = calculateAcSettings(0, "medium", 4.5, 43, 60);
  assertEquals(settings.btu_per_hr, 2700); // 2250 * 1.2
  assertEquals(settings.power_kw, 0.6);
});

Deno.test("calculateAcSettings raises required BTU/hr for higher-than-baseline humidity", () => {
  // 90% RH is 30 points above the 60% baseline → +0.3%/point = 1.09x
  const settings = calculateAcSettings(0, "medium", 4.5, 33, 90);
  assertEquals(settings.btu_per_hr, 2452.5); // 2250 * 1.09
});

Deno.test("calculateAcSettings combines temperature and humidity load factors", () => {
  // 38°C (+5°) and 80% RH (+20 points) → 1 + 0.02*5 + 0.003*20 = 1.16x
  const settings = calculateAcSettings(0, "medium", 4.5, 38, 80);
  assertEquals(Math.round(settings.btu_per_hr * 100) / 100, 2610); // 2250 * 1.16
});

Deno.test("calculateAcSettings floors the weather multiplier so mild/dry days can't go negative", () => {
  // 3°C and 0% RH would compute to 0.22x without the floor — clamps to 0.5x
  const settings = calculateAcSettings(0, "medium", 4.5, 3, 0);
  assertEquals(settings.btu_per_hr, 1125); // 2250 * 0.5
  assertEquals(settings.power_kw, 0.25);
});
