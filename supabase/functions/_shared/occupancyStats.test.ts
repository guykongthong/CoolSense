import { assertEquals } from "jsr:@std/assert@1";
import { findPeakOccupancy, getUtcDayStart } from "./occupancyStats.ts";

Deno.test("findPeakOccupancy: empty input returns zero with no timestamp", () => {
  assertEquals(findPeakOccupancy([]), { people_count: 0, captured_at: null });
});

Deno.test("findPeakOccupancy: single reading is its own peak", () => {
  const reading = { people_count: 5, captured_at: "2026-08-13T10:00:00.000Z" };
  assertEquals(findPeakOccupancy([reading]), reading);
});

Deno.test("findPeakOccupancy: picks the highest people_count regardless of order", () => {
  const readings = [
    { people_count: 3, captured_at: "2026-08-13T09:00:00.000Z" },
    { people_count: 12, captured_at: "2026-08-13T10:00:00.000Z" },
    { people_count: 7, captured_at: "2026-08-13T11:00:00.000Z" },
  ];
  assertEquals(findPeakOccupancy(readings), { people_count: 12, captured_at: "2026-08-13T10:00:00.000Z" });
});

Deno.test("findPeakOccupancy: ties keep the earliest occurrence", () => {
  const readings = [
    { people_count: 9, captured_at: "2026-08-13T09:00:00.000Z" },
    { people_count: 9, captured_at: "2026-08-13T15:00:00.000Z" },
  ];
  assertEquals(findPeakOccupancy(readings).captured_at, "2026-08-13T09:00:00.000Z");
});

Deno.test("findPeakOccupancy: all-zero readings still reports zero, not undefined", () => {
  const readings = [
    { people_count: 0, captured_at: "2026-08-13T00:00:00.000Z" },
    { people_count: 0, captured_at: "2026-08-13T01:00:00.000Z" },
  ];
  assertEquals(findPeakOccupancy(readings).people_count, 0);
});

Deno.test("getUtcDayStart: truncates to midnight UTC of the given day", () => {
  const now = new Date("2026-08-13T15:42:07.123Z");
  assertEquals(getUtcDayStart(now).toISOString(), "2026-08-13T00:00:00.000Z");
});

Deno.test("getUtcDayStart: defaults to the current time when no argument is given", () => {
  const result = getUtcDayStart();
  assertEquals(result.getUTCHours(), 0);
  assertEquals(result.getUTCMinutes(), 0);
});
