// Regression tests for RRULE COUNT/UNTIL handling in expandOccurrences.
// Stops finite series from years ago being projected into the current week.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Re-implement a thin shim to reach the internal function without exporting.
// We import via dynamic eval of the source for test isolation.
const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
// Extract the expandOccurrences + parseIcsDate definitions for unit testing.
// We compile a small module that re-exports them.
const stub = src
  .replace(/Deno\.serve\([\s\S]*$/m, "")
  .concat("\nexport { expandOccurrences, parseIcsDate };\n");
const mod = await import(
  "data:application/typescript;base64," + btoa(unescape(encodeURIComponent(stub)))
);

const { expandOccurrences } = mod as {
  expandOccurrences: (
    ev: any,
    windowStart: Date,
    windowEnd: Date,
  ) => Array<{ start: Date; end: Date }>;
};

Deno.test("finite COUNT series from 2022 does not leak into 2026 window", () => {
  // Mirrors RRULE:FREQ=WEEKLY;COUNT=17;BYDAY=MO,WE on a 2022-10-12 master.
  const ev = {
    uid: "ruminate-2022",
    start: { date: new Date("2022-10-12T21:00:00Z"), allDay: false },
    end: { date: new Date("2022-10-12T22:00:00Z"), allDay: false },
    rrule: { FREQ: "WEEKLY", COUNT: "17", BYDAY: "MO,WE", WKST: "SU" },
    exdates: [],
  };
  const occ = expandOccurrences(ev, new Date("2026-05-12T00:00:00Z"), new Date("2027-05-12T00:00:00Z"));
  assertEquals(occ.length, 0, "stale finite series must yield no future occurrences");
});

Deno.test("finite COUNT=2 series from 2022 (Rewire Neuro Sprint Demo)", () => {
  const ev = {
    uid: "rewire-2022",
    start: { date: new Date("2022-03-01T19:00:00Z"), allDay: false },
    end: { date: new Date("2022-03-01T20:00:00Z"), allDay: false },
    rrule: { FREQ: "WEEKLY", COUNT: "2", BYDAY: "TU", WKST: "SU" },
    exdates: [],
  };
  const occ = expandOccurrences(ev, new Date("2026-05-12T00:00:00Z"), new Date("2027-05-12T00:00:00Z"));
  assertEquals(occ.length, 0);
});

Deno.test("UNTIL in the past prevents future occurrences", () => {
  const ev = {
    uid: "tst4-2023",
    start: { date: new Date("2023-04-14T16:30:00Z"), allDay: false },
    end: { date: new Date("2023-04-14T16:45:00Z"), allDay: false },
    rrule: { FREQ: "WEEKLY", UNTIL: "20230515T000000Z", BYDAY: "TU,WE,TH,FR", WKST: "SU" },
    exdates: [],
  };
  const occ = expandOccurrences(ev, new Date("2026-05-12T00:00:00Z"), new Date("2027-05-12T00:00:00Z"));
  assertEquals(occ.length, 0);
});

Deno.test("ongoing weekly series still yields current-week occurrences", () => {
  // Started in 2024, no UNTIL/COUNT — should produce events in the 2026 window.
  const ev = {
    uid: "ongoing",
    start: { date: new Date("2024-01-01T15:00:00Z"), allDay: false },
    end: { date: new Date("2024-01-01T16:00:00Z"), allDay: false },
    rrule: { FREQ: "WEEKLY", BYDAY: "MO", WKST: "SU" },
    exdates: [],
  };
  const occ = expandOccurrences(
    ev,
    new Date("2026-05-11T00:00:00Z"),
    new Date("2026-05-25T00:00:00Z"),
  );
  // At least one Monday should fall in this 2-week window.
  if (occ.length === 0) throw new Error("expected at least one occurrence");
});
