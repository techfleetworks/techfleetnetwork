// Guard: the app's definition of "which lessons make up each course" and the DB's
// definition (public.lesson_catalog) must never drift apart. This is the last drift
// seam from ADR-0050 / stats-integrity-prd.md §9: the course cards + the client specs
// sent to get_course_completion_counts use the app arrays, while get_network_stats'
// core-completion count uses lesson_catalog's active+required rows. If they disagree, a
// card and its dashboard tile silently disagree (the historical Onboarding 6→8 class).
//
// One canonical source: src/data/course-definition.fixture.json. This BLOCKING guard
// (runs in gate-test) proves every other home equals it, all statically:
//   1. the app arrays (ALL_*_LESSON_IDS / FIRST_STEPS_TASK_IDS / CONNECT_DISCORD_TASK_IDS)
//      and their TOTAL_* counts,
//   2. the COURSE_COMPLETION_SPECS wiring in src/pages/TrainingPage.tsx (the phase +
//      task-id array the client actually sends to the RPC),
//   3. the SQL literals embedded in supabase/tests/course_definition_parity_test.sql,
//   4. the public.lesson_catalog / course_catalog seed in migration 20260520035523_*.sql.
// The pgTAP guard (db-test) independently proves the fixture against the LIVE migrated DB
// (active/required-aware), catching any later migration that mutates the catalog.
// Change one home without the others and this guard (or pgTAP) goes red.
//
// See docs/adr/0053-course-definition-parity-guard.md.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { ALL_AGILE_LESSON_IDS, TOTAL_AGILE_LESSONS } from "@/data/agile-course";
import { ALL_DISCORD_LESSON_IDS, TOTAL_DISCORD_LESSONS } from "@/data/discord-course";
import { ALL_OBSERVER_LESSON_IDS, TOTAL_OBSERVER_LESSONS } from "@/data/observer-course";
import { ALL_TEAMWORK_LESSON_IDS, TOTAL_TEAMWORK_LESSONS } from "@/data/teamwork-course";
import {
  ALL_PROJECT_TRAINING_LESSON_IDS,
  TOTAL_PROJECT_TRAINING_LESSONS,
} from "@/data/project-training-course";
import { ALL_VOLUNTEER_LESSON_IDS, TOTAL_VOLUNTEER_LESSONS } from "@/data/volunteer-teams-course";
import { FIRST_STEPS_TASK_IDS, TOTAL_FIRST_STEPS } from "@/pages/FirstStepsPage";
import { CONNECT_DISCORD_TASK_IDS, TOTAL_CONNECT_DISCORD } from "@/pages/ConnectDiscordPage";

// ── Load the canonical fixture (via fs + JSON.parse — matches the smoke-test
//    convention and needs no resolveJsonModule) ──────────────────────────────
const ROOT = process.cwd();
type CourseDef = { phase: string; required_lesson_ids: string[] };
const fixture: { courses: Record<string, CourseDef> } = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "data", "course-definition.fixture.json"), "utf8")
);
const COURSES = fixture.courses;
const COURSE_KEYS = Object.keys(COURSES).sort();

// ── The app arrays keyed by course, plus their TOTAL_* and the exact symbol +
//    phase the TrainingPage spec must wire for each course ─────────────────────
const APP: Record<
  string,
  { ids: readonly string[]; total: number; symbol: string; phase: string }
