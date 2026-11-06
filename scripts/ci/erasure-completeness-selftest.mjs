#!/usr/bin/env node
/**
 * Discrimination scenarios for check-erasure-completeness.mjs (reaudit RP-C / CMP-2 +
 * verifiable-quality-gates). NOT a guard — the name has no `check-` prefix on purpose, so
 * emit-guard-matrix / check-guard-has-test never treat it as one.
 *
 * Each scenario builds a THROWAWAY fixture repo (its own scripts/ci + supabase/migrations),
 * copies the REAL guard into it (so the guard's self-anchored path resolution points at the
 * fixture), runs the copy, and asserts the exit code. This proves the guard DETECTS what it
 * claims: an unregistered PII table reds (exit 1), a lying/stale registry reds (exit 1), and a
 * missing precondition fails closed (exit 2). If the guard is neutralized (e.g. replaced with a
 * no-op `exit 0`), the "reds" scenarios stop reding and this harness FAILS — that is the
 * mutation/discrimination property the gate must have.
 *
 * Run directly:   node scripts/ci/erasure-completeness-selftest.mjs
 * Override gate:   ERASURE_GATE_OVERRIDE=/path/to/other-gate.mjs node scripts/ci/erasure-completeness-selftest.mjs
 *                  (used to PROVE neutralization reds the harness; defaults to the real guard)
 * Exit 0 iff every scenario's observed exit code matches its expectation.
 */
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_GATE = join(HERE, "check-erasure-completeness.mjs");
const GATE = process.env.ERASURE_GATE_OVERRIDE ? resolve(process.env.ERASURE_GATE_OVERRIDE) : REAL_GATE;

// --- a minimal but REALISTIC baseline fixture: one erased table, one cascade table ----
const FN_MIGRATION = `
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  RETURN OLD;
END;
$function$;
`;
const TBL_PROFILES = `CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
);`;
const TBL_SESSIONS = `CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);`;
const FAKE_PII = `CREATE TABLE public.leaky_pii (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL
);`;
// A table with an INDEPENDENT subject column whose rows are removed only through a NON-identity
// cascade (app_id -> the app owner). The actor/subject rows on someone else's parent would orphan,
// so the gate must NOT auto-cover it; a "cascade" claim needs a same-subject reason.
const APPS = `CREATE TABLE public.apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);`;
const SIGS = `CREATE TABLE public.sigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE
);`;
// F1: the subject column sits after a trailing `--` comment on the previous column line. A scanner
// that does not strip comments never reaches user_id and the table is invisible.
const COMMENT_HIDDEN = `CREATE TABLE public.commented_pii (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- lowercased identity = the key
  user_id uuid NOT NULL,
  email text NOT NULL
);`;
// F2: the subject column is added by a LATER expand migration via ALTER TABLE ADD COLUMN.
const ALTER_ADDED = `CREATE TABLE public.late_pii (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL
);
ALTER TABLE public.late_pii ADD COLUMN user_id uuid NOT NULL;`;
// F4: a function that only INSERTs into a PII table (append), plus that table. "erased" must be false.
const FN_INSERT = `
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  DELETE FROM public.profiles WHERE user_id = OLD.id;
  INSERT INTO public.audit_rows (user_id, note) VALUES (OLD.id, 'erased');
  RETURN OLD;
END;
$function$;
`;
const TBL_AUDIT = `CREATE TABLE public.audit_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  note text NOT NULL
);`;

const baseRegistry = () => ({
  tables: [
    { table: "profiles", identity_columns: ["user_id"], coverage: "erased" },
    { table: "sessions", identity_columns: ["user_id"], coverage: "cascade", cascade_parent: "AUTH" },
  ],
});

