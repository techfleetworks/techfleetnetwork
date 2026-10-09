// Smoke coverage for audit H11 — a Discord identity may be bound to a profile
// ONLY after real ownership proof (OAuth authorization_code -> /users/@me match).
// Hermetic file-content invariants; if one fails, the proof gate has regressed —
// restore it, don't relax the test.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const callbackSrc = read("supabase/functions/discord-oauth-callback/index.ts");
const decideSrc = read("supabase/functions/discord-oauth-callback/decide.ts");
const startSrc = read("supabase/functions/discord-oauth-start/index.ts");
const sharedSrc = read("supabase/functions/_shared/discord-oauth.ts");

// The sole legitimate binder of a Discord identity to a profile. Every other
// edge function is held to "reads, never binds" by the H11-001 guard below.
const SOLE_BINDER = "discord-oauth-callback";

// All edge-function entrypoints, comment-stripped so a header named only in a
// rationale comment (e.g. the callback's own module doc) isn't read as a write.
const FN_ROOT = resolve(process.cwd(), "supabase/functions");
function edgeFunctionSources(): Array<{ name: string; code: string }> {
  return readdirSync(FN_ROOT)
    .filter((name) => {
      if (name === "_shared" || name.startsWith(".")) return false;
      try {
        return statSync(resolve(FN_ROOT, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .map((name) => {
      let raw = "";
      try {
        raw = readFileSync(resolve(FN_ROOT, name, "index.ts"), "utf8");
      } catch {
        /* no index.ts (shared-only dir) — treated as empty */
      }
      const code = raw
        .split(/\r?\n/)
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      return { name, code };
    });
}

describe("Discord-link ownership proof (smoke)", () => {
  it("H11-001: NO edge function binds a caller-supplied snowflake; only the OAuth callback binds at all", () => {
    // Generalized from the (now-removed) resolve-discord-id guard: the H11 fix
    // is not "one function was patched" but the invariant "a Discord identity is
    // bound to a profile ONLY after OAuth ownership proof, and only by the
    // callback." Deleting resolve-discord-id must not silently drop that gate —
    // this scans the whole edge-function surface so ANY future reintroduction
    // (in that function's grave or a new one) fails here.
    const binders: string[] = [];
    for (const { name, code } of edgeFunctionSources()) {
      // The exact legacy vulnerability: binding the caller-supplied
      // confirm_user_id snowflake. Forbidden in EVERY edge function.
      expect(code, `${name} reintroduced the caller-supplied bind`).not.toMatch(
        /discord_user_id:\s*confirm_user_id/
      );
      // A function that writes the "linked" flag into a profile is, by
      // definition, a binder. There must be exactly one — the OAuth callback —
      // so a NEW function that tried to bind a Discord identity would surface
      // here. (The callback's own body-vs-verified-snowflake proof is H11-002.)
      if (/has_discord_account:\s*true/.test(code)) binders.push(name);
    }
    expect(binders).toEqual([SOLE_BINDER]);
  });

  it("H11-002: the ONLY binding path is discord-oauth-callback, gated on OAuth proof", () => {
    // Gate 1: a single-use state nonce is consumed (CSRF + cross-user defense).
    expect(callbackSrc).toMatch(/consume_discord_oauth_state/);
    // Gate 2: the snowflake comes from Discord's /users/@me, not the caller.
    expect(callbackSrc).toMatch(/DISCORD_USERS_ME_URL|users\/@me/);
    // Gate 3: the shared guard decides bindability.
    expect(callbackSrc).toMatch(/decideBind/);
    // The bound snowflake is the OAuth-verified one (decision.snowflake), never
    // a value read off the request body.
    expect(callbackSrc).toMatch(/discord_user_id:\s*decision\.snowflake/);
    expect(callbackSrc).toMatch(/has_discord_account:\s*true/);
  });

  it("H11-002: the callback never binds a snowflake taken from the request body", () => {
    // The request body carries only { code, state }. Nothing that could name a
    // snowflake may be read from it and written to a profile.
    expect(callbackSrc).not.toMatch(/body\.(discord_user_id|confirm_user_id|snowflake)/);
    expect(callbackSrc).not.toMatch(/discord_user_id:\s*(body|code|state)\b/);
  });

  it("H11-002: the bind decision validates the snowflake and username shape", () => {
    expect(decideSrc).toMatch(/isValidSnowflake/);
    expect(decideSrc).toMatch(/isUsableDiscordUsername/);
  });

  it("H11-003: start mints server-side state and requires client configuration", () => {
    expect(startSrc).toMatch(/create_discord_oauth_state/);
    expect(startSrc).toMatch(/DISCORD_CLIENT_ID/);
    expect(startSrc).toMatch(/oauth_not_configured/);
  });

  it("H11: the shared OAuth helper pins the redirect URI to an exact allow-list", () => {
    // Guards against an open-redirect: only known origins + the fixed callback path.
    expect(sharedSrc).toMatch(/ALLOWED_LINK_ORIGINS/);
    expect(sharedSrc).toMatch(/resolveLinkRedirectUri/);
    expect(sharedSrc).toMatch(/courses\/connect-discord\/callback/);
  });
});
