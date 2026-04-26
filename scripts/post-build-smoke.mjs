import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const distDir = "dist";
const assetsDir = join(distDir, "assets");
const required = [
  "https://iqsjhrhsjlgjiaedzmtz.supabase.co",
  "sb_publishable_NnnYUf3wUfVWGyOlhQf9UQ_92QsC3YE",
];
const forbidden = [
  "supabaseUrl is required",
  "VITE_SUPABASE_URL}/functions",
  "undefined/functions/v1",
];

function fail(message) {
  console.error(`Post-build smoke failed: ${message}`);
  process.exit(1);
}

if (!existsSync(join(distDir, "index.html"))) fail("dist/index.html was not emitted");
if (!existsSync(assetsDir)) fail("dist/assets was not emitted");

const html = readFileSync(join(distDir, "index.html"), "utf8");
if (!html.includes('<div id="root"></div>')) fail("root mount node is missing");
if (!/assets\/index-[^"']+\.js/.test(html)) fail("entry JavaScript bundle is missing");

const jsBundle = readdirSync(assetsDir)
  .filter((file) => file.endsWith(".js"))
  .map((file) => readFileSync(join(assetsDir, file), "utf8"))
  .join("\n");

for (const value of required) {
  if (!jsBundle.includes(value)) fail(`required production config is missing: ${value.slice(0, 24)}…`);
}

for (const value of forbidden) {
  if (jsBundle.includes(value)) fail(`bundle contains a known blank-screen risk: ${value}`);
}

console.log("Post-build smoke passed: production config and app entry are present.");