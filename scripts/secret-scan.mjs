import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const allowedFiles = new Set([".env.example"]);
const ignoredPrefixes = ["node_modules/", "dist/", "coverage/", "playwright-report/", "test-results/"];
const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => !ignoredPrefixes.some((prefix) => file.startsWith(prefix)));

const secretPatterns = [
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
  { name: "Lovable Cloud secret key", pattern: /\bsb_secret_[A-Za-z0-9_]{20,}\b/g },
  { name: "service role key", pattern: /\bservice_role\b[^\n]{0,80}\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/gi },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/g },
  { name: "Stripe live secret", pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: "Slack bot token", pattern: /\bxoxb-[A-Za-z0-9-]{20,}\b/g },
];

const findings = [];

for (const file of trackedFiles) {
  if (!existsSync(file)) continue;

  if ((file === ".env" || /^\.env\./.test(file)) && !allowedFiles.has(file)) {
    findings.push(`${file}: committed environment file is forbidden`);
    continue;
  }

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${file}: matched ${name}`);
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed. Remove the values from tracked files and rotate any exposed private secrets.");
  for (const finding of findings.slice(0, 50)) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret scan passed across ${trackedFiles.length} tracked files.`);
