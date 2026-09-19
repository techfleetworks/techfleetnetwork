# ADR 0049 — A server-draft-backed create form has one owner of in-progress state: `draft.value`

- Status: **Accepted** (2026-09-18)
- Date: 2026-09-18
- Deciders: TechFleet (owner)
- Related: `src/hooks/use-server-draft.ts` (the draft buffer), `src/components/forms/DraftRestoredBanner.tsx`, the canonical call sites `src/pages/ProjectFormPage.tsx` + `src/components/recruiting/ProjectBlastComposer.tsx`, the converged pages `src/pages/ClassFormPage.tsx` / `src/pages/CohortFormPage.tsx` / `src/pages/BannerManagementPage.tsx`, decisions.md §2 (one fact, one owner). Restore regression tests: `src/test/ui/{ClassFormPage,CohortFormPage,BannerManagementPage}.draft-restore.test.tsx`.

## Context and problem statement

A member creating a **New Class** was logged out, came back, and saw the banner _"Your class draft
from 1 minute ago was restored"_ — but every field was **empty**, and the only available action was
**Discard**. The draft existed on the server; the form simply never showed it.

Two different implementations of "a create form backed by `useServerDraft`" had grown up side by side:

- **Direct-binding (worked):** `ProjectFormPage`, `ProjectBlastComposer` — the inputs read from and
  write to the draft buffer directly (`form = draft.value`, `setForm = draft.setValue`). When the
  hook hydrates a restored draft on mount it sets `draft.value`, and the fields just render it. One
  owner of in-progress state; no synchronization.

- **Two-store (broken):** `ClassFormPage`, `CohortFormPage`, `BannerManagementPage` — the working
  values lived in a **second** store (react-hook-form, or local `useState` in Banner's dialog) and
  two effects tried to keep the second store and the draft buffer in agreement:
  - a **mirror** effect (`draft.setValue(form.watch())`) that ran on _every render_, because the
    whole `draft` object — a new reference each render — sat in its dependency array; and
  - a one-shot **hydrate** effect (`form.reset(draft.value)`) that read the _mutable_ draft buffer
    with `draft.value` deliberately omitted from its deps (eslint-suppressed).

  Around hydration the mirror wrote the **empty** initial form into the shared buffer, so which value
  won — the restored draft or the blank form — depended on React effect-ordering and commit timing
  that is not guaranteed. The member hit the losing ordering: the banner rendered (it reads separate
  `restored`/`restoredAt` state) while the fields rendered blank. The same defect can also flush an
  **empty payload over a good server draft**. A component test that mounts create-mode with a restored
  draft makes it objectively visible: the old code **never settles** (render churns past a 110s
  timeout); the converged code renders the restored fields in ~1s.

This is data ownership (decisions.md §2) applied to UI state: one fact — "what the user is typing" —
had two owners kept in sync by hand, and the copies disagreed.

## Decision drivers

- **One owner for in-progress form state.** The bug is structural, not a timing tweak; remove the
  second store rather than re-order effects.
- **Fix must recover the member's stuck draft.** Preserve the on-disk draft shape and
  `schemaVersion` so existing `form_drafts` rows (including the reported one) restore on next visit —
  no version bump, no discard.
- **Converge on the pattern that already works** (`ProjectFormPage`), so the codebase has one way to
  do this, per the user's explicit direction.
- **No new blocking surface.** No `use-server-draft.ts` change, no DB/schema/migration, nothing in
  the frozen auth area.

## Considered options

1. **Keep react-hook-form; make hydration deterministic** — expose an immutable restored snapshot
   from the hook, hydrate once from it, gate the mirror. Smaller diff, but leaves two patterns and a
   second store (the very thing that races).
2. **Converge every draft-backed create form onto direct `draft.value` binding (chosen)** — delete
   the second store and both sync effects; bind inputs straight to the draft buffer in create mode
   and to a local state (seeded from the fetched row) in edit mode.
3. **Rewrite the shape flat and bump `schemaVersion`** — cleaner Class payload, but discards every
   existing class draft, including the member's.

## Decision outcome

**Chosen: Option 2.** Each converged form now has exactly one working object per mode:

- create → `draft.value` (the `useServerDraft` buffer);
- edit → a local `useState` seeded once from the fetched row;
- `const form = isEdit ? editState : draft.value; const setForm = isEdit ? setEditState : draft.setValue;`

Inputs bind directly (`value={form.x}`, `onChange={(e) => setForm((f) => ({ ...f, x: e.target.value }))}`).
Validation moved from react-hook-form's `zodResolver` to a `schema.safeParse(form)` on submit, mapping
issues to an `errors` object and reusing `showFormErrors` + `scrollToFirstError` from
`src/lib/form-validation.ts` — the same shape `ProjectFormPage` already used. `ClassFormPage` keeps its
`{ form, prereqText }` payload at `schemaVersion: 1` (so existing drafts, including the stuck one, are
preserved) and derives `prerequisites` from the free-text buffer at save time in both submit and
edit-autosave — which also closes a pre-existing gap where edit-mode autosave ignored prerequisite
edits. `BannerFormDialog`'s dialog is reused across opens, so a successful create resets the buffer
(`draft.setValue(EMPTY)` after `clearDraft()`).

**Not chosen:** Option 1 keeps the racy second store; Option 3 throws away the member's draft.

## Consequences

**Good**

- The restore bug is structurally gone: there is no second store to clobber, so a hydrated draft
  simply renders. Proven by three `*.draft-restore.test.tsx` specs (fail/hang before, pass after) and
  a Class discard test.
- One pattern for all five draft-backed create forms; new forms copy `ProjectFormPage`.
- Existing `form_drafts` rows restore unchanged (no version bump); the reported stuck draft comes back.
- Removes the empty-payload-over-good-draft hazard.

**Bad / accepted**

- Two large validated forms were rewritten off react-hook-form → validation-parity risk, mitigated by
  field-by-field mapping, preserved zod messages, the new tests, and `judge-arch`.
- Edit-mode state is seeded from fetched data inside an effect (`react-hooks/set-state-in-effect`,
  suppressed with a reason) — the sanctioned "external data → state" use; there is no render-time
  value to derive from.
- No clean mechanical gate for "one owner of form state" (the arch-gate is regex-per-file and can't
  express "`useServerDraft` co-occurs with a mirrored `useForm`"); enforced by decisions.md §2 +
  `judge-arch`, with the `keepInSync` built-in catching the tell-tale marker.

## Confirmation

- `src/test/ui/ClassFormPage.draft-restore.test.tsx` mounts create-mode with the real `useServerDraft`
  hook and a mocked `form_drafts` row and asserts the Title + prerequisites render the restored
  content, and that Discard clears them; `CohortFormPage` and `BannerManagementPage` have the parallel
  restore specs. Against the pre-change `ClassFormPage` the restore test does not settle (render loop);
  after convergence all pass in ~1s.
- `npm run check:architecture` (mechanical gate) passes on the changed files; `npx tsc --noEmit` and
  `npm run lint` are green (no new warnings); `judge-arch` reviewed the diff against the four questions.
