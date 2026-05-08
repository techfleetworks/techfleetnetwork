import { PolicyMarkdownView } from "@/components/PolicyMarkdownView";

export default function TermsOfUsePage() {
  return (
    <PolicyMarkdownView
      title="Terms of Use"
      effective="May 7, 2026"
      contactEmail="info@techfleet.network"
      markdownUrl="/policies/Terms-of-Use.md"
    />
  );
}
