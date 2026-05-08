import { PolicyMarkdownView } from "@/components/PolicyMarkdownView";

export default function TermsPage() {
  return (
    <PolicyMarkdownView
      title="Terms & Conditions"
      effective="May 7, 2026"
      contactEmail="info@techfleet.network"
      markdownUrl="/policies/Terms-and-Conditions.md"
    />
  );
}