/** Build a fixture dir with the given migration files and registry object, copy the gate in. */
function buildFixture({ migrations, registry }) {
  const root = mkdtempSync(join(tmpdir(), "erasure-fix-"));
  mkdirSync(join(root, "scripts", "ci"), { recursive: true });
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  copyFileSync(GATE, join(root, "scripts", "ci", "check-erasure-completeness.mjs"));
  if (registry !== null)
    writeFileSync(join(root, "scripts", "ci", "pii-tables.json"), JSON.stringify(registry, null, 2));
  for (const [name, sql] of Object.entries(migrations))
    writeFileSync(join(root, "supabase", "migrations", name), sql);
  return root;
}

/** Run the copied gate in `root`; return { code, err } (err = stderr, for reason assertions). */
function runGate(root) {
  try {
    execFileSync(process.execPath, [join(root, "scripts", "ci", "check-erasure-completeness.mjs")], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, err: "" };
  } catch (e) {
    if (typeof e.status === "number") return { code: e.status, err: (e.stderr || "").toString() };
    throw e; // a spawn/signal failure is a real error, never a masked exit code
  }
}

const BASE_MIGS = {
  "20260101000000_fn.sql": FN_MIGRATION,
  "20260101000001_tables.sql": TBL_PROFILES + "\n" + TBL_SESSIONS,
};

