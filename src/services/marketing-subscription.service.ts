import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { handleServiceError } from "@/lib/service-result";

const log = createLogger("MarketingSubscriptionService");

/**
 * Where a subscription intent originated. Expanded additively with 'welcome_flow'
 * (PR1 migration 20261010120100); the RPC coerces anything else to 'profile'.
 */
export type MarketingSource = "signup" | "profile" | "welcome_flow";

/**
 * Front door to the Email Octopus marketing-subscription fact. EO is the source of
 * truth for marketing consent (ADR-0017) — there is NO marketing state on `profiles`.
 * These wrap the owning RPCs (`get_my_marketing_subscription` /
 * `set_my_marketing_subscription`), self-scoped to auth.uid(); the Welcome Flow and
 * Notification Settings both read/write through this single seam.
 *
 * Double opt-in (P5): `set` records *intent* (a desired-state row the EO sync worker
 * picks up); the subscription completes only when the member confirms via EO's email.
 * So callers must never claim "subscribed" — at most "check your inbox to confirm".
 */
export const MarketingSubscriptionService = {
  /**
   * The member's stored subscription intent as a boolean (true = opted in). Reads the
   * persisted value via the owning RPC, NOT EO's lagging live state (§13). A missing
   * row (no intent yet) resolves to false — OFF by default (FR-e1).
   */
  async isSubscribed(): Promise<boolean> {
    return log.track("isSubscribed", "Reading marketing subscription intent", {}, async () => {
      const { data, error } = await supabase.rpc("get_my_marketing_subscription");
      if (error) {
        handleServiceError(error as Error, {
          logger: log,
          action: "isSubscribed",
          message: `Failed to read marketing subscription: ${(error as Error)?.message ?? "unknown"}`,
          throwMessage: "Failed to read your newsletter preference.",
        });
      }
      return data === "subscribed";
    });
  },

  /**
   * Record the member's newsletter opt-in intent. Self-scoped (pins to auth.uid();
   * no email parameter — the RPC uses the profile email). Fail-open at the DB layer
   * (records intent, never calls EO inline). `source` is telemetry only.
   */
  async setSubscribed(subscribed: boolean, source: MarketingSource): Promise<void> {
    return log.track(
      "setSubscribed",
      `Recording marketing subscription intent (${subscribed ? "on" : "off"})`,
      { source },
      async () => {
        const { error } = await supabase.rpc("set_my_marketing_subscription", {
          p_subscribed: subscribed,
          p_source: source,
        });
        if (error) {
          handleServiceError(error as Error, {
            logger: log,
            action: "setSubscribed",
            message: `Failed to set marketing subscription: ${(error as Error)?.message ?? "unknown"}`,
            throwMessage: "We couldn't save your newsletter choice. Please try again.",
          });
        }
      },
    );
  },
};
