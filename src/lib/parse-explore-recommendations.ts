import type { RecommendationData } from "@/components/resources/ExploreRecommendationCard";

const VALID_TYPES = new Set(["course", "template", "user guide", "project", "web"]);

function normaliseType(raw: string): RecommendationData["type"] {
  const lower = raw.trim().toLowerCase();
  // Map legacy / alternate AI labels
  if (lower === "handbook") return "user guide";
  if (lower === "workshop") return "template";
  if (lower === "online") return "web";
  if (lower === "resource") return "web";
  if (lower === "external") return "web";
  if (VALID_TYPES.has(lower)) return lower as RecommendationData["type"];
  // Default to user guide (most common Tech Fleet content) rather than course
  return "user guide";
}

function extractField(block: string, label: string): string {
  // Match **Label:** value  (with optional emoji before label)
  const regex = new RegExp(`\\*\\*(?:🌟\\s*)?${label}:\\s*\\*\\*\\s*(.+?)(?=\\n\\*\\*|$)`, "is");
  const m = block.match(regex);
  return m ? m[1].trim() : "";
}

/**
 * Parse the streamed markdown from the AI into structured recommendation cards.
 */
export function parseRecommendations(markdown: string): RecommendationData[] {
  // Split on ### headers
  const sections = markdown.split(/^###\s+/m).filter((s) => s.trim());

  const results: RecommendationData[] = [];

  for (const section of sections) {
    const titleLine = section.split("\n")[0]?.trim();
    if (!titleLine) continue;

    const typeRaw = extractField(section, "Type");
    const description = extractField(section, "Description");
    const reason = extractField(section, "Why We Recommend");
    const link = extractField(section, "Link");

    if (!description && !reason) continue; // skip noise

    results.push({
      title: titleLine,
      type: normaliseType(typeRaw),
      description,
      reason,
      link: link || undefined,
    });
  }

  return results;
}
