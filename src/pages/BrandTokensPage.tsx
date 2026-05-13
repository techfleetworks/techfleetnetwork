import { PageTitle, SectionTitle, Body, Muted } from "@/components/ui/typography";

/**
 * Tech Fleet Brand Visual Guide v1 — token reference page.
 * Admin-only swatch/typography reference so designers can verify what shipped.
 * Route: /admin/brand-tokens
 */

const COLORS: Array<{ name: string; hex: string; token: string; usage: string }> = [
  { name: "Tech Fleet Blue", hex: "#0056A7", token: "--primary", usage: "Primary actions, links, focus" },
  { name: "Action Blue", hex: "#1863DC", token: "--primary-hover", usage: "Hover / pressed states" },
  { name: "Deep Space Navy", hex: "#01061E", token: "--background (dark)", usage: "Dark surface base" },
  { name: "Growth Green", hex: "#56A045", token: "--growth", usage: "Success, confirmation" },
  { name: "Alert Orange", hex: "#EB4F26", token: "--destructive", usage: "Errors, destructive actions" },
  { name: "Brand Mint", hex: "#7DD8D0", token: "--brand-mint", usage: "Family-2 illustrations only" },
  { name: "Off-White", hex: "#F4F4F4", token: "--surface-alt", usage: "Light surface alt" },
  { name: "Dark Gray Text", hex: "#212121", token: "--foreground (light)", usage: "Body text on light" },
  { name: "Medium Gray", hex: "#757575", token: "--muted-foreground", usage: "Secondary text floor" },
];

const TYPE: Array<{ label: string; sample: string; size: string; family: string }> = [
  { label: "Display",   sample: "Build with Tech Fleet", size: "4rem / 110%",   family: "Futura PT / Jost" },
  { label: "Heading 1", sample: "Welcome back",          size: "3rem / 1.15",   family: "Futura PT / Jost" },
  { label: "Heading 2", sample: "Your active projects",  size: "2.25rem / 1.2", family: "Futura PT / Jost" },
  { label: "Heading 3", sample: "Recent activity",       size: "1.5rem / 1.3",  family: "Futura PT / Jost" },
  { label: "Heading 4", sample: "Section label",         size: "1.25rem / 1.35",family: "Futura PT / Jost" },
  { label: "Body L",    sample: "We design for clarity.",size: "1.125rem / 1.6",family: "Poppins" },
  { label: "Body",      sample: "We design for clarity.",size: "1rem / 1.6",    family: "Poppins" },
  { label: "Body S",    sample: "Helper copy lives here.",size:"0.875rem / 1.55",family:"Poppins" },
  { label: "Caption",   sample: "Updated January 15, 2026", size: "0.75rem / 1.4", family: "Poppins" },
];

export default function BrandTokensPage() {
  return (
    <div className="container-app py-8 space-y-10">
      <header className="space-y-2">
        <PageTitle>Brand tokens</PageTitle>
        <Muted>Tech Fleet Brand Visual Guide v1 — what's currently shipped.</Muted>
      </header>

      <section className="space-y-4">
        <SectionTitle>Color palette</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {COLORS.map((c) => (
            <div key={c.hex} className="rounded-lg border border-border overflow-hidden">
              <div className="h-20" style={{ backgroundColor: c.hex }} aria-hidden="true" />
              <div className="p-3 space-y-1">
                <div className="font-medium">{c.name}</div>
                <Muted className="font-mono text-xs">{c.hex} · {c.token}</Muted>
                <Body className="text-sm">{c.usage}</Body>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Typography scale</SectionTitle>
        <div className="space-y-3">
          {TYPE.map((t) => (
            <div key={t.label} className="rounded-lg border border-border p-4 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6">
              <Muted className="w-32 shrink-0 font-mono text-xs">{t.label}</Muted>
              <div className="flex-1">{t.sample}</div>
              <Muted className="font-mono text-xs">{t.size} · {t.family}</Muted>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionTitle>Spacing grid</SectionTitle>
        <Body>4px base unit. Use <code className="font-mono text-xs">space-1</code>…<code className="font-mono text-xs">space-16</code> tokens; never raw pixel values.</Body>
        <div className="space-y-2">
          {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <Muted className="w-16 font-mono text-xs">space-{n}</Muted>
              <div className="h-3 bg-primary rounded" style={{ width: `${n * 4}px` }} aria-hidden="true" />
              <Muted className="font-mono text-xs">{n * 4}px</Muted>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
