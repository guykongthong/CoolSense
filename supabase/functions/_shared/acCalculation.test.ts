import { assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettings, getAcMode } from "./acCalculation.ts";

Deno.test("small room thresholds", () => {
  assertEquals(getAcMode(0, "small"), "eco");
  assertEquals(getAcMode(1, "small"), "moderate");
  assertEquals(getAcMode(2, "small"), "moderate");
  assertEquals(getAcMode(3, "small"), "full");
});

Deno.test("medium room thresholds", () => {
  assertEquals(getAcMode(0, "medium"), "eco");
  assertEquals(getAcMode(3, "medium"), "moderate");
  assertEquals(getAcMode(4, "medium"), "full");
});

Deno.test("large room thresholds", () => {
  assertEquals(getAcMode(0, "large"), "eco");
  assertEquals(getAcMode(4, "large"), "moderate");
  assertEquals(getAcMode(5, "large"), "full");
});

Deno.test("calculateAcSettings returns base settings for eco/moderate", () => {
  assertEquals(calculateAcSettings(0, "medium"), {
    mode: "eco",
    temperature_c: 28,
    fan_speed: 1,
    power_kw: 0.5,
  });
  assertEquals(calculateAcSettings(1, "medium"), {
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
  // small room: full threshold is 3 people, base power = 4.5 * 0.7 = 3.15
  assertEquals(calculateAcSettings(3, "small"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 3.15,
  });
  assertEquals(calculateAcSettings(10, "small"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 3.5, // 3.15 + (10 - 3) * 0.05
  });
});

Deno.test("calculateAcSettings scales power for library-sized crowds", () => {
  // large room: full threshold is 5 people, base power = 4.5 * 1.5 = 6.75
  assertEquals(calculateAcSettings(100, "large"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 11.5, // 6.75 + (100 - 5) * 0.05
  });
});
