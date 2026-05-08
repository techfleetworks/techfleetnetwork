import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  title: string;
  effective?: string;
  contactEmail?: string;
  markdownUrl: string;
}

const cache = new Map<string, string>();

/**
 * Renders a public policy markdown page. Used for Terms & Conditions,
 * Terms of Use, and as the body of richer Privacy/Cookies/Accessibility
 * pages. Accessible to logged-out visitors (no auth gating).
 */
export function PolicyMarkdownView({ title, effective, contactEmail, markdownUrl }: Props) {
  const [md, setMd] = useState<string>(() => cache.get(markdownUrl) ?? "");
  const [loading, setLoading] = useState(!cache.has(markdownUrl));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cache.has(markdownUrl)) {
      setMd(cache.get(markdownUrl) || "");
      setLoading(false);
      return;
    }
    let aborted = false;
    setLoading(true);
    setError(false);
    fetch(markdownUrl, { credentials: "omit" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (aborted) return;
        cache.set(markdownUrl, text);
        setMd(text);
      })
      .catch(() => {
        if (!aborted) setError(true);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [markdownUrl]);

  return (
    <div className="container-app py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{title}</h1>
        {(effective || contactEmail) && (
          <p className="text-sm text-muted-foreground mt-1">
            {effective && <>Effective {effective}</>}
            {effective && contactEmail && <> · </>}
            {contactEmail && (
              <>
                Questions:{" "}
                <a className="underline" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>
              </>
            )}
          </p>
        )}
      </header>
      <section
        aria-labelledby="policy-text"
        className="prose prose-sm dark:prose-invert max-w-none"
      >
        <h2 id="policy-text" className="sr-only">{title}</h2>
        {loading && (
          <div className="space-y-3" aria-label="Loading policy">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}
        {error && !md && (
          <div className="text-sm text-destructive" role="alert">
            We couldn't load this policy right now. Please refresh and try again.
          </div>
        )}
        {md && <ReactMarkdown>{md}</ReactMarkdown>}
      </section>
    </div>
  );
}