> = {
  "connect-discord": {
    ids: CONNECT_DISCORD_TASK_IDS,
    total: TOTAL_CONNECT_DISCORD,
    symbol: "CONNECT_DISCORD_TASK_IDS",
    phase: "first_steps",
  },
  onboarding: {
    ids: FIRST_STEPS_TASK_IDS,
    total: TOTAL_FIRST_STEPS,
    symbol: "FIRST_STEPS_TASK_IDS",
    phase: "first_steps",
  },
  "agile-mindset": {
    ids: ALL_AGILE_LESSON_IDS,
    total: TOTAL_AGILE_LESSONS,
    symbol: "ALL_AGILE_LESSON_IDS",
    phase: "second_steps",
  },
  "observer-course": {
    ids: ALL_OBSERVER_LESSON_IDS,
    total: TOTAL_OBSERVER_LESSONS,
    symbol: "ALL_OBSERVER_LESSON_IDS",
    phase: "observer",
  },
  "agile-teamwork": {
    ids: ALL_TEAMWORK_LESSON_IDS,
    total: TOTAL_TEAMWORK_LESSONS,
    symbol: "ALL_TEAMWORK_LESSON_IDS",
    phase: "third_steps",
  },
  "project-training": {
    ids: ALL_PROJECT_TRAINING_LESSON_IDS,
    total: TOTAL_PROJECT_TRAINING_LESSONS,
    symbol: "ALL_PROJECT_TRAINING_LESSON_IDS",
    phase: "project_training",
  },
  "volunteer-teams": {
    ids: ALL_VOLUNTEER_LESSON_IDS,
    total: TOTAL_VOLUNTEER_LESSONS,
    symbol: "ALL_VOLUNTEER_LESSON_IDS",
    phase: "volunteer",
  },
  "discord-learning": {
    ids: ALL_DISCORD_LESSON_IDS,
    total: TOTAL_DISCORD_LESSONS,
    symbol: "ALL_DISCORD_LESSON_IDS",
    phase: "discord_learning",
  },
};

const sortedSet = (ids: readonly string[]) => [...ids].sort();
const hasDuplicates = (ids: readonly string[]) => new Set(ids).size !== ids.length;

// ── Parse the embedded literals out of the pgTAP guard ────────────────────────
const pgtap = fs.readFileSync(
  path.join(ROOT, "supabase", "tests", "course_definition_parity_test.sql"),
  "utf8"
);
function sliceBetween(text: string, begin: string, end: string): string {
  const b = text.indexOf(begin);
  const e = text.indexOf(end);
  if (b < 0 || e < 0 || e <= b) return "";
  return text.slice(b + begin.length, e);
}
function parsePairs(block: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /\('([^']+)','([^']+)'\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push([m[1], m[2]]);
  return out;
}
const pgPairBlock = sliceBetween(pgtap, "PARITY-PAIRS-BEGIN", "PARITY-PAIRS-END");
const pgPhaseBlock = sliceBetween(pgtap, "PARITY-PHASES-BEGIN", "PARITY-PHASES-END");
const pgLessonsByCourse: Record<string, string[]> = {};
for (const [course, lesson] of parsePairs(pgPairBlock)) {
  (pgLessonsByCourse[course] ||= []).push(lesson);
}
const pgPhaseByCourse: Record<string, string> = {};
for (const [course, phase] of parsePairs(pgPhaseBlock)) pgPhaseByCourse[course] = phase;

// ── Parse the DB seed out of the authoritative migration ──────────────────────
const migration = fs.readFileSync(
  path.join(
    ROOT,
    "supabase",
    "migrations",
    "20260520035523_115783bd-e683-43ed-8a98-69e247011b34.sql"
  ),
  "utf8"
);
function insertBlock(sql: string, marker: string): string {
  const start = sql.indexOf(marker);
  if (start < 0) return "";
  const semi = sql.indexOf(";", start);
  return semi < 0 ? sql.slice(start) : sql.slice(start, semi);
}
// lesson_catalog rows: ('lesson_id','course_key','phase',display_order). The seed omits
// the `required`/`active` columns, so every seeded row defaults to required=true, active=true
// — this static parser therefore treats every seeded row as required+active. If a future
// migration ever seeds an optional (required=false) or inactive lesson, teach this parser to
// read those columns; the pgTAP guard already filters on `active AND required` against the
// live DB, so it stays correct regardless.
const lessonSeedBlock = insertBlock(migration, "INSERT INTO public.lesson_catalog");
const seedLessonsByCourse: Record<string, string[]> = {};
const seedLessonPhase: Record<string, string> = {};
{
  const re = /\('([^']+)','([^']+)','([^']+)',\s*\d+\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lessonSeedBlock))) {
    const [, lessonId, courseKey, phase] = m;
    (seedLessonsByCourse[courseKey] ||= []).push(lessonId);
    seedLessonPhase[lessonId] = phase;
  }
}
// course_catalog rows: ('course_key','phase','tier','label',order)
const courseSeedBlock = insertBlock(migration, "INSERT INTO public.course_catalog");
const seedCoursePhase: Record<string, string> = {};
{
  const re = /\('([^']+)','([^']+)','[^']+',/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(courseSeedBlock))) seedCoursePhase[m[1]] = m[2];
}

