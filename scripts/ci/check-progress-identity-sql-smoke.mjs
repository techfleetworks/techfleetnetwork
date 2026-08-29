#!/usr/bin/env node
/**
 * JOURNEY-IDENTITY-001 SQL smoke.
 *
 * Runs member_progress_self_check() as a real signed-in member when CI provides
 * SUPABASE_PROGRESS_IDENTITY_TEST_JWT. Without that optional member token, this
 * stays non-blocking so public PRs never need account secrets.
 */

import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const memberJwt = process.env.SUPABASE_PROGRESS_IDENTITY_TEST_JWT ?? "";
const minJourneyRows = Number(process.env.PROGRESS_IDENTITY_MIN_JOURNEY_ROWS ?? "1");
const FIXTURE = process.env.PROGRESS_IDENTITY_FIXTURE?.trim();

let row;

if (FIXTURE) {
  // Test-only seam (mirrors the GUARD_*_ROOT seams): read the RPC response from
  // this JSON fixture instead of calling Supabase, so the row-count detection is
  // exercisable in CI without a live backend + a member JWT. NEVER set in prod/CI.
  const parsed = JSON.parse(readFileSync(FIXTURE, "utf8"));
  row = Array.isArray(parsed) ? parsed[0] : parsed;
} else {
  if (!url || !anonKey) {
    console.log(
      "::notice::Skipping JOURNEY-IDENTITY-001 SQL smoke — backend env is not configured."
    );
    process.exit(0);
  }

  if (!memberJwt) {
    console.log(
      "::notice::Skipping JOURNEY-IDENTITY-001 SQL smoke — SUPABASE_PROGRESS_IDENTITY_TEST_JWT is not configured."
    );
    process.exit(0);
  }

  const res = await fetch(`${url}/rest/v1/rpc/member_progress_self_check`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${memberJwt}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ JOURNEY-IDENTITY-001 SQL smoke failed: ${res.status} ${body}`);
    process.exit(1);
  }

  const rows = await res.json();
  row = Array.isArray(rows) ? rows[0] : rows;
}
const journeyRows = Number(row?.journey_rows ?? 0);
const completedRows = Number(row?.completed_rows ?? 0);
const courseRows = Number(row?.course_completion_rows ?? 0);

if (journeyRows < minJourneyRows || completedRows < minJourneyRows || courseRows < 1) {
  console.error(
    `❌ JOURNEY-IDENTITY-001 SQL smoke failed: journey_rows=${journeyRows}, completed_rows=${completedRows}, course_completion_rows=${courseRows}`
  );
  process.exit(1);
}

console.log(
  `✓ JOURNEY-IDENTITY-001: auth.uid() can read progress rows (${journeyRows} journey, ${completedRows} completed, ${courseRows} courses)`
);
