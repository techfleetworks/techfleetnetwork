/**
 * Gumroad reconciliation — applies any unapplied sales matching the
 * caller's email to their profile. Safe to call on every login.
 *
 * Why this exists:
 *   - A user may purchase before signing up. The webhook records the sale
 *     but can't bind it to a user_id yet.
 *   - A webhook may have been missed (e.g. the platform didn't yet have
 *     gumroad-webhook deployed when the sale happened).
 *
 * Auth: requires a valid JWT (verify_jwt = true). Uses the caller's
 * verified auth.email() — never trusts a client-supplied email.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface SaleRow {
  sale_id: string;
  resolved_tier: "starter" | "community" | "professional" | null;
  is_founding_member: boolean;
  product_permalink: string;
  recurrence: string;
  received_at: string;
}

function normalizeBillingPeriod(recurrence: string, productPermalink: string, isFoundingMember: boolean): "monthly" | "yearly" {
  const haystack = `${recurrence} ${productPermalink}`.toLowerCase();
  return isFoundingMember || haystack.includes("year") || haystack.includes("annual")
    ? "yearly"
    : "monthly";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
    token,
  );
  if (claimsErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claims.claims.sub as string;
  const email = (claims.claims.email as string | undefined)?.toLowerCase();

  if (!email) {
    return new Response(
      JSON.stringify({ ok: true, applied: 0, reason: "no_email" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find any sales for this email that aren't applied yet.
  const { data: sales, error: salesErr } = await admin
    .from("gumroad_sales")
    .select(
      "sale_id, resolved_tier, is_founding_member, product_permalink, recurrence, received_at",
    )
    .ilike("email", email)
    .neq("status", "applied")
    .order("received_at", { ascending: false });

  if (salesErr) {
    console.error("gumroad-reconcile: query failed", salesErr);
    return new Response(JSON.stringify({ error: "Query failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!sales || sales.length === 0) {
    return new Response(JSON.stringify({ ok: true, applied: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Apply the most recent sale that maps to a real tier.
  const latest = (sales as SaleRow[]).find((s) => s.resolved_tier);
  if (!latest) {
    return new Response(JSON.stringify({ ok: true, applied: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      membership_tier: latest.resolved_tier,
      is_founding_member: latest.is_founding_member,
      membership_billing_period: normalizeBillingPeriod(latest.recurrence, latest.product_permalink, latest.is_founding_member),
      membership_sku: latest.product_permalink,
      membership_gumroad_sale_id: latest.sale_id,
      membership_updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (profileErr) {
    console.error("gumroad-reconcile: profile update failed", profileErr);
    return new Response(JSON.stringify({ error: "Update failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Mark all matched sales as applied + bound to this user.
  await admin
    .from("gumroad_sales")
    .update({
      status: "applied",
      resolved_user_id: userId,
      processed_at: new Date().toISOString(),
    })
    .in(
      "sale_id",
      (sales as SaleRow[]).map((s) => s.sale_id),
    );

  return new Response(
    JSON.stringify({
      ok: true,
      applied: sales.length,
      tier: latest.resolved_tier,
      founding: latest.is_founding_member,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
