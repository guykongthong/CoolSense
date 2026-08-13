import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { calculateAcSettingsV3, ENVELOPE_LOAD_BTU_PER_SQM, PERSON_LOAD_BTU_PER_HR, STANDARD_SEER_V3 } from "./acCalculationV3.ts";

// required_btu_per_hr = ENVELOPE_LOAD_BTU_PER_SQM * room_m² + PERSON_LOAD_BTU_PER_HR * people_count
// power_kw = btu_per_hr / (seer * 1000). Room m²: small=100, medium=275, large=450.

Deno.test("constants match the design spec", () => {
  assertEquals(ENVELOPE_LOAD_BTU_PER_SQM, 150);
  assertEquals(PERSON_LOAD_BTU_PER_HR, 400);
  assertEquals(STANDARD_SEER_V3, 15);
});

Deno.test("calculateAcSettingsV3 at 0 people, baseline weather: pure envelope load, scales linearly with room m²", () => {
  assertEquals(calculateAcSettingsV3(0, "small"), { mode: "eco", temperature_c: 26, fan_speed: 1, power_kw: 1.0, btu_per_hr: 15000 });
  assertEquals(calculateAcSettingsV3(0, "medium"), { mode: "eco", temperature_c: 26, fan_speed: 1, power_kw: 2.75, btu_per_hr: 41250 });
  assertEquals(calculateAcSettingsV3(0, "large"), { mode: "eco", temperature_c: 26, fan_speed: 1, power_kw: 4.5, btu_per_hr: 67500 });
});

Deno.test("calculateAcSettingsV3 adds per-person load on top of envelope load, at every mode (not just beyond a threshold)", () => {
  // medium, moderate mode (14 people, density 0.0509): 150*275 + 400*14 = 41250 + 5600 = 46850
  const moderate = calculateAcSettingsV3(14, "medium");
  assertEquals(moderate.mode, "moderate");
  assertEquals(moderate.btu_per_hr, 46850);
  assertAlmostEquals(moderate.power_kw, 46850 / 15000, 1e-9);

  // medium, full mode (42 people, density 0.1527): 41250 + 400*42 = 41250 + 16800 = 58050
  const full = calculateAcSettingsV3(42, "medium");
  assertEquals(full.mode, "full");
  assertEquals(full.btu_per_hr, 58050);
  assertEquals(full.power_kw, 3.87);
});

Deno.test("calculateAcSettingsV3 mode/temperature/fan selection matches acCalculation.ts's thresholds", () => {
  assertEquals(calculateAcSettingsV3(4, "small").mode, "eco");
  assertEquals(calculateAcSettingsV3(5, "small").mode, "moderate");
  assertEquals(calculateAcSettingsV3(15, "small").mode, "full");
  assertEquals(calculateAcSettingsV3(15, "small").temperature_c, 21);
  assertEquals(calculateAcSettingsV3(15, "small").fan_speed, 3);
});

Deno.test("calculateAcSettingsV3 defaults to STANDARD_SEER_V3 (15) when seer omitted", () => {
  assertEquals(calculateAcSettingsV3(0, "medium").power_kw, calculateAcSettingsV3(0, "medium", 15).power_kw);
});

Deno.test("calculateAcSettingsV3 scales power for a realistic custom SEER (13-25 range)", () => {
  // medium, 0 people, baseline weather: btu_per_hr = 41250
  assertAlmostEquals(calculateAcSettingsV3(0, "medium", 20).power_kw, 41250 / 20000, 1e-9);
  assertAlmostEquals(calculateAcSettingsV3(0, "medium", 13).power_kw, 41250 / 13000, 1e-9);
});

Deno.test("calculateAcSettingsV3 keeps required BTU/hr constant across SEER — only power_kw changes", () => {
  const low = calculateAcSettingsV3(14, "medium", 13);
  const standard = calculateAcSettingsV3(14, "medium", 15);
  const high = calculateAcSettingsV3(14, "medium", 25);
  assertEquals(low.btu_per_hr, 46850);
  assertEquals(standard.btu_per_hr, 46850);
  assertEquals(high.btu_per_hr, 46850);
});

Deno.test("calculateAcSettingsV3 reuses acCalculation.ts's weather multiplier — hotter-than-baseline raises required BTU/hr", () => {
  // medium, 0 people, 43°C (10° above 33° baseline) → +2%/°C = 1.2x on 41250
  const settings = calculateAcSettingsV3(0, "medium", 15, 43, 60);
  assertEquals(settings.btu_per_hr, 49500); // 41250 * 1.2
  assertEquals(settings.power_kw, 3.3);
});

Deno.test("calculateAcSettingsV3 defaults to baseline weather (33°C/60% RH) when omitted", () => {
  assertEquals(calculateAcSettingsV3(0, "medium").btu_per_hr, calculateAcSettingsV3(0, "medium", 15, 33, 60).btu_per_hr);
});
