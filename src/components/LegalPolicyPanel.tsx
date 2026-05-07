import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { recordPolicyAcknowledgment } from "@/lib/policies";

interface LegalPolicyPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: () => void;
  loading?: boolean;
  /** Sheet/dialog title, e.g. "Tech Fleet Privacy Policy" */
  title: string;
  /** Short description shown beneath the title */
  description: string;
  /** Public URL of the markdown source, e.g. "/policies/Privacy-Policy.md" */
  markdownUrl: string;
  /** Public URL of the .docx for download/print, e.g. "/policies/Privacy-Policy.docx" */
  downloadUrl: string;
  /** Used for resize key + checkbox id (e.g. "privacy-policy") */
  panelKey: string;
  /** Acknowledgment label (e.g. "Tech Fleet Privacy Policy") */
  acceptLabel: string;
}

const cache = new Map<string, string>();

export function LegalPolicyPanel({
  open,
  onOpenChange,
  onAccepted,
  loading,
  title,
  description,
  markdownUrl,
  downloadUrl,
  panelKey,
  acceptLabel,
}: LegalPolicyPanelProps) {
  const [agreed, setAgreed] = useState(false);
  const [content, setContent] = useState<string>(() => cache.get(markdownUrl) ?? "");
  const [loadError, setLoadError] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (cache.has(markdownUrl)) {
      setContent(cache.get(markdownUrl) || "");
      return;
    }
    let aborted = false;
    setFetching(true);
    setLoadError(false);
    fetch(markdownUrl, { credentials: "omit" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (aborted) return;
        cache.set(markdownUrl, text);
        setContent(text);
      })
      .catch(() => {
        if (!aborted) setLoadError(true);
      })
      .finally(() => {
        if (!aborted) setFetching(false);
      });
    return () => {
      aborted = true;
    };
  }, [open, markdownUrl]);

  const handleAccept = () => {
    if (!agreed) return;
    recordPolicyAcknowledgment("checkbox");
    onAccepted();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        resizeKey={panelKey}
        className="w-full sm:max-w-2xl flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-xl">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-text underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm w-fit"
          >
            Download a copy (.docx)
          </a>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {fetching && !content && (
            <div className="space-y-3" aria-label="Loading policy">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}
          {loadError && (
            <div className="text-sm text-destructive" role="alert">
              We couldn't load this policy right now.{" "}
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Open the .docx version
              </a>{" "}
              or try again in a moment.
            </div>
          )}
          {content && (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </ScrollArea>

        <div className="border-t px-6 py-4 space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id={`agree-${panelKey}`}
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
              disabled={!content && !loadError}
            />
            <label
              htmlFor={`agree-${panelKey}`}
              className="text-sm text-foreground leading-snug cursor-pointer"
            >
              I have read and agree to the {acceptLabel}.
            </label>
          </div>
          <Button
            onClick={handleAccept}
            disabled={!agreed || loading || (!content && !loadError)}
            className="w-full"
          >
            {loading ? "Saving…" : `Accept ${acceptLabel}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
