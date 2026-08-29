/**
 * Unit tests for the raw-invoke-to-invoke-edge codemod (Phase 0c toolkit).
 *
 * Each test builds an in-memory ts-morph SourceFile from a string, runs the codemod's
 * `apply`, and asserts on the transformed text / manual report. We prove:
 *   - the SAFE canonical pattern is rewritten exactly + the import is added;
 *   - the transform is idempotent (2nd apply → no change);
 *   - a handleServiceError site is reported MANUAL and left untouched;
 *   - a bare `await ...invoke(...)` (no destructure) is MANUAL and untouched;
 *   - the import is not duplicated when already present.
 */
import { describe, it, expect } from "vitest";
import { Project, type SourceFile } from "ts-morph";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — plain .mjs codemod, no type declarations
import { apply } from "../../../scripts/codemod/codemods/raw-invoke-to-invoke-edge.mjs";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — plain .mjs harness, no type declarations
import { PROJECT_OPTIONS } from "../../../scripts/codemod/run-codemod.mjs";

// Build the in-memory file with the SAME ts-morph options the harness uses (shared PROJECT_OPTIONS),
// so these tests exercise the exact environment the codemod runs in — no test/harness drift.
function makeFile(code: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: true, ...PROJECT_OPTIONS });
  return project.createSourceFile("in-memory.ts", code);
}

describe("raw-invoke-to-invoke-edge codemod", () => {
  it("rewrites the SAFE canonical pattern and adds the import", () => {
    const sf = makeFile(
      [
        'import { supabase } from "@/integrations/supabase/client";',
        "",
        "export async function run() {",
        '  const { data, error } = await supabase.functions.invoke<Foo>("do-thing", { body: { a: 1 } });',
        "  if (error) throw error;",
        "  return data;",
        "}",
        "",
      ].join("\n")
    );

    const result = apply(sf);
    const text = sf.getFullText();

    expect(result.changed).toBe(true);
    expect(result.manual).toEqual([]);
    // Exact rewrite: destructure collapsed to `data`, invoke -> invokeEdge, if-throw dropped.
    expect(text).toContain('const data = await invokeEdge<Foo>("do-thing", { body: { a: 1 } });');
    expect(text).not.toContain("supabase.functions.invoke");
    expect(text).not.toContain("if (error) throw error");
    expect(text).toContain('import { invokeEdge } from "@/lib/edge/invokeEdge";');
  });

  it("is idempotent — a second apply makes no further change", () => {
    const sf = makeFile(
      [
        'import { supabase } from "@/integrations/supabase/client";',
        "export async function run() {",
        '  const { data, error } = await supabase.functions.invoke("do-thing", { body: {} });',
        "  if (error) throw error;",
        "  return data;",
        "}",
      ].join("\n")
    );

    expect(apply(sf).changed).toBe(true);
    const afterFirst = sf.getFullText();
    const second = apply(sf);
    expect(second.changed).toBe(false);
    expect(sf.getFullText()).toBe(afterFirst);
  });

  it("reports a handleServiceError site as MANUAL and leaves it unchanged", () => {
    const src = [
      'import { supabase } from "@/integrations/supabase/client";',
      "export async function send() {",
      '  const { error } = await supabase.functions.invoke("send-email", { body: {} });',
      '  handleServiceError(error, { action: "send" });',
      "}",
    ].join("\n");
    const sf = makeFile(src);

    const result = apply(sf);

    expect(result.changed).toBe(false);
    expect(result.manual).toHaveLength(1);
    expect(result.manual[0].reason).toBe("error-only");
    expect(sf.getFullText()).toBe(src); // untouched
  });

  it("reports a bare await ...invoke(...) (no destructure) as MANUAL and unchanged", () => {
    const src = [
      'import { supabase } from "@/integrations/supabase/client";',
      "export async function ping() {",
      '  await supabase.functions.invoke("ping", { body: {} });',
      "}",
    ].join("\n");
    const sf = makeFile(src);

    const result = apply(sf);

    expect(result.changed).toBe(false);
    expect(result.manual).toEqual([{ line: 3, reason: "no-destructure" }]);
    expect(sf.getFullText()).toBe(src);
  });

  it("does not duplicate the import when invokeEdge is already imported", () => {
    const sf = makeFile(
      [
        'import { supabase } from "@/integrations/supabase/client";',
        'import { invokeEdge } from "@/lib/edge/invokeEdge";',
        "export async function run() {",
        '  const { data, error } = await supabase.functions.invoke("do-thing", { body: {} });',
        "  if (error) throw error;",
        "  return data;",
        "}",
      ].join("\n")
    );

    const result = apply(sf);
    const text = sf.getFullText();
    const importCount =
      text.split('import { invokeEdge } from "@/lib/edge/invokeEdge";').length - 1;

    expect(result.changed).toBe(true);
    expect(importCount).toBe(1);
  });

  it("reports an error-returned-not-thrown branch as MANUAL and unchanged", () => {
    const src = [
      'import { supabase } from "@/integrations/supabase/client";',
      "export async function check() {",
      '  const { data, error } = await supabase.functions.invoke("check", { body: {} });',
      "  if (error) return { valid: true };",
      "  return data;",
      "}",
    ].join("\n");
    const sf = makeFile(src);

    const result = apply(sf);

    expect(result.changed).toBe(false);
    expect(result.manual).toEqual([{ line: 3, reason: "error-not-thrown" }]);
    expect(sf.getFullText()).toBe(src);
  });

  it("reports a site whose options carry method/region as MANUAL (invokeEdge would drop them)", () => {
    const src = [
      'import { supabase } from "@/integrations/supabase/client";',
      "export async function run() {",
      '  const { data, error } = await supabase.functions.invoke("do-thing", { body: {}, method: "GET" });',
      "  if (error) throw error;",
      "  return data;",
      "}",
    ].join("\n");
    const sf = makeFile(src);

    const result = apply(sf);

    expect(result.changed).toBe(false);
    expect(result.manual).toEqual([{ line: 3, reason: "unsupported-options" }]);
    expect(sf.getFullText()).toBe(src);
  });

  it("reports a site with a non-literal (variable) options object as MANUAL", () => {
    const src = [
      'import { supabase } from "@/integrations/supabase/client";',
      "export async function run(opts: { body: unknown }) {",
      '  const { data, error } = await supabase.functions.invoke("do-thing", opts);',
      "  if (error) throw error;",
      "  return data;",
      "}",
    ].join("\n");
    const sf = makeFile(src);

    const result = apply(sf);

    expect(result.changed).toBe(false);
    expect(result.manual).toEqual([{ line: 3, reason: "unsupported-options" }]);
    expect(sf.getFullText()).toBe(src);
  });

  it("reports a site that references error beyond the canonical throw as MANUAL", () => {
    const src = [
      'import { supabase } from "@/integrations/supabase/client";',
      "export async function run(log: (e: unknown) => void) {",
      '  const { data, error } = await supabase.functions.invoke("do-thing", { body: {} });',
      "  if (error) throw error;",
      "  log(error);",
      "  return data;",
      "}",
    ].join("\n");
    const sf = makeFile(src);

    const result = apply(sf);

    expect(result.changed).toBe(false);
    expect(result.manual).toEqual([{ line: 3, reason: "error-used-later" }]);
    expect(sf.getFullText()).toBe(src);
  });
});
