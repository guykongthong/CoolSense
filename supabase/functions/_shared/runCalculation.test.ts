import { assertEquals } from "jsr:@std/assert@1";
import { applyCapacityCeiling } from "./runCalculation.ts";

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
