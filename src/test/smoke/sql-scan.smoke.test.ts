// Unit coverage for scripts/ci/_sql-scan.mjs — the shared SQL "code view" tokenizer used by the
// ADR-0036 schema gate. It must mask comments / string literals / dollar-quoted bodies (so DDL-shaped
// PROSE can't mint phantoms and real DDL can't be masked), keep DO-block bodies, and — the case the
// ADR-0036 audit hardened — treat a backslash as a quote-escape ONLY inside E'...' strings, because
// Postgres runs standard_conforming_strings ON: in a plain '...' a backslash is literal and \' CLOSES
// the string. Getting that wrong over-consumes past the real close and masks the following DDL.
import { describe, it, expect } from "vitest";
import { codeView, unterminatedDollarTag } from "../../../scripts/ci/_sql-scan.mjs";

describe("_sql-scan codeView (tokenizer)", () => {
  it("plain string: a backslash before the closing quote does NOT escape it — trailing DDL stays visible", () => {
    // 'x\' is a complete plain string (open, x, \, close); the CREATE after it is real code.
    const cv = codeView("a='x\\'; create table public.zzz (id uuid);");
    expect(cv).toContain("create table public.zzz");
  });

  it("E-string: a backslash DOES escape the quote — \\' stays inside the string", () => {
    const cv = codeView("a=E'x\\'y'; create table public.qqq (id uuid);");
    // The whole E'x\'y' is one string (masked); the trailing CREATE is code.
    expect(cv).toContain("create table public.qqq");
    expect(cv).not.toContain("x\\'y");
  });

  it("doubled '' still escapes a quote inside a plain string", () => {
    const cv = codeView("a='x''y'; create table public.www (id uuid);");
    expect(cv).toContain("create table public.www");
    expect(cv).not.toContain("x''y");
  });

  it("masks line comments, block comments, and dollar-quoted bodies (no phantom DDL leaks)", () => {
    expect(codeView("-- create table public.ghost (x int)\nselect 1;")).not.toContain(
      "create table public.ghost"
    );
    expect(codeView("/* create table public.ghost (x int) */ select 1;")).not.toContain(
      "create table public.ghost"
    );
    expect(
      codeView(
        "create function f() returns void language plpgsql as $$ create table public.ghost (x int); $$;"
      )
    ).not.toContain("create table public.ghost");
  });

  it("keeps DO-block bodies as code when keepDoBodies is set (real objects declared inside DO run)", () => {
    const sql = "do $$ begin create table public.realt (x int); end $$;";
    expect(codeView(sql)).not.toContain("create table public.realt"); // masked by default
    expect(codeView(sql, { keepDoBodies: true })).toContain("create table public.realt"); // kept
  });

  it("keepStrings preserves string literals (cron job names) while still masking comments", () => {
    const cv = codeView("select cron.schedule('my-job', '* * * * *', 'x'); -- 'not-a-job'", {
      keepStrings: true,
    });
    expect(cv).toContain("'my-job'");
    expect(cv).not.toContain("not-a-job"); // the comment is still masked
  });

  it("unterminatedDollarTag flags an unbalanced dollar-quote and passes a balanced one", () => {
    expect(unterminatedDollarTag("select $$ open but never closed")).toBe("$$");
    expect(unterminatedDollarTag("select $$ closed $$;")).toBeNull();
    expect(unterminatedDollarTag("select 1; -- $$ inside a comment is fine")).toBeNull();
  });
});
