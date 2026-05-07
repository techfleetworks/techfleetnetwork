import { POLICIES } from "@/lib/policies";

/**
 * Inline list of the four governing platform policies, separated by commas
 * and "and" before the final item. Used inside the registration consent
 * checkbox label and the Google OAuth disclaimer.
 */
export function PolicyLinksInline({ className }: { className?: string }) {
  return (
    <span className={className}>
      {POLICIES.map((p, i) => {
        const isLast = i === POLICIES.length - 1;
        const isSecondLast = i === POLICIES.length - 2;
        return (
          <span key={p.key}>
            <a
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-text underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {p.label}
            </a>
            {isLast ? "" : isSecondLast ? ", and " : ", "}
          </span>
        );
      })}
    </span>
  );
}
