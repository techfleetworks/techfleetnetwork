// PUB-CATALOG-CONTRACT-001 — compile-time lock: the public catalog's array/scalar
// field types MUST match the real DB columns.
//
// Root cause of the /classes/:slug crash (2026-11-20): use-public-catalog.ts
// hand-declared `outcomes: string[]` while the DB column `classes.outcomes` is a
// single text string. The detail page rendered it through a list (`.map`), and a
// string has no `.map`, so the page threw into the error boundary ("Something went
// wrong"). Neither typecheck nor the unit test caught it, because the hand-written
// type AND the test mock both repeated the same wrong shape.
//
// The assertions below are REAL `tsc` constraints (the `Expect<Equal<…>>` pattern),
// so `npm run typecheck` FAILS if a public field's core shape (ignoring
// nullability, which the gateway projection legitimately varies) stops matching its
// DB column — e.g. if someone re-types `outcomes` as `string[]`. That makes this
// whole class of scalar/array contract drift impossible to MERGE, not just caught
// in review. (vitest's own `expectTypeOf().toEqualTypeOf()` is NOT used here: it is
// only enforced under `vitest --typecheck`, so under plain `tsc` it is vacuous —
// which defeats the point of a gate.)
import { describe, it, expect } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import type { PublicClassDetail, PublicClassListItem } from "@/hooks/use-public-catalog";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

// Invariant type-equality (fails on any structural difference), and a constraint
// that only accepts `true` — so a mismatch is a compile error at its use site.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// Compare the non-null core so a gateway field that is `T | null` still matches a
// DB column of `T` — what we lock is scalar-vs-array, not the nullability.
type Core<T> = NonNullable<T>;

// If any line's Equal<…> resolves to `false`, `Expect<false>` violates `T extends
// true` and `npm run typecheck` fails here. (Proven to fire: temporarily retyping
// `outcomes` as `string[]` makes this file error.)
/* eslint-disable @typescript-eslint/no-unused-vars */
type _detailOutcomes = Expect<Equal<Core<PublicClassDetail["outcomes"]>, Core<ClassRow["outcomes"]>>>;
type _detailSkills = Expect<Equal<Core<PublicClassDetail["skills"]>, Core<ClassRow["skills"]>>>;
type _detailPrereqs = Expect<Equal<Core<PublicClassDetail["prerequisites"]>, Core<ClassRow["prerequisites"]>>>;
type _detailDelivs = Expect<Equal<Core<PublicClassDetail["deliverables"]>, Core<ClassRow["deliverables"]>>>;
type _listOutcomes = Expect<Equal<Core<PublicClassListItem["outcomes"]>, Core<ClassRow["outcomes"]>>>;
type _listSkills = Expect<Equal<Core<PublicClassListItem["skills"]>, Core<ClassRow["skills"]>>>;
type _listPrereqs = Expect<Equal<Core<PublicClassListItem["prerequisites"]>, Core<ClassRow["prerequisites"]>>>;
/* eslint-enable @typescript-eslint/no-unused-vars */

describe("public catalog field types mirror the DB columns (PUB-CATALOG-CONTRACT-001)", () => {
  it("compiles only when the array/scalar field types match the DB (enforced by typecheck)", () => {
    // The real assertions are the `Expect<Equal<…>>` types above, verified by
    // `npm run typecheck`. This runtime case documents them and keeps the file a
    // valid test module.
    expect(true).toBe(true);
  });
});
