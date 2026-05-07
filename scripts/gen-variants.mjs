import sharp from "sharp";
import { readdirSync, statSync } from "fs";
import { join, parse } from "path";

const ASSETS = "src/assets";
const TARGETS = [
  "hero-space.png",
  "welcome-slide-1-v2.png",
  "welcome-slide-2-v2.png",
  "welcome-slide-3-v2.png",
  "welcome-slide-4-v2.png",
  "welcome-slide-5-v2.png",
  "courses-complete-celebration.png",
  "quest-empty-state.png",
];
const WIDTHS = [480, 960, 1440];

for (const file of TARGETS) {
  const src = join(ASSETS, file);
  try { statSync(src); } catch { console.log("skip", file); continue; }
  const { name } = parse(file);
  const meta = await sharp(src).metadata();
  for (const w of WIDTHS) {
    if (meta.width && w > meta.width * 1.5) continue;
    const base = sharp(src).resize({ width: w, withoutEnlargement: true });
    await base.clone().avif({ quality: 50, effort: 4 }).toFile(join(ASSETS, `${name}-${w}.avif`));
    await base.clone().webp({ quality: 78 }).toFile(join(ASSETS, `${name}-${w}.webp`));
  }
  console.log("done", file);
}
