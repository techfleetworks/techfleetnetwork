import { Check, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MEMBERSHIP_TIERS,
  TIER_ORDER,
  FOUNDING_PROMO,
  isFoundingPromoActive,
  type MembershipTier,
  type TierId,
} from "@/config/membership-tiers";

export interface MembershipTiersGridProps {
  /** The user's current tier; controls per-card CTA state. */
  currentTier?: TierId | null;
  /** Whether the user is already a Founding Member (locked-in rate). */
  isFoundingMember?: boolean;
  /** Triggered when the user picks a CTA. */
  onSelect: (intent: {
    tier: TierId;
    recurrence?: "monthly" | "yearly";
    skuUrl?: string;
    action: "subscribe" | "waitlist" | "downgrade" | "manage";
  }) => void;
  className?: string;
}

/**
 * Three-up tier grid that mirrors techfleet.org/overview content exactly.
 * Stacks on mobile, side-by-side on ≥lg. Community card is visually
 * highlighted as "popular" — matches the .org hierarchy and conversion goal.
 */
export function MembershipTiersGrid({
  currentTier = "starter",
  isFoundingMember = false,
  onSelect,
  className,
}: MembershipTiersGridProps) {
  const promoActive = isFoundingPromoActive();

  return (
    <div className={cn("space-y-6", className)}>
      <div
        role="list"
        aria-label="Tech Fleet membership tiers"
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6"
      >
        {TIER_ORDER.map((id) => (
          <TierCard
            key={id}
            tier={MEMBERSHIP_TIERS[id]}
            isCurrent={currentTier === id}
            currentTier={currentTier ?? "starter"}
            isFoundingMember={isFoundingMember}
            promoActive={promoActive}
            onSelect={onSelect}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto">
        🌍 <strong>Fair pricing, wherever you are.</strong> We use Purchasing Power Parity.
        If you're outside higher-cost regions, you may see an automatic discount at
        checkout based on your country — no code needed.
      </p>
    </div>
  );
}

interface TierCardProps {
  tier: MembershipTier;
  isCurrent: boolean;
  currentTier: TierId;
  isFoundingMember: boolean;
  promoActive: boolean;
  onSelect: MembershipTiersGridProps["onSelect"];
}

function TierCard({
  tier,
  isCurrent,
  currentTier,
  isFoundingMember,
  promoActive,
  onSelect,
}: TierCardProps) {
  const headingId = `tier-${tier.id}-name`;
  const tierRank: Record<TierId, number> = { starter: 0, community: 1, professional: 2 };
  const isUpgrade = tierRank[tier.id] > tierRank[currentTier];
  const isDowngrade = tierRank[tier.id] < tierRank[currentTier];

  return (
    <article
      role="listitem"
      aria-labelledby={headingId}
      className={cn(
        "relative flex flex-col rounded-lg border bg-card p-6 transition-shadow",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        tier.popular
          ? "border-primary/60 shadow-lg ring-1 ring-primary/20"
          : "border-border shadow-sm hover:shadow-md",
      )}
    >
      {tier.popular && (
        <Badge
          variant="default"
          className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 px-3 py-1"
        >
          <Star className="h-3 w-3" aria-hidden="true" />
          <span>Most Popular</span>
          <span className="sr-only"> tier</span>
        </Badge>
      )}

      {/* Header: name + tagline */}
      <div className="space-y-2">
        <h3 id={headingId} className="text-xl font-bold text-foreground">
          {tier.name}
        </h3>
        <p className="text-sm text-muted-foreground min-h-[3rem]">{tier.tagline}</p>
      </div>

      {/* Price block */}
      <div className="my-6 space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-foreground">{tier.priceDisplay}</span>
          <span className="text-sm text-muted-foreground">{tier.priceSubtitle}</span>
        </div>
        {tier.priceFootnote && (
          <p className="text-xs text-muted-foreground">{tier.priceFootnote}</p>
        )}

        {/* Founding-member promo strip on Community card only */}
        {tier.id === "community" && promoActive && (
          <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Founding Member offer
            </div>
            <p className="text-sm font-bold text-foreground">
              {FOUNDING_PROMO.yearlyPriceDisplay}/year ·{" "}
              <span className="text-primary">{FOUNDING_PROMO.savingsLabel}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {FOUNDING_PROMO.description}
            </p>
          </div>
        )}
      </div>

      {/* Feature list */}
      <div className="flex-1 space-y-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Includes
          </h4>
          <ul className="space-y-2" role="list">
            {tier.uniqueFeatures.map((f) => (
              <FeatureRow key={`${tier.id}-${f.label}`} feature={f} />
            ))}
          </ul>
        </div>

        {tier.inheritedFeatures && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Plus everything in {tier.inheritedFeatures.fromTier}
            </h4>
            <ul className="space-y-2" role="list">
              {tier.inheritedFeatures.features.map((f) => (
                <FeatureRow
                  key={`${tier.id}-inh-${f.label}`}
                  feature={f}
                  muted
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* CTA area */}
      <div className="mt-6 pt-4 border-t border-border">
        <TierCtaButtons
          tier={tier}
          isCurrent={isCurrent}
          isUpgrade={isUpgrade}
          isDowngrade={isDowngrade}
          isFoundingMember={isFoundingMember}
          promoActive={promoActive}
          onSelect={onSelect}
        />
      </div>
    </article>
  );
}

function FeatureRow({ feature, muted = false }: { feature: { label: string; qualifier?: string }; muted?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Check
        className={cn(
          "h-4 w-4 mt-0.5 flex-shrink-0",
          muted ? "text-muted-foreground" : "text-primary",
        )}
        aria-hidden="true"
      />
      <span className={cn(muted ? "text-muted-foreground" : "text-foreground")}>
        {feature.label}
        {feature.qualifier && (
          <span className="text-muted-foreground"> ({feature.qualifier})</span>
        )}
      </span>
    </li>
  );
}

interface CtaProps {
  tier: MembershipTier;
  isCurrent: boolean;
  isUpgrade: boolean;
  isDowngrade: boolean;
  isFoundingMember: boolean;
  promoActive: boolean;
  onSelect: MembershipTiersGridProps["onSelect"];
}

function TierCtaButtons({
  tier,
  isCurrent,
  isUpgrade,
  isDowngrade,
  isFoundingMember,
  promoActive,
  onSelect,
}: CtaProps) {
  // Current tier: show non-actionable confirmation (keyboard accessible,
  // but aria-disabled rather than `disabled` so SR users still hear the state).
  if (isCurrent) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-muted text-muted-foreground text-sm font-medium"
        role="status"
        aria-label={`${tier.name} is your current membership tier`}
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        <span>Your current tier</span>
        {tier.id === "community" && isFoundingMember && (
          <Badge variant="secondary" className="ml-2 text-xs">
            Founding Member
          </Badge>
        )}
      </div>
    );
  }

  // Downgrade path — sends user to Gumroad customer portal via parent handler
  if (isDowngrade) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => onSelect({ tier: tier.id, action: "downgrade" })}
      >
        Switch to {tier.name}
      </Button>
    );
  }

  // Community: single Subscribe CTA. Routes to the best available SKU
  // (founding-rate yearly while promo is active, otherwise monthly).
  if (tier.cta.type === "dual_recurrence") {
    const useFoundingYearly = promoActive && Boolean(tier.skus?.yearlyFounding);
    const skuUrl = useFoundingYearly
      ? tier.skus?.yearlyFounding
      : tier.skus?.monthly;
    const recurrence: "monthly" | "yearly" = useFoundingYearly ? "yearly" : "monthly";

    return (
      <Button
        type="button"
        className="w-full"
        onClick={() =>
          onSelect({
            tier: tier.id,
            recurrence,
            skuUrl,
            action: "subscribe",
          })
        }
      >
        Subscribe
      </Button>
    );
  }

  // Professional: waitlist if no SKU configured
  if (tier.cta.type === "waitlist") {
    return (
      <Button
        type="button"
        variant={isUpgrade ? "default" : "outline"}
        className="w-full"
        onClick={() => onSelect({ tier: tier.id, action: "waitlist" })}
      >
        Coming soon · Join waitlist
      </Button>
    );
  }

  // Single-SKU subscribe (e.g. Professional once SKU exists)
  if (tier.cta.type === "subscribe") {
    return (
      <Button
        type="button"
        className="w-full"
        onClick={() =>
          onSelect({
            tier: tier.id,
            skuUrl: tier.skus?.primary,
            action: "subscribe",
          })
        }
      >
        Subscribe
      </Button>
    );
  }

  // Starter / current_or_signup fallback (only reached when user is on a
  // higher tier and clicks the Starter card — handled by isDowngrade above)
  return null;
}
