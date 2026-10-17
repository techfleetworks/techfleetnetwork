import { useMutation, useQuery, useQueryClient } from "@/lib/react-query";
import {
  MarketingSubscriptionService,
  type MarketingSource,
} from "@/services/marketing-subscription.service";

const QUERY_KEY = ["marketing-subscription"] as const;

/**
 * The member's stored newsletter opt-in intent (true = opted in), read through the
 * single owner (MarketingSubscriptionService → EO front-door RPC). Shared by the
 * Welcome Flow newsletter step and Notification Settings so both reflect one value
 * (AC-e2). Double opt-in (P5): this is the member's *intent*, not a confirmed EO
 * subscription — never render it as "you're subscribed".
 */
export function useMarketingSubscription() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => MarketingSubscriptionService.isSubscribed(),
    staleTime: 60 * 1000,
  });
}

/**
 * Record a newsletter opt-in/opt-out intent, then refresh the shared value so every
 * surface stays in sync. `source` defaults to 'welcome_flow' for the flow's step (e).
 */
export function useSetMarketingSubscription(defaultSource: MarketingSource = "welcome_flow") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subscribed, source }: { subscribed: boolean; source?: MarketingSource }) =>
      MarketingSubscriptionService.setSubscribed(subscribed, source ?? defaultSource),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
