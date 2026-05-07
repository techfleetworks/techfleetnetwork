import { ImgHTMLAttributes, useMemo } from "react";

/**
 * ResponsiveImage — emits a <picture> with AVIF + WebP srcsets and a PNG fallback.
 *
 * Convention: variant generation script (scripts/gen-variants.mjs) produces files
 * named `<base>-<width>.avif` and `<base>-<width>.webp` next to the source PNG.
 * Vite's `?url` import resolves each to a hashed, cache-busted URL at build time.
 *
 * Usage:
 *   <ResponsiveImage
 *     png={heroPng}
 *     avif={{ 480: heroAvif480, 960: heroAvif960, 1440: heroAvif1440 }}
 *     webp={{ 480: heroWebp480, 960: heroWebp960, 1440: heroWebp1440 }}
 *     sizes="(min-width:1024px) 448px, 100vw"
 *     alt="..." width={448} height={224}
 *   />
 */
type WidthMap = Partial<Record<480 | 960 | 1440, string>>;

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, "srcSet"> {
  png: string;
  avif?: WidthMap;
  webp?: WidthMap;
  sizes?: string;
}

function buildSrcset(map?: WidthMap): string | undefined {
  if (!map) return undefined;
  const parts = Object.entries(map)
    .filter(([, url]) => Boolean(url))
    .map(([w, url]) => `${url} ${w}w`);
  return parts.length ? parts.join(", ") : undefined;
}

export function ResponsiveImage({ png, avif, webp, sizes, alt = "", ...img }: Props) {
  const avifSet = useMemo(() => buildSrcset(avif), [avif]);
  const webpSet = useMemo(() => buildSrcset(webp), [webp]);
  return (
    <picture>
      {avifSet && <source type="image/avif" srcSet={avifSet} sizes={sizes} />}
      {webpSet && <source type="image/webp" srcSet={webpSet} sizes={sizes} />}
      <img src={png} alt={alt} {...img} />
    </picture>
  );
}
