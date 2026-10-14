import { supabase } from "@/integrations/supabase/client";
import type { ProfileInput } from "@/lib/validators/profile";
import { createLogger } from "@/services/logger.service";
import { pickAllowedFields, deepSanitize } from "@/lib/security";
import { retryPostgrest } from "@/lib/data/transient-retry";
import { withAuthLockRetry } from "@/lib/auth/auth-lock-retry";
import { withBoundedSave, type BoundedSaveStatus } from "@/lib/data/bounded-save";
import { handleServiceError } from "@/lib/service-result";

const log = createLogger("ProfileService");

export interface Profile {
  first_name: string;
  last_name: string;
  email: string;
  country: string;
  timezone: string;
  discord_username: string;
  discord_user_id: string;
  display_name: string;
  avatar_url: string | null;
  profile_completed: boolean;
  interests: string[];
  portfolio_url: string;
  linkedin_url: string;
  scheduling_url: string;
  experience_areas: string[];
  professional_goals: string;
  notify_training_opportunities: boolean;
  notify_announcements: boolean;
  education_background: string[];
  has_discord_account: boolean;
  discord_invite_url: string;
  membership_tier: "starter" | "community" | "professional";
  is_founding_member: boolean;
  membership_billing_period: string;
  membership_sku: string;
  membership_gumroad_sale_id: string;
  membership_updated_at: string | null;
  preferred_language: string | null;
  /**
   * Set ONCE by mark_welcome_flow_complete() when the member finishes the mandatory
   * Welcome Flow. NULL = the route gate still shows the flow. Reads (dot access) are
   * fine anywhere; the ONLY writer is markWelcomeFlowComplete() below (never
   * updateFields). ADR 20261009-welcome-flow-data-model.
   */
  welcome_flow_completed_at: string | null;
}

