/**
 * Normalizes exploration query text for fuzzy grouping.
 * Expands abbreviations, removes stop words, and sorts keywords
 * so semantically similar queries map to the same key.
 */

const SYNONYMS: Record<string, string> = {
  cx: "customer experience",
  ux: "user experience",
  ui: "user interface",
  pm: "project management",
  qa: "quality assurance",
  dev: "development",
  devops: "development operations",
  ml: "machine learning",
  ai: "artificial intelligence",
  ds: "design sprint",
  dx: "developer experience",
  sd: "service design",
  wd: "web design",
  mgmt: "management",
  eng: "engineering",
  js: "javascript",
  ts: "typescript",
  fe: "frontend",
  be: "backend",
  db: "database",
  api: "application programming interface",
  pr: "pull request",
  scrum: "scrum",
  retro: "retrospective",
  standup: "standup",
  mvp: "minimum viable product",
  poc: "proof of concept",
  kpi: "key performance indicator",
  okr: "objectives key results",
  agile: "agile",
  figma: "figma",
  notion: "notion",
  discord: "discord",
  research: "research",
  analysis: "analysis",
  strategy: "strategy",
};

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "shall", "can",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "about", "between", "after", "before", "during",
  "it", "its", "this", "that", "these", "those", "i", "me", "my",
  "we", "our", "you", "your", "how", "what", "when", "where", "which",
  "who", "whom", "why", "if", "then", "so", "not", "no", "up", "out",
  "just", "also", "very", "really", "want", "need", "like", "get",
  "know", "learn", "try", "make", "use", "find", "help", "start",
  "understand", "more", "some", "any",
]);

export function normalizeQueryKey(raw: string): string {
  let text = raw.trim().toLowerCase();

  // Expand abbreviations (word-boundary aware)
  const words = text.split(/\s+/);
  const expanded = words.map((w) => SYNONYMS[w] ?? w);
  text = expanded.join(" ");

  // Tokenize, remove stop words, deduplicate, sort
  const tokens = text
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

  const unique = [...new Set(tokens)].sort();
  return unique.join(" ");
}
