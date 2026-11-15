// Cucumber-js configuration — the executable Gherkin runner (ADR 20261110).
//
// The repo stores .feature files CO-LOCATED with the code they describe
// (supabase/functions/**, src/features/**), so `paths` points there rather than
// at a top-level features/ tree. Step definitions and the World live under
// features/ and are written in TypeScript, loaded through the tsx ESM loader
// (see the `test:bdd` npm script: `node --import tsx/esm`).
//
// STRICT by default: an undefined or pending step is a HARD failure (exit != 0),
// never a silent skip — so a scenario that is not genuinely wired to code cannot
// pass. The `default` profile runs only what is implemented today:
//   - `not @pending` excludes scenarios/features not yet wired to step defs
//     (tracked, visibly, in features/bdd-index.json — never silently dropped).
//   - `not @auth`    excludes auth features; the auth refactor owns those.
//
// A separate `all` profile drops the tag filter so the undefined-step surface of
// the WHOLE set is observable on demand (it is expected to fail until the
// @pending backlog is implemented — it is a worklist, not a gate).
const shared = {
  paths: ["supabase/functions/**/*.feature", "src/features/**/*.feature"],
  import: ["features/support/**/*.ts", "features/step_definitions/**/*.ts"],
  strict: true,
};

export default {
  ...shared,
  tags: "not @pending and not @auth",
};

export const all = {
  ...shared,
};
