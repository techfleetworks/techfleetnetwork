import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SafeExternalLink } from "@/components/security/SafeExternalLink";

export function SafeMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      allowedElements={["p", "br", "strong", "em", "a", "ul", "ol", "li", "blockquote", "code", "pre", "h1", "h2", "h3", "h4"]}
      components={{
        a: ({ href, children: linkChildren }) => {
          return <SafeExternalLink href={href} fallback={<span>{linkChildren}</span>}>{linkChildren}</SafeExternalLink>;
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}