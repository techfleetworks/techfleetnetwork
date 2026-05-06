#!/usr/bin/env node
/**
 * One-off image optimizer. Compresses every PNG in src/assets/ in place
 * (palette quantization + zlib max), keeping the same filename so existing
 * imports keep working. Also re-encodes giant SVGs in public/images/ via SVGO.
 *
 * Run with: node scripts/optimize-images.mjs
 */
import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import sharp from "sharp";
import { optimize } from "svgo";

const ROOTS = ["src/assets", "public/images"];
const MAX_DIM = 1600; // hero/welcome slides never need to render larger than this

let savedBytes = 0;
let processed = 0;

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function compressPng(p) {
  const before = (await stat(p)).size;
  const img = sharp(p);
  const meta = await img.metadata();
  const resize = (meta.width ?? 0) > MAX_DIM ? { width: MAX_DIM, withoutEnlargement: true } : null;
  const buf = await (resize ? img.resize(resize) : img)
    .png({ palette: true, quality: 80, compressionLevel: 9, effort: 10 })
    .toBuffer();
  if (buf.length < before) {
    await writeFile(p, buf);
    savedBytes += before - buf.length;
    console.log(`  png ${p}: ${(before / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB`);
  }
  processed++;
}

async function compressJpg(p) {
  const before = (await stat(p)).size;
  const buf = await sharp(p).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  if (buf.length < before) {
    await writeFile(p, buf);
    savedBytes += before - buf.length;
    console.log(`  jpg ${p}: ${(before / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB`);
  }
  processed++;
}

async function compressSvg(p) {
  const before = (await stat(p)).size;
  const src = await readFile(p, "utf8");
  const result = optimize(src, { multipass: true, path: p });
  if (result.data && result.data.length < before) {
    await writeFile(p, result.data);
    savedBytes += before - result.data.length;
    console.log(`  svg ${p}: ${(before / 1024).toFixed(0)}KB → ${(result.data.length / 1024).toFixed(0)}KB`);
  }
  processed++;
}

for (const root of ROOTS) {
  console.log(`\n→ ${root}`);
  const files = await walk(root);
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    try {
      if (ext === ".png") await compressPng(f);
      else if (ext === ".jpg" || ext === ".jpeg") await compressJpg(f);
      else if (ext === ".svg") await compressSvg(f);
    } catch (e) {
      console.warn(`  skip ${f}: ${e.message}`);
    }
  }
}

console.log(`\nDone. Processed ${processed} files. Saved ${(savedBytes / 1024).toFixed(0)} KB.`);
