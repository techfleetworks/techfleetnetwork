import type { AnchorHTMLAttributes, ReactNode } from "react";
import { safeHref } from "@/lib/security";

interface SafeExternalLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> {
  href: unknown;
  children: ReactNode;
  fallback?: ReactNode;
}

export function SafeExternalLink({ href, children, fallback = null, ...props }: SafeExternalLinkProps) {
  const safe = safeHref(href);
  if (!safe) return <>{fallback}</>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" {...props}>
      {children}
    </a>
  );
}

export function getSafeLinkHostname(href: unknown): string | null {
  const safe = safeHref(href);
  if (!safe) return null;
  try {
    return new URL(safe).hostname;
  } catch {
    return safe;
  }
}