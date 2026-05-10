import { PolicyMarkdownView } from "@/components/PolicyMarkdownView";

export default function CodeOfConductPage() {
  return (
    <PolicyMarkdownView
      title="Code of Conduct & Anti-Harassment Policy"
      effective="October 15, 2023"
      contactEmail="safespace@techfleet.org"
      markdownUrl="/policies/Code-of-Conduct.md"
    />
  );
}