const scenarios = [
  {
    name: "clean: every PII table covered + registered",
    expect: 0,
    fixture: { migrations: { ...BASE_MIGS }, registry: baseRegistry() },
  },
  {
    name: "UNREGISTERED fake PII table → reds",
    expect: 1,
    wantErr: "NOT in scripts/ci/pii-tables.json",
    fixture: {
      migrations: { ...BASE_MIGS, "20260101000002_leak.sql": FAKE_PII },
      registry: baseRegistry(), // leaky_pii absent from the registry
    },
  },
  {
    name: "registry LIES (claims erased, not in winning body) → reds",
    expect: 1,
    wantErr: "does not erase or de-identify",
    fixture: {
      migrations: { ...BASE_MIGS, "20260101000002_leak.sql": FAKE_PII },
      registry: {
        tables: [
          ...baseRegistry().tables,
          { table: "leaky_pii", identity_columns: ["user_id"], coverage: "erased" },
        ],
      },
    },
  },
  {
    name: "allow-list entry is STALE (claims orphan but table is covered) → reds",
    expect: 1,
    wantErr: "now COVERED",
    fixture: {
      migrations: { ...BASE_MIGS },
      registry: {
        tables: [
          { table: "profiles", identity_columns: ["user_id"], coverage: "erased" },
          {
            table: "sessions",
            identity_columns: ["user_id"],
            coverage: "orphan",
            reason: "pretend this is uncovered even though it cascades to auth.users",
          },
        ],
      },
    },
  },
  {
    name: "allow-list orphan with NO reason → reds",
    expect: 1,
    wantErr: "requires a substantive",
    fixture: {
      migrations: { ...BASE_MIGS, "20260101000002_leak.sql": FAKE_PII },
      registry: {
        tables: [...baseRegistry().tables, { table: "leaky_pii", identity_columns: ["user_id"], coverage: "orphan" }],
      },
    },
  },
  {
    name: "known orphan: fake table registered as orphan WITH a reason → green",
    expect: 0,
    fixture: {
      migrations: { ...BASE_MIGS, "20260101000002_leak.sql": FAKE_PII },
      registry: {
        tables: [
          ...baseRegistry().tables,
          {
            table: "leaky_pii",
            identity_columns: ["user_id"],
            coverage: "orphan",
            reason: "Known PII orphan tracked for the schema-remediation follow-up (CMP-2).",
          },
        ],
      },
    },
  },
  {
    name: "subject table covered only via a NON-identity cascade, claimed cascade with NO reason → reds",
    expect: 1,
    wantErr: "holds only through a non-identity FK",
    fixture: {
      migrations: { ...BASE_MIGS, "20260101000002_sigs.sql": APPS + "\n" + SIGS },
      registry: {
        tables: [
          ...baseRegistry().tables,
          { table: "apps", identity_columns: ["user_id"], coverage: "cascade", cascade_parent: "AUTH" },
          { table: "sigs", identity_columns: ["user_id"], coverage: "cascade", cascade_parent: "apps" },
        ],
      },
    },
  },
  {
    name: "same, cascade WITH a same-subject reason → green",
    expect: 0,
    fixture: {
      migrations: { ...BASE_MIGS, "20260101000002_sigs.sql": APPS + "\n" + SIGS },
      registry: {
        tables: [
          ...baseRegistry().tables,
          { table: "apps", identity_columns: ["user_id"], coverage: "cascade", cascade_parent: "AUTH" },
          {
            table: "sigs",
            identity_columns: ["user_id"],
            coverage: "cascade",
            cascade_parent: "apps",
            reason: "Same subject: a row's user_id equals the owner of the app it cascades through.",
          },
        ],
      },
    },
  },
  {
    name: "F1: PII column hidden behind a trailing `--` comment, unregistered → reds",
    expect: 1,
    wantErr: "NOT in scripts/ci/pii-tables.json",
    fixture: {
      migrations: { ...BASE_MIGS, "20260101000002_hidden.sql": COMMENT_HIDDEN },
      registry: baseRegistry(), // commented_pii absent
    },
  },
  {
    name: "F2: PII column added via ALTER TABLE ADD COLUMN, unregistered → reds",
    expect: 1,
    wantErr: "NOT in scripts/ci/pii-tables.json",
    fixture: {
      migrations: { ...BASE_MIGS, "20260101000002_late.sql": ALTER_ADDED },
      registry: baseRegistry(), // late_pii absent
    },
  },
  {
    name: "F4: INSERT-only table claimed \"erased\" → reds (append is not erasure)",
    expect: 1,
    wantErr: "does not erase or de-identify",
    fixture: {
      migrations: { "20260101000000_fn.sql": FN_INSERT, "20260101000001_tables.sql": TBL_PROFILES + "\n" + TBL_AUDIT },
      registry: {
        tables: [
          { table: "profiles", identity_columns: ["user_id"], coverage: "erased" },
          { table: "audit_rows", identity_columns: ["user_id"], coverage: "erased" },
        ],
      },
    },
  },
  {
    name: "zero migrations → fails CLOSED (exit 2)",
    expect: 2,
    wantErr: "Failing closed",
    fixture: { migrations: {}, registry: baseRegistry() },
  },
  {
    name: "missing registry → fails CLOSED (exit 2)",
    expect: 2,
    wantErr: "registry not found",
    fixture: { migrations: { ...BASE_MIGS }, registry: null },
  },
  {
    name: "no handle_user_deletion defined → fails CLOSED (exit 2)",
    expect: 2,
    wantErr: "erasure entrypoint is missing",
    fixture: { migrations: { "20260101000001_tables.sql": TBL_PROFILES }, registry: baseRegistry() },
  },
];

let failures = 0;
console.log(`erasure-completeness-selftest — gate: ${GATE}\n`);
for (const s of scenarios) {
  const root = buildFixture(s.fixture);
  let got;
  try {
    got = runGate(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const codeOk = got.code === s.expect;
  // For a red/fail-closed scenario, also require it reds for the RIGHT reason, not an unrelated
  // crash (F6: exit-code-only would let a parse/IO error masquerade as the intended detection).
  const reasonOk = !s.wantErr || got.err.includes(s.wantErr);
  const ok = codeOk && reasonOk;
  if (!ok) failures++;
  const why = codeOk ? (reasonOk ? "" : `  [missing reason: ${JSON.stringify(s.wantErr)}]`) : "";
  console.log(`${ok ? "PASS" : "FAIL"}  exit ${got.code} (want ${s.expect})${why}  ${s.name}`);
}
console.log(`\n${failures ? "✖" : "✓"} ${scenarios.length - failures}/${scenarios.length} scenarios passed.`);
process.exit(failures ? 1 : 0);
