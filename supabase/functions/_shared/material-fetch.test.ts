// @security — unit tests for the shared SSRF allow-list + URL extraction used by both
// fleety-review and techfleet-chat's in-chat "review my link". No network (runs in deno-check CI).
import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertMaterialUrlAllowed,
  extractAllowedUrls,
  extractRecentAllowedUrls,
  fetchMaterialText,
  isMaterialUrlAllowed,
} from "./material-fetch.ts";

Deno.test("allows Figma + Tech Fleet hosts over https (incl. figma subdomains)", () => {
  assertMaterialUrlAllowed("https://www.figma.com/file/abc/My-Deliverable");
  assertMaterialUrlAllowed("https://figma.com/board/xyz");
  assertMaterialUrlAllowed("https://api.figma.com/v1/files/abc");
  assertMaterialUrlAllowed("https://guide.techfleet.org/handbook");
  assertMaterialUrlAllowed("https://techfleetworks.github.io/skills-and-practices-framework/");
});

Deno.test("blocks SSRF vectors", () => {
  assertThrows(() => assertMaterialUrlAllowed("http://www.figma.com/x"), Error, "https");
  assertThrows(
    () => assertMaterialUrlAllowed("https://169.254.169.254/latest/meta-data/"),
    Error,
    "IP-literal"
  );
  assertThrows(() => assertMaterialUrlAllowed("https://[::1]/x"), Error, "IP-literal");
  assertThrows(() => assertMaterialUrlAllowed("https://user:pw@figma.com/x"), Error, "credentials");
  assertThrows(() => assertMaterialUrlAllowed("https://evil.com/x"), Error, "not allow-listed");
  // Suffix-spoof: allow-listed token appears but is not the registrable host.
  assertThrows(
    () => assertMaterialUrlAllowed("https://figma.com.evil.com/x"),
    Error,
    "not allow-listed"
  );
  assertThrows(
    () => assertMaterialUrlAllowed("https://guide.techfleet.org.evil.com/x"),
    Error,
    "not allow-listed"
  );
});

Deno.test("isMaterialUrlAllowed is the non-throwing predicate form", () => {
  assert(isMaterialUrlAllowed("https://www.figma.com/file/abc"));
  assert(!isMaterialUrlAllowed("https://evil.com"));
  assert(!isMaterialUrlAllowed("not a url"));
});

Deno.test(
  "extractAllowedUrls: only allow-listed https URLs, deduped, capped, punctuation-trimmed",
  () => {
    const text =
      "Here's my work https://www.figma.com/file/abc/persona. Also see https://evil.com/x " +
      "and https://guide.techfleet.org/page), plus a repeat https://www.figma.com/file/abc/persona.";
    const urls = extractAllowedUrls(text, 2);
    assertEquals(urls, [
      "https://www.figma.com/file/abc/persona",
      "https://guide.techfleet.org/page",
    ]);
  }
);

Deno.test("extractAllowedUrls: nothing when no allow-listed links present", () => {
  assertEquals(extractAllowedUrls("just a question about milestones, no link"), []);
  assertEquals(extractAllowedUrls("http://figma.com/x (not https)"), []);
});

Deno.test("fetchMaterialText refuses a disallowed URL BEFORE any network call", async () => {
  await assertRejects(() => fetchMaterialText("https://169.254.169.254/"), Error, "IP-literal");
  await assertRejects(() => fetchMaterialText("https://evil.com/x"), Error, "not allow-listed");
});

// ── extractRecentAllowedUrls: thread-aware scan (capability-denial fix, ADR-0034) ─────────
// A board shared once must still be read on a follow-up that carries no link — otherwise it
// falls out of the model's context and the model wrongly claims it can't read Figma.

const FIGMA = "https://www.figma.com/board/abc123/Sprint?node-id=1-2";
const FIGMA2 = "https://www.figma.com/file/xyz789/Other";
const u = (content: string) => ({ role: "user", content });
const a = (content: string) => ({ role: "assistant", content });

Deno.test("extractRecentAllowedUrls: uses the latest user message when it has a link", () => {
  assertEquals(
    extractRecentAllowedUrls([u(`review ${FIGMA}`), a("sure!"), u(`and ${FIGMA2}`)], 2),
    [FIGMA2]
  );
});

Deno.test(
  "extractRecentAllowedUrls: carries a board forward when the follow-up has no link (the incident)",
  () => {
    // Turn 1 shares a board; the follow-up ("evaluate the columns") carries NO link. A last-message
    // -only scan returns [] and the board vanishes — the exact evaporation that triggered the denial.
    const msgs = [
      u(`Take a look at ${FIGMA} — the rows assigned to Katie`),
      a("Here are some implications…"),
      u("Now please evaluate the last two columns for the whole table."),
    ];
    assertEquals(extractRecentAllowedUrls(msgs, 2), [FIGMA]);
  }
);

Deno.test("extractRecentAllowedUrls: does NOT drag a board past the lookback window", () => {
  const msgs = [
    u(`shared ${FIGMA}`),
    a("ok"),
    u("thanks"),
    a("np"),
    u("what's a deliverable?"),
    a("…"),
    u("and a milestone?"),
    a("…"),
    u("and a skill?"), // 4 user turns since the board → out of the default window
  ];
  assertEquals(extractRecentAllowedUrls(msgs, 2, 4), []);
});

Deno.test("extractRecentAllowedUrls: ignores assistant messages and non-allow-listed links", () => {
  const msgs = [
    a(`see https://www.figma.com/board/fromASSISTANT/x`), // assistant message — ignored
    u("check https://evil.example.com/phish and https://google.com"), // not allow-listed
  ];
  assertEquals(extractRecentAllowedUrls(msgs, 2), []);
});

Deno.test("extractRecentAllowedUrls: handles empty / malformed input safely", () => {
  assertEquals(extractRecentAllowedUrls([], 2), []);
  // deno-lint-ignore no-explicit-any
  assertEquals(extractRecentAllowedUrls(undefined as any, 2), []);
  assertEquals(extractRecentAllowedUrls([{ role: "user", content: 123 as unknown as string }]), []);
});
