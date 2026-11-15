# ADR 20261104 — Dependabot auto-merge (auto-approve + auto-merge, majors excluded)

- Status: accepted
- Date: 2026-11-04
- Deciders: engineering (CI/CD hardening) + repo owner (human policy sign-off: non-major Dependabot PRs merge without human review — see "Decision")

## Context

Branch protection on `main` is **strict** (branches must be up to date before merge), requires
**1 approval**, and requires **6 status checks** via the `main-security-gates` ruleset: `CodeQL`,
`dependency-advisories`, `secret-scan`, `dependency-review`, `gate`, `stryker`.

Under those rules, merging Dependabot's weekly minor/patch PRs by hand is a serial grind. Every
merge moves `main`, which flips every other open PR to "behind" and forces a re-rebase plus a
re-run of all required checks on the new head. In practice the backlog piled up to 11 open bump
PRs, and `@dependabot squash and merge` comments were not being honored. An unmerged dependency
update is itself a supply-chain exposure (OWASP A06:2025 — Vulnerable and Outdated Components), so
"let them sit" is not a safe default.

Majors are already excluded from Dependabot entirely (`dependabot.yml` ignores
`version-update:semver-major`) because two past major auto-bumps froze the production build
(tailwind v3→v4, react-router v6→v8).

## Decision

Automate *satisfying* the merge gate for Dependabot, without lowering it.

1. Add `.github/workflows/dependabot-auto-merge.yml` (`pull_request_target`, guarded to
   `github.actor == 'dependabot[bot]'`, no checkout of PR code). It runs `dependabot/fetch-metadata`,
   then for any non-major update auto-approves the PR (satisfies the 1-review rule) and enables
   GitHub-native auto-merge (squash). Majors are skipped as a second guard over `dependabot.yml`.
2. Enable two repo settings: **Allow auto-merge** and **Always suggest updating pull request
   branches**. Together these let GitHub keep each Dependabot PR rebased under strict protection and
   merge it the moment its required checks pass.
3. Create the `supply-chain` and `ci` labels that `dependabot.yml` already references (Dependabot
   currently warns that they do not exist).

**The bar is unchanged.** All 6 required checks still must pass before anything merges; a bump that
fails one (e.g. `dependency-review` flags a CVE, or `gate` fails) stays open for a human. What this
removes is the *human review step* for non-major Dependabot PRs — that is the explicit policy choice
this ADR records, and it is why it needs repo-owner sign-off, not just engineering.

## Alternatives considered

- **`@dependabot merge` / `squash and merge` comments.** Not honored on this repo; brittle and
  opaque when they silently do nothing.
- **GitHub merge queue.** The native answer to strict serialization, but the required-check
  workflows do not trigger on `merge_group`, so enabling it today would leave every PR stuck
  "waiting for status". Deferred as future hardening (would require adding `merge_group` triggers to
  the six required-check workflows first).
- **Admin-bypass merges (`--admin`).** Merges past the required-check gate. Rejected — it violates
  the gate discipline the whole enterprise-readiness program is built on.
- **Status quo (manual serial merges).** Does not scale, and leaves security updates lingering.

## Consequences

- Non-major and security bumps merge automatically once green; the backlog self-drains.
- Majors still require a deliberate, human-authored migration PR.
- Non-major Dependabot PRs merge **without human review**. Mitigations: majors excluded,
  `dependency-review` + `dependency-advisories` + `secret-scan` + `CodeQL` all still gate, and
  Dependabot groups keep each PR scoped and legible.
- Hard dependency on the two repo settings. If either is turned off, auto-merge silently will not
  engage (documented in the workflow header).
- A `github-actions[bot]` approval appears on every Dependabot PR (expected, not a real reviewer).
- No new required check is added; the workflow is advisory automation outside the ruleset.
