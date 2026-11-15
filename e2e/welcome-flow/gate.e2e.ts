import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * @reliability — the lockout-safety contract for the mandatory Welcome Flow gate (PR5).
 * These are the hard merge-blockers for the launch (§16/§17): a welcome-incomplete user is
 * redirected into the flow on EVERY authed route (no bypass), the flow has NO skip/close (not
 * trappable out of), and a welcome-complete user is never gated. Fixtures seeded by
 * scripts/ci/seed-e2e-fixtures.mjs: e2e-member is welcome-COMPLETE, e2e-outsider is
 * welcome-INCOMPLETE. API sign-in avoids Turnstile; gated on backend env, skips cleanly.
 */
const SB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SB_ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const INCOMPLETE = { email: "e2e-outsider@techfleet.test", password: "E2e-outsider-pass-1!" };
const COMPLETE = { email: "e2e-member@techfleet.test", password: "E2e-member-pass-1!" };

const sessions: Record<string, Record<string, string> | null> = {};
let authError: string | null = null;

async function bootstrap(creds: { email: string; password: string }) {
  if (!SB_URL || !SB_ANON) {
    authError = "VITE_SUPABASE_URL / anon key not provided.";
    return;
  }
  const store: Record<string, string> = {};
  const client = createClient(SB_URL, SB_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => {
          store[k] = v;
        },
        removeItem: (k) => {
          delete store[k];
        },
      },
    },
  });
  const { error } = await client.auth.signInWithPassword(creds);
  if (error) {
    authError = `${creds.email} sign-in failed: ${error.message}`;
    return;
  }
  sessions[creds.email] = { ...store };
}

async function seed(page: Page, email: string) {
  const snapshot = sessions[email];
  if (!snapshot) test.skip(true, authError || `${email} session unavailable`);
  await page.addInitScript((snap) => {
    for (const [k, v] of Object.entries(snap as Record<string, string>)) {
      window.localStorage.setItem(k, v);
    }
  }, snapshot);
}

test.beforeAll(async () => {
  await bootstrap(INCOMPLETE);
  await bootstrap(COMPLETE);
});

test.describe("@reliability Welcome Flow gate — lockout safety", () => {
  test("a welcome-incomplete user is redirected to /welcome from an authed route", async ({
    page,
  }) => {
    await seed(page, INCOMPLETE.email);
    await page.goto("/dashboard");
    await page.waitForURL("**/welcome", { timeout: 15000 });
    expect(new URL(page.url()).pathname).toBe("/welcome");
  });

  test("the flow has no Skip or close affordance (not trappable out of)", async ({ page }) => {
    await seed(page, INCOMPLETE.email);
    await page.goto("/welcome");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByRole("button", { name: /skip/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /skip/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /close/i })).toHaveCount(0);
  });

  test("no bypass — a second authed route also redirects the incomplete user", async ({
    page,
  }) => {
    await seed(page, INCOMPLETE.email);
    await page.goto("/courses");
    await page.waitForURL("**/welcome", { timeout: 15000 });
    expect(new URL(page.url()).pathname).toBe("/welcome");
  });

  test("a welcome-complete user is NOT gated", async ({ page }) => {
    await seed(page, COMPLETE.email);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle").catch(() => {});
    // Stays on /dashboard — never bounced to /welcome.
    expect(new URL(page.url()).pathname).toBe("/dashboard");
  });
});
