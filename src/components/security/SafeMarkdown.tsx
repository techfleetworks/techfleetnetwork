import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeHref } from "@/lib/security";

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      allowedElements={["p", "br", "strong", "em", "a", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "h4"]}
      components={{
        a: ({ href, children: linkChildren }) => {
          const safe = safeHref(href);
          return safe ? <a href={safe} target="_blank" rel="noopener noreferrer nofollow">{linkChildren}</a> : <span>{linkChildren}</span>;
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}