const trainingPage = fs.readFileSync(path.join(ROOT, "src", "pages", "TrainingPage.tsx"), "utf8");

describe("Course-definition parity — one canonical source, four locked homes", () => {
  it("fixture is well-formed: 8 courses, non-empty, no duplicate lesson ids", () => {
    expect(COURSE_KEYS.length).toBe(8);
    for (const key of COURSE_KEYS) {
      const def = COURSES[key];
      expect(def.required_lesson_ids.length, `${key} has lessons`).toBeGreaterThan(0);
      expect(hasDuplicates(def.required_lesson_ids), `${key} has no dup lesson ids`).toBe(false);
      expect(typeof def.phase).toBe("string");
    }
  });

  it("every fixture course_key maps to a known app array (no orphan on either side)", () => {
    expect(Object.keys(APP).sort()).toEqual(COURSE_KEYS);
  });

  // 1 — app arrays + TOTAL_* equal the fixture
  it("app *_TASK_IDS arrays and TOTAL_* equal the fixture (per course)", () => {
    for (const key of COURSE_KEYS) {
      const def = COURSES[key];
      const app = APP[key];
      expect(sortedSet(app.ids), `${key}: app array === fixture`).toEqual(
        sortedSet(def.required_lesson_ids)
      );
      // The keystone from PRD §4: TOTAL_* === task_ids.length, so "completed all
      // task_ids" is identical to the card's own "Complete" test.
      expect(app.total, `${key}: TOTAL_* === lesson count`).toBe(def.required_lesson_ids.length);
      expect(app.phase, `${key}: app phase === fixture phase`).toBe(def.phase);
    }
  });

  // 2 — TrainingPage's COURSE_COMPLETION_SPECS wires each course to the right
  //     phase + task-id array (the values the client sends to the RPC)
  it("TrainingPage COURSE_COMPLETION_SPECS wires the canonical phase + array per course", () => {
    for (const key of COURSE_KEYS) {
      const { phase, symbol } = APP[key];
      const re = new RegExp(
        `key:\\s*"${key}",\\s*phase:\\s*"${phase}",\\s*task_ids:\\s*${symbol}\\b`
      );
      expect(re.test(trainingPage), `TrainingPage wires ${key} → ${phase} / ${symbol}`).toBe(true);
    }
    // No extra/renamed specs slipped in: exactly 8 spec entries.
    const specCount = (trainingPage.match(/key:\s*"[^"]+",\s*phase:/g) || []).length;
    expect(specCount).toBe(8);
  });

  // 3 — the pgTAP embedded literals equal the fixture
  it("pgTAP embedded PARITY literals equal the fixture (lessons + phases + course set)", () => {
    expect(Object.keys(pgLessonsByCourse).length, "pgTAP pairs parsed").toBeGreaterThan(0);
    expect(Object.keys(pgLessonsByCourse).sort()).toEqual(COURSE_KEYS);
    for (const key of COURSE_KEYS) {
      expect(sortedSet(pgLessonsByCourse[key]), `${key}: pgTAP lessons === fixture`).toEqual(
        sortedSet(COURSES[key].required_lesson_ids)
      );
      expect(hasDuplicates(pgLessonsByCourse[key]), `${key}: pgTAP no dup lessons`).toBe(false);
      expect(pgPhaseByCourse[key], `${key}: pgTAP phase === fixture`).toBe(COURSES[key].phase);
    }
  });

  // 4 — the DB seed (authoritative migration) equals the fixture
  it("migration lesson_catalog / course_catalog seed equals the fixture", () => {
    expect(Object.keys(seedLessonsByCourse).length, "seed rows parsed").toBeGreaterThan(0);
    expect(Object.keys(seedLessonsByCourse).sort()).toEqual(COURSE_KEYS);
    for (const key of COURSE_KEYS) {
      const def = COURSES[key];
      expect(sortedSet(seedLessonsByCourse[key]), `${key}: DB seed lessons === fixture`).toEqual(
        sortedSet(def.required_lesson_ids)
      );
      expect(seedCoursePhase[key], `${key}: course_catalog phase === fixture`).toBe(def.phase);
      // Every seeded lesson carries its course's phase.
      for (const lessonId of def.required_lesson_ids) {
        expect(seedLessonPhase[lessonId], `${lessonId}: lesson phase === fixture`).toBe(def.phase);
      }
    }
  });
});
