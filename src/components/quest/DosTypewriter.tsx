import { useState, useEffect, useRef } from "react";

interface DosTypewriterProps {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
  /** If true, show full text immediately */
  instant?: boolean;
}

/**
 * DOS-style typewriter text with blinking block cursor.
 * Renders one character at a time like an 80s terminal.
 */
export function DosTypewriter({
  text,
  speed = 30,
  className = "",
  onComplete,
  instant = false,
}: DosTypewriterProps) {
  const [displayedCount, setDisplayedCount] = useState(instant ? text.length : 0);
  const prevTextRef = useRef(text);

  useEffect(() => {
    if (text !== prevTextRef.current) {
      prevTextRef.current = text;
      if (instant) {
        setDisplayedCount(text.length);
        return;
      }
      setDisplayedCount(0);
    }
  }, [text, instant]);

  useEffect(() => {
    if (instant || displayedCount >= text.length) {
      if (displayedCount >= text.length) onComplete?.();
      return;
    }
    const timer = setTimeout(() => setDisplayedCount((c) => c + 1), speed);
    return () => clearTimeout(timer);
  }, [displayedCount, text.length, speed, instant, onComplete]);

  const isTyping = displayedCount < text.length;

  return (
    <span className={className} aria-label={text} role="status">
      {text.slice(0, displayedCount)}
      <span
        className={isTyping ? "animate-pulse" : "animate-blink"}
        aria-hidden="true"
        style={{ display: "inline-block", width: "0.6em", height: "1em", background: "#01FF85", verticalAlign: "text-bottom", marginLeft: "1px" }}
      />
    </span>
  );
}
