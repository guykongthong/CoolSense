import { assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettings, getAcMode } from "./acCalculation.ts";

// Room m² midpoints used for density: small=100, medium=275, large=450.
// Density thresholds: moderate >= 0.05 people/m², full >= 0.15 people/m².
// power_kw = btu_per_hr / (seer * 1000); default seer is the standard 4.5.

Deno.test("small room thresholds (100 m²)", () => {
  assertEquals(getAcMode(4, "small"), "eco"); // 0.04
  assertEquals(getAcMode(5, "small"), "moderate"); // 0.05
  assertEquals(getAcMode(14, "small"), "moderate"); // 0.14
  assertEquals(getAcMode(15, "small"), "full"); // 0.15
});

Deno.test("medium room thresholds (275 m²)", () => {
  assertEquals(getAcMode(13, "medium"), "eco"); // 0.0473
  assertEquals(getAcMode(14, "medium"), "moderate"); // 0.0509
  assertEquals(getAcMode(41, "medium"), "moderate"); // 0.1491
  assertEquals(getAcMode(42, "medium"), "full"); // 0.1527
});

Deno.test("large room thresholds (450 m²)", () => {
  assertEquals(getAcMode(22, "large"), "eco"); // 0.0489
  assertEquals(getAcMode(23, "large"), "moderate"); // 0.0511
  assertEquals(getAcMode(67, "large"), "moderate"); // 0.1489
  assertEquals(getAcMode(68, "large"), "full"); // 0.1511
});

Deno.test("calculateAcSettings returns base settings for eco/moderate", () => {
  assertEquals(calculateAcSettings(0, "medium"), {
    mode: "eco",
    temperature_c: 28,
    fan_speed: 1,
    power_kw: 0.5,
    btu_per_hr: 2250,
  });
  assertEquals(calculateAcSettings(14, "medium"), {
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
  // small room: full density threshold is 15 people (0.15 * 100), base BTU = 20250 * 0.7 = 14175
  assertEquals(calculateAcSettings(15, "small"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 3.15,
    btu_per_hr: 14175,
  });
  assertEquals(calculateAcSettings(20, "small"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 3.4, // (14175 + (20 - 15) * 225) / 4500
    btu_per_hr: 15300,
  });
});

Deno.test("calculateAcSettings scales power+BTU for library-sized crowds", () => {
  // large room: full density threshold is 67.5 people (0.15 * 450), base BTU = 20250 * 1.5 = 30375
  assertEquals(calculateAcSettings(100, "large"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 8.375, // (30375 + (100 - 67.5) * 225) / 4500
    btu_per_hr: 37687.5,
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
  const lowEfficiency = calculateAcSettings(20, "small", 2.25);
  const standard = calculateAcSettings(20, "small", 4.5);
  const highEfficiency = calculateAcSettings(20, "small", 9);

  assertEquals(lowEfficiency.btu_per_hr, 15300);
  assertEquals(standard.btu_per_hr, 15300);
  assertEquals(highEfficiency.btu_per_hr, 15300);

  assertEquals(lowEfficiency.power_kw, 6.8); // 15300 / 2250
  assertEquals(standard.power_kw, 3.4); // 15300 / 4500
  assertEquals(highEfficiency.power_kw, 1.7); // 15300 / 9000
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
