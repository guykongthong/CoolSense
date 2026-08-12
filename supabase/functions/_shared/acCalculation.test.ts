import { assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettings, getAcMode } from "./acCalculation.ts";

// Room m² midpoints used for density: small=100, medium=275, large=450.
// Density thresholds: moderate >= 0.05 people/m², full >= 0.15 people/m².

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
  });
  assertEquals(calculateAcSettings(14, "medium"), {
    mode: "moderate",
    temperature_c: 24,
    fan_speed: 2,
    power_kw: 2.5,
  });
});

Deno.test("calculateAcSettings applies the room-size power multiplier", () => {
  assertEquals(calculateAcSettings(0, "small").power_kw, 0.35); // 0.5 * 0.7
  assertEquals(calculateAcSettings(0, "medium").power_kw, 0.5); // 0.5 * 1.0
  assertEquals(calculateAcSettings(0, "large").power_kw, 0.75); // 0.5 * 1.5
});

Deno.test("calculateAcSettings holds temp/fan but scales power in full mode", () => {
  // small room: full density threshold is 15 people (0.15 * 100), base power = 4.5 * 0.7 = 3.15
  assertEquals(calculateAcSettings(15, "small"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 3.15,
  });
  assertEquals(calculateAcSettings(20, "small"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 3.4, // 3.15 + (20 - 15) * 0.05
  });
});

Deno.test("calculateAcSettings scales power for library-sized crowds", () => {
  // large room: full density threshold is 67.5 people (0.15 * 450), base power = 4.5 * 1.5 = 6.75
  assertEquals(calculateAcSettings(100, "large"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 8.375, // 6.75 + (100 - 67.5) * 0.05
  });
});

Deno.test("calculateAcSettings defaults to the standard SEER (4.5) when omitted — power unchanged", () => {
  assertEquals(calculateAcSettings(0, "medium").power_kw, 0.5);
  assertEquals(calculateAcSettings(0, "medium", 4.5).power_kw, 0.5);
});

Deno.test("calculateAcSettings scales power down for a more efficient unit", () => {
  // SEER 9 vs standard 4.5 → multiplier 0.5
  assertEquals(calculateAcSettings(0, "medium", 9).power_kw, 0.25); // 0.5 * 1.0 * (4.5/9)
  assertEquals(calculateAcSettings(0, "small", 9).power_kw, 0.175); // 0.5 * 0.7 * (4.5/9)
});

Deno.test("calculateAcSettings scales power up for a less efficient unit", () => {
  // SEER 2.25 vs standard 4.5 → multiplier 2
  assertEquals(calculateAcSettings(0, "medium", 2.25).power_kw, 1.0); // 0.5 * 1.0 * (4.5/2.25)
});

Deno.test("calculateAcSettings applies the efficiency multiplier to the full-mode extra-person scaling too", () => {
  // small room, SEER 9 (multiplier 0.5): base power = 4.5 * 0.7 * 0.5 = 1.575
  assertEquals(calculateAcSettings(20, "small", 9), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 1.7, // 1.575 + (20 - 15) * 0.05 * 0.5
  });
});
