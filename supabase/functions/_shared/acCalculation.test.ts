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

Deno.test("calculateAcSettings returns base settings for mode", () => {
  assertEquals(calculateAcSettings(0, "medium"), {
    mode: "eco",
    temperature_c: 28,
    fan_speed: 1,
    power_kw: 0.5,
  });
  assertEquals(calculateAcSettings(10, "small"), {
    mode: "full",
    temperature_c: 21,
    fan_speed: 3,
    power_kw: 4.5,
  });
});
