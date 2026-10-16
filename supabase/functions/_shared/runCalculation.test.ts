import { assertEquals } from "jsr:@std/assert@1";
import { applyCapacityCeiling } from "./runCalculation.ts";
import { DEFAULT_STATIC_TEMP_C, staticV3BaselinePowerKw } from "./simulation.ts";
import { FULL_DENSITY, ROOM_SIZE_SQM } from "./acCalculation.ts";
import { calculateCoolSenseV3Settings } from "./coolSenseV3Calculation.ts";

Deno.test("applyCapacityCeiling: no rated capacity set — no-op", () => {
  const result = applyCapacityCeiling(46850, 3.123333333333333, 15, null);
  assertEquals(result, { power_kw: 3.123333333333333, capacity_constrained: false });
});

Deno.test("applyCapacityCeiling: rated capacity meets or exceeds requirement — no-op", () => {
  const exact = applyCapacityCeiling(46850, 3.1233333333333335, 15, 46850);
  assertEquals(exact, { power_kw: 3.1233333333333335, capacity_constrained: false });

  const oversized = applyCapacityCeiling(46850, 3.1233333333333335, 15, 60000);
  assertEquals(oversized, { power_kw: 3.1233333333333335, capacity_constrained: false });
});

Deno.test("applyCapacityCeiling: undersized unit caps power at what it can actually draw", () => {
  // Required 46850 BTU/hr, but the unit is only rated for 30000 BTU/hr at SEER 15.
  const result = applyCapacityCeiling(46850, 3.1233333333333335, 15, 30000);
  assertEquals(result.capacity_constrained, true);
  assertEquals(result.power_kw, 30000 / (15 * 1000)); // 2.0 — the unit's own max draw
  assertEquals(result.power_kw < 3.1233333333333335, true); // capped below the uncapped draw
});

Deno.test("applyCapacityCeiling: capped power scales with the unit's own SEER, not the required BTU's", () => {
  const seer10 = applyCapacityCeiling(46850, 4.685, 10, 20000);
  assertEquals(seer10.power_kw, 2.0); // 20000 / (10*1000)
  assertEquals(seer10.capacity_constrained, true);
});

Deno.test("baseline power is at least CoolSense power at full occupancy in the same weather", () => {
  for (const roomSize of ["small", "medium", "large"] as const) {
    const fullPeople = Math.ceil(FULL_DENSITY * ROOM_SIZE_SQM[roomSize]);
    for (const [tempC, humidityPct] of [[28, 60], [33, 60], [36, 80]]) {
      const smart = calculateCoolSenseV3Settings(fullPeople, roomSize, 15, tempC, humidityPct, "neutral");
      const baseline = staticV3BaselinePowerKw(roomSize, 15, DEFAULT_STATIC_TEMP_C, tempC, humidityPct);
      assertEquals(baseline >= smart.power_kw, true, `${roomSize} ${tempC}C`);
    }
  }
});

Deno.test("baseline power is higher in an empty room than CoolSense power", () => {
  const smart = calculateCoolSenseV3Settings(0, "medium", 15, 33, 60, "neutral");
  const baseline = staticV3BaselinePowerKw("medium", 15, DEFAULT_STATIC_TEMP_C, 33, 60);
  assertEquals(baseline > smart.power_kw, true);
});