export const ProfileService = {
  async fetch(userId: string): Promise<Profile | null> {
    return log.track("fetch", `Fetching profile for user ${userId}`, { userId }, async () => {
      // Wrapped in retryPostgrest + auth-lock retry: this call commonly
      // races with MfaService.getMfaGateDecision for GoTrue's Web Lock
      // during identity bootstrap, and the underlying PostgREST request
      // can flake on schema-cache reloads (PGRST002).
      const { data, error } = await withAuthLockRetry(() =>
        retryPostgrest(() =>
          supabase
            .from("profiles")
            .select("first_name, last_name, email, country, timezone, discord_username, discord_user_id, display_name, avatar_url, profile_completed, interests, portfolio_url, linkedin_url, scheduling_url, experience_areas, professional_goals, notify_training_opportunities, notify_announcements, education_background, has_discord_account, discord_invite_url, membership_tier, is_founding_member, membership_billing_period, membership_sku, membership_gumroad_sale_id, membership_updated_at, preferred_language, welcome_flow_completed_at")
            .eq("user_id", userId)
            .maybeSingle(),
        ),
      );
      if (error) {
        const err = error as { message?: string; code?: string; details?: string; hint?: string };
        log.warn("fetch", `Profile not found or query failed for user ${userId}: ${err.message ?? "unknown"}`, {
          userId,
          errorCode: err.code,
          errorDetails: err.details,
          errorHint: err.hint,
        }, error as Error);
        return null;
      }
      log.info("fetch", `Profile loaded for user ${userId}`, {
        userId,
        profileCompleted: (data as any)?.profile_completed,
        hasDiscord: !!(data as any)?.discord_username,
      });
      return data as unknown as Profile;
    });
  },

  async update(userId: string, input: ProfileInput, email?: string) {
    return log.track("update", `Updating profile for user ${userId}`, {
      userId,
      fields: Object.keys(input),
      country: input.country,
      hasDiscord: !!input.discordUsername,
      interestCount: input.interests?.length ?? 0,
      hasEmail: !!email,
    }, async () => {
      // Build update payload with only known safe fields (A04 mass assignment)
      const rawData: Record<string, unknown> = {
        first_name: input.firstName,
        last_name: input.lastName,
        country: input.country,
        timezone: input.timezone,
        display_name: `${input.firstName} ${input.lastName}`.trim(),
        interests: input.interests || [],
        profile_completed: true,
        portfolio_url: input.portfolio_url || "",
        linkedin_url: input.linkedin_url || "",
        scheduling_url: input.scheduling_url || "",
        experience_areas: input.experience_areas || [],
        professional_goals: input.professional_goals || "",
        notify_training_opportunities: input.notify_training_opportunities ?? false,
        notify_announcements: input.notify_announcements ?? false,
        education_background: input.education_background || [],
        has_discord_account: input.has_discord_account ?? true,
      };

      // A03/A08: Deep-sanitize all string values to prevent stored XSS
      const updateData = deepSanitize(rawData) as Record<string, unknown>;

      const { error } = await (supabase
        .from("profiles") as any)
        .update(updateData)
        .eq("user_id", userId);
      if (error) {
        log.error("update", `Failed to save profile for user ${userId}: ${error.message}`, {
          userId,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint,
        }, error);
        throw new Error("Failed to save profile. Please try again.");
      }
      log.info("update", `Profile saved successfully for user ${userId}`, { userId });
    });
  },

  async updateNames(userId: string, firstName: string, lastName: string, email?: string) {
    return log.track("updateNames", `Syncing OAuth names for user ${userId}`, {
      userId,
      firstName,
      lastName,
      hasEmail: !!email,
    }, async () => {
      const rawData: Record<string, string> = {
        first_name: firstName,
        last_name: lastName,
        display_name: `${firstName} ${lastName}`.trim(),
      };

      // A03: Sanitize OAuth-provided names before persisting
      const updateData = deepSanitize(rawData) as Record<string, unknown>;

      const { error } = await (supabase
        .from("profiles") as any)
        .update(updateData)
        .eq("user_id", userId);
      if (error) {
        log.error("updateNames", `Failed to sync profile names for user ${userId}: ${error.message}`, {
          userId,
          errorCode: error.code,
          errorDetails: error.details,
        }, error);
        throw new Error("Failed to sync profile names.");
      }
      log.info("updateNames", `Profile names synced for user ${userId}`, { userId, firstName, lastName });
    });
  },

  /** Update arbitrary profile fields (used by general application to sync Section 2 fields) */
  async updateFields(userId: string, fields: Record<string, unknown>) {
    // Mass assignment protection: only allow known safe fields
    const ALLOWED_PROFILE_FIELDS = [
      "first_name",
      "last_name",
      "display_name",
      "country",
      "timezone",
      "bio",
      "professional_background",
      "professional_goals",
      "education_background",
      "experience_areas",
      "interests",
      "portfolio_url",
      "linkedin_url",
      "scheduling_url",
      "notify_training_opportunities",
      "notify_announcements",
      "has_discord_account",
      "avatar_url",
    ];
    const safeFields = pickAllowedFields(fields, ALLOWED_PROFILE_FIELDS);
    // Sanitize string values to prevent stored XSS
    const sanitizedFields = deepSanitize(safeFields);

    return log.track("updateFields", `Updating profile fields for user ${userId}`, {
      userId,
      fields: Object.keys(sanitizedFields),
    }, async () => {
      if (Object.keys(sanitizedFields).length === 0) {
        log.warn("updateFields", "No allowed fields to update", { userId, requestedFields: Object.keys(fields) });
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update(sanitizedFields as any)
        .eq("user_id", userId);
      if (error) {
        log.error("updateFields", `Failed to update profile fields: ${error.message}`, { userId }, error);
        throw new Error("Failed to update profile.");
      }
      log.info("updateFields", `Profile fields updated for user ${userId}`, { userId });
    });
  },

  /**
   * Mark the mandatory Welcome Flow complete for the current user. The SOLE writer
   * of `welcome_flow_completed_at` (never updateFields — set-once belongs only to the
   * RPC; src/components/welcome/CLAUDE.md). Calls the no-arg SECURITY DEFINER RPC
   * `mark_welcome_flow_complete()` which pins to auth.uid() and set-once-COALESCEs,
   * so a double-click / replay never moves the original timestamp.
   *
   * Wrapped in withBoundedSave (ProfileService is direct supabase-js, not invokeEdge):
   * a hung PostgREST write must not infinite-spin the final step and strand the user
   * (requirements §6.5 / §9.4 — the S1 lockout surface). On an unconfirmable timeout
   * it throws SaveIndeterminateError so the finish CTA can show Retry; `userId` is used
   * only by the resolve-probe, never sent to the RPC.
   */
  async markWelcomeFlowComplete(
    userId: string,
    opts?: { onStatus?: (status: BoundedSaveStatus) => void; timeoutMs?: number },
  ): Promise<void> {
    return log.track(
      "markWelcomeFlowComplete",
      `Marking Welcome Flow complete for user ${userId}`,
      { userId },
      async () => {
        await withBoundedSave({
          timeoutMs: opts?.timeoutMs ?? 15_000,
          save: async () => {
            // No arguments — the RPC derives the user from auth.uid(); a client cannot
            // complete the flow for anyone else.
            const { error } = await (supabase as any).rpc("mark_welcome_flow_complete");
            if (error) throw error;
          },
          probe: async () => {
            // `(supabase as any)`: the generated types lag the hand-applied migration,
            // so welcome_flow_completed_at isn't in the profiles column set yet (same
            // reason the RPCs use the cast; drop both when types are regenerated).
            const { data, error } = await (supabase as any)
              .from("profiles")
              .select("welcome_flow_completed_at")
              .eq("user_id", userId)
              .maybeSingle();
            if (error) return "unresolved";
            return (data as { welcome_flow_completed_at: string | null } | null)
              ?.welcome_flow_completed_at
              ? "persisted"
              : "unresolved";
          },
          onStatus: opts?.onStatus,
          beacon: (outcome, details) => {
            // Telemetry only — user id + event kind, never PII (DoD §17). Routes through
            // record_event, never a direct ops_events insert (ADR-0060).
            void (supabase as any).rpc("record_event", {
              p_sink: "ops_events",
              p_kind:
                outcome === "saved" ? "welcome.complete.ok" : `welcome.complete.${outcome}`,
              p_payload: { user_id: userId, ...details },
            });
          },
        });
        log.info("markWelcomeFlowComplete", `Welcome Flow marked complete for user ${userId}`, {
          userId,
        });
      },
    );
  },

  /**
   * Live count of members who have completed the Welcome Flow (includes the viewer if
   * they have). Powered by the SECURITY DEFINER RPC `get_welcome_flow_completion_count()`,
   * which counts source-of-truth rows at read time — excluding test accounts — and returns
   * a single scalar, never per-user rows. There is NO stored counter to drift (ADR-0050;
   * src/components/welcome/CLAUDE.md). Used by the Courses completion stat (§4.11 / §6.13).
   */
  async getWelcomeFlowCompletionCount(): Promise<number> {
    return log.track(
      "getWelcomeFlowCompletionCount",
      "Reading live Welcome Flow completion count",
      {},
      async () => {
        const { data, error } = await (supabase as any).rpc(
          "get_welcome_flow_completion_count",
        );
        if (error) {
          // Report through the service-result seam (logs + mirrors to audit_log +
          // reportError), not a bare log.error — services/CLAUDE.md requires reporting.
          // Throws the throwMessage, so the hook's QueryCache onError also surfaces it.
          handleServiceError(error as Error, {
            logger: log,
            action: "getWelcomeFlowCompletionCount",
            message: `Failed to read Welcome Flow completion count: ${(error as Error)?.message ?? "unknown"}`,
            throwMessage: "Failed to read Welcome Flow completion count.",
          });
        }
        return Number(data) || 0;
      },
    );
  },
};
