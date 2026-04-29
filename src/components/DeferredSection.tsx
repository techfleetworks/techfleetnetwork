import { ReactNode, useEffect, useRef, useState } from "react";

type DeferredSectionProps = {
  children: ReactNode;
  fallback: ReactNode;
  className?: string;
  minHeight?: number;
  rootMargin?: string;
  timeoutMs?: number;
  "aria-label"?: string;
};

export function DeferredSection({
  children,
  fallback,
  className,
  minHeight,
  rootMargin = "600px 0px",
  timeoutMs = 3500,
  "aria-label": ariaLabel,
}: DeferredSectionProps) {
  const hostRef = useRef<HTMLElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (shouldRender) return;

    const host = hostRef.current;
    if (!host || typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 }
    );

    observer.observe(host);
    const timeout = window.setTimeout(() => setShouldRender(true), timeoutMs);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [rootMargin, shouldRender, timeoutMs]);

  return (
    <section ref={hostRef} className={className} style={{ minHeight }} aria-label={ariaLabel}>
      {shouldRender ? children : fallback}
    </section>
  );
}