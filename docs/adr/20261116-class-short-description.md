# 20261116 — Add `classes.short_description` (card blurb)

- Status: Accepted
- Date: 2026-11-16
- Feature: Allow logged-out visitors to see Classes and Projects (ticket `34c1a3bddce58092864bc1ac090fe335`, §6.1)
- Build plan: `docs/public-access/BUILD-PLAN.md` — Phase A, PR A1

## Context

The public-access feature renders class **cards** (listing + detail) for logged-out
visitors. A card needs a short, scannable blurb. The existing `classes.summary` and
`classes.description` are **HTML** fields (≤10k / ≤50k) meant for the detail page, not
a one- or two-line card line. Reusing them on a card means truncating HTML, which is
fragile and can leak markup.

## Decision

Add a dedicated, plain-text `classes.short_description text NOT NULL DEFAULT ''`,
capped at **140 characters** (about two lines on a 384px card), enforced at three
layers:

1. **DB** — `CHECK (char_length(short_description) <= 140)` (this migration).
2. **Validator** — `safeShortTextSchema("Short description", 140)` in
   `src/lib/validators/class.ts` (single-line, XSS/header-injection safe, trimmed).
3. **Authoring UI** — a live character counter on the field in `ClassFormPage`.

It is a separate column (not a reuse of `summary`/`description`): the card uses
`short_description`; `summary`/`description` stay on the detail page. This is the first
schema PR of Phase A; `short_description` is on the §6 Class SHOW allowlist and will be
returned by the classes public gateway (PR A3).

## Alternatives considered

- **Reuse `summary` truncated on the card.** Rejected: `summary` is HTML and a
  different length budget; truncating HTML on a card is fragile and can expose markup.
- **Make it HTML like the other fields.** Rejected: a card blurb is single-line plain
  text; HTML adds sanitisation surface and layout risk for no benefit.

## Consequences

- Additive, expand/contract — safe to deploy ahead of any UI; existing rows default to
  `''`.
- One more column for teachers to fill; the authoring UI guides the 140-char limit with
  a live counter.
- The 140 cap is enforced in the DB, the validator, and the input, so a client bypass
  still can't exceed it.
