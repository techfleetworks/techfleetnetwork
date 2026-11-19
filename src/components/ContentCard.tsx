/**
 * ContentCard — the shared, theme-aware listing card (public-access B9).
 *
 * One card for a class or a project, rendered IDENTICALLY to a logged-out
 * visitor and a signed-in member; only the ACTIONS differ, and those are
 * supplied by the caller. The card is purely PRESENTATIONAL: it takes plain
 * props and renders them. It does NOT read auth, route, or fetch — so the same
 * component serves the public pages (B10/B11) and the logged-in platform
 * without a business rule leaking into the view (dependency direction).
 *
 * Design: mdenner's 2026-11-16 listing-card redesign — image area with the
 * status badge overlaid top-left, title, a meta line, a chip row (track for
 * classes / team hats for projects), a 2-line blurb, and two CTAs pinned to the
 * bottom (primary = the join/register/apply action, secondary = view details).
 * It sits on the platform's `.tf-card` brand surface, so light/dark come for
 * free from the design tokens (no per-mode code). The card height fills its grid
 * row (flex column + footer mt-auto) instead of a fixed pixel height, so long
 * titles, large-text (200% zoom) and small screens never clip the CTAs.
 *
 * See docs/adr/20261118-shared-content-card.md and src/components/content-card.feature.
 */
import { forwardRef, type ReactNode } from "react";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Only tones that render with verified WCAG AA contrast in BOTH light and dark
// are exposed. `info` is intentionally absent (no `--info` token exists, so
// `bg-info` would emit nothing and the badge would be invisible), and `warning`
// is absent because amber (`--warning` 38 92% 50%) has no single foreground that
// passes AA in both modes without darkening the global token — a repo-wide change
// out of B9's scope (tracked in the ADR). Callers map an "opening soon" status to
// `neutral` until a contrast-tuned amber tone lands.
export type ContentCardTone = "success" | "primary" | "neutral";

/**
 * A single CTA. Supply `href` for navigation (renders an <a>) OR `onClick` for
 * an in-page action (renders a <button>). The caller owns auth-awareness: a
 * public page passes a sign-in redirect-back href here, a logged-in page passes
 * the real action — the card does not decide.
 *
 * NOTE: an `href` renders a plain <a>, so an INTERNAL route would full-page
 * reload. For in-app navigation the caller passes `onClick` (e.g. a router
 * navigate), keeping the router out of this view. See ADR F4.
 */
export interface ContentCardAction {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Disambiguates the action for assistive tech across a list ("View details for <title>"). */
  ariaLabel?: string;
}

export interface ContentCardStatus {
  label: string;
  tone?: ContentCardTone;
}

export interface ContentCardBaseProps {
  title: string;
  /** When set, the title becomes a link to the same target as "view details". */
  titleHref?: string;
  /** Overlaid top-left on the image. */
  status?: ContentCardStatus;
  /** A single meta line, e.g. "Training starts on March 3". */
  meta?: ReactNode;
  /** Track (classes) or team hats (projects). */
  chips?: string[];
  /** Short, purpose-built blurb; clamped to two lines. */
  blurb?: string;
  /** The main CTA (join / register / apply). Rendered as the filled primary button. */
  primaryAction: ContentCardAction;
  /** View details. Rendered as the bordered secondary button. */
  secondaryAction?: ContentCardAction;
  className?: string;
  /** Analytics / test hook, mirroring the existing listing cards. */
  "data-card"?: string;
}

// Alt text is compiler-REQUIRED whenever an image is supplied (WCAG 1.1.1): a
// caller cannot ship an informative cover image with no alt. No image → no alt.
export type ContentCardImage =
  | { imageUrl: string; imageAlt: string }
  | { imageUrl?: undefined; imageAlt?: never };

export type ContentCardProps = ContentCardBaseProps & ContentCardImage;

// Solid, theme-aware badge surfaces so the overlay stays legible over ANY image.
// Each pairing is AA-verified in both modes: deep-green/deep-blue carry white;
// neutral inverts the surface. No hardcoded colors — all token-based.
const STATUS_TONE: Record<ContentCardTone, string> = {
  success: "bg-success text-primary-foreground",
  primary: "bg-primary text-primary-foreground",
  neutral: "bg-foreground text-background",
};

function ActionButton({
  action,
  variant,
}: {
  action: ContentCardAction;
  variant: "default" | "outline";
}) {
  if (action.href) {
    return (
      <Button asChild variant={variant} className="w-full" size="sm">
        <a href={action.href} aria-label={action.ariaLabel}>
          {action.label}
        </a>
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant={variant}
      className="w-full"
      size="sm"
      onClick={action.onClick}
      aria-label={action.ariaLabel}
    >
      {action.label}
    </Button>
  );
}

export const ContentCard = forwardRef<HTMLDivElement, ContentCardProps>(function ContentCard(
  {
    title,
    titleHref,
    imageUrl,
    imageAlt,
    status,
    meta,
    chips,
    blurb,
    primaryAction,
    secondaryAction,
    className,
    ...rest
  },
  ref,
) {
  const tone = status?.tone ?? "neutral";
  return (
    <Card
      ref={ref}
      className={cn("flex h-full flex-col overflow-hidden p-0", className)}
      {...rest}
    >
      {/* Image area (150px). The wrapper's bg-muted IS the placeholder: when
          there is no image, or the image URL is broken (onError hides the <img>),
          the muted surface shows instead of a broken-image glyph. */}
      <div className="relative h-[150px] w-full shrink-0 bg-muted">
        {imageUrl && (
          // onError is a media-load event (graceful fallback to the placeholder),
          // not a mouse/keyboard interaction — the a11y rule's false positive here.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <img
            src={imageUrl}
            alt={imageAlt}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        {status && (
          <Badge
            className={cn(
              "absolute left-3 top-3 border-transparent px-3 py-1 text-sm font-semibold uppercase tracking-wide",
              STATUS_TONE[tone],
            )}
          >
            {status.label}
          </Badge>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-6">
        <CardTitle as="h3" className="text-[1.125rem] sm:text-[1.25rem]">
          {titleHref ? (
            <a
              href={titleHref}
              className="rounded-sm no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </CardTitle>

        {meta && <p className="text-base text-muted-foreground">{meta}</p>}

        {chips && chips.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Categories">
            {chips.map((chip) => (
              <li key={chip}>
                <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-sm font-normal">
                  {chip}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {blurb && (
          <p className="line-clamp-2 text-base text-foreground">{blurb}</p>
        )}
      </CardContent>

      <CardFooter className="mt-auto flex flex-col gap-2 p-6 pt-0 sm:flex-row">
        {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        <ActionButton action={primaryAction} variant="default" />
      </CardFooter>
    </Card>
  );
});
