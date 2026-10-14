# CI gate authoring standard: make every gate explain itself

A CI gate is a small program that reads some files, checks a rule, and exits green (0) or red (1). That
is powerful but opaque: when a check goes red, the person staring at it often has no idea what the gate
is, why it exists, or how to make it pass. This standard fixes that. Every gate in TFN must be
**human-readable**: a newcomer should be able to read the gate and understand what it protects and how to
satisfy it, without reading the code.

This is not decoration. A gate nobody understands gets disabled the first time it is inconvenient, which
is how enforcement rots. Readability is part of keeping the gate alive.

## Rule 1: every gate carries a What / How / Why / Fix header

The top of every gate script is a comment block with exactly these four labeled parts, in plain English
(aim for the level a smart non-specialist teammate reads comfortably):

```js
/**
 * GATE: no untagged PII columns
 *
 * WHAT: Fails if a database migration adds a column whose name looks like personal data
 *       (email, ip, name, discord_id, ...) without a classification tag next to it.
 *
 * HOW:  Scans every .sql file under supabase/migrations/. For each column definition, it
 *       checks the column name against the PII-name patterns in pii-patterns.json. A match
 *       with no `-- @pii:<category>` tag on the same or preceding line is a violation.
 *
 * WHY:  Unclassified personal data is how privacy obligations get missed. If we do not know a
 *       column holds PII, we cannot apply retention, erasure, or access rules to it. One owner,
 *       recorded at the point the column is born. (compliance-data-lifecycle)
 *
 * FIX:  Either add `-- @pii:<category>` above the column, or, if the name only looks like PII
 *       but is not, add it to the allowlist in pii-patterns.json with a one-line reason.
 */
```

- **WHAT** is the rule in one or two sentences: what makes the gate go red.
- **HOW** is the mechanism: which files it reads and what it looks for. Enough that a reader could
  predict the result.
- **WHY** is the point: the real-world failure this prevents, and the skill it enforces in parentheses.
- **FIX** is the escape hatch: the exact thing a developer does to turn the check green, including the
  legitimate "this is a false alarm" path. A gate with no stated fix is a trap.

## Rule 2: failure output is a message, not a stack trace

When a gate exits red, the last thing it prints must tell the reader three things in plain language:
**where** (file and line), **what** is wrong, and **how** to fix it. Never let a gate fail with a bare
exception or a cryptic token.

```
❌  no-untagged-pii

   supabase/migrations/20261014_add_ip.sql:7
   Column `user_ip` looks like personal data but has no classification tag.

   Fix: add `-- @pii:network` above the column, or allowlist it in
        scripts/ci/pii-patterns.json if it is not actually PII.
```

A good failure message ends the investigation. A bad one starts it. The reader should not have to open
the gate's source to understand a red.

## Rule 3: one plain-English index of every gate

`scripts/ci/README.md` lists every gate in one place, each with its one-line WHAT and the skill it
serves, so the whole enforcement layer reads like a table of contents. A new engineer reads that one file
and understands what the CI protects. The index is generated or checked against the actual gate folder so
it cannot drift out of date (a gate missing from the index, or an index entry with no gate, fails).

## Rule 4: the header is itself enforced (optional meta-check, recommended)

Readability rots unless it is required. A small meta-gate (`check-gate-has-header`) scans every file in
`scripts/ci/` and fails if a gate is missing any of the four header parts, or if its WHY does not name a
skill. This is cheap, dependency-free, and keeps the standard from being "best effort." It follows the
same proof discipline as any other gate: it ships a known-bad fixture (a headerless gate) and a
known-good fixture (a complete one), and the test is proven to flip when the meta-gate is neutralized.

This rule is marked recommended rather than required only so the team can decide the rollout order; the
standard itself (rules 1 to 3) is required for every gate the refactor ships or touches.

## How this folds into "copy"

When the refactor copies an enterprise-skills gate into TFN, the copy is not done until its header is
localized to TFN. The upstream script usually has a header already; the copier rewrites the HOW and FIX
to reference TFN's real paths and config (e.g. `supabase/migrations/**`, the TFN allowlist file) and
confirms the WHY names the skill. A copied gate with a stale or generic header is an incomplete copy.

## Why plain English specifically

The audience for a red check is not always the person who wrote the gate. It is whoever opened the PR,
who may be new, who may be tired, who may be an AI agent reading the message as its only context. Plain
English, a concrete fix, and a one-line reason are what let that person act correctly instead of
disabling the check. The gates enforce the standards; the headers are how the gates earn the trust that
keeps them enabled.
