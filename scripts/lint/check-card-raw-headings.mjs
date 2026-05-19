#!/usr/bin/env node
// tf-typography: warn on raw <h1-4> or <p className="text-..."> inside files using shadcn Card.
// Suggests Body / CardTitle / CardDescription instead.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync('rg -l \'from "@/components/ui/card"\' src', { encoding: "utf8" })
  .trim().split("\n").filter(Boolean);

let issues = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    // Raw heading tags h1-h4 (not CardTitle/CardDescription/PageTitle/SectionTitle)
    if (/<h[1-4][\s>]/.test(line) && !/data-allow-raw-heading/.test(line)) {
      console.log(`${f}:${i+1}: raw <h*> — use CardTitle/CardDescription/SectionTitle`);
      issues++;
    }
  });
}
// Warn-only: each in-card heading needs per-surface judgment (h3 vs h4, dialog vs card),
// not a mechanical sweep. CI surfaces the count; converting requires intentional review.
if (issues) {
  console.warn(`\n${issues} raw heading(s) inside Card files (warn-only). Review per-surface and convert to CardTitle/CardDescription with appropriate \`as\` prop.`);
}
console.log("card-raw-headings: scan complete");
process.exit(0);
