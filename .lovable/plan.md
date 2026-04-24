

## Three-tier Membership card layout — pulled from techfleet.org/overview

The Membership tab shows three side-by-side cards: **Starter**, **Community**, **Professional**. Same copy, same feature lists, same hierarchy as techfleet.org/overview — so what members see on the platform matches what brought them here.

### One pricing discrepancy to resolve

| Tier | techfleet.org | Gumroad SKU |
|---|---|---|
| Starter | FREE forever | n/a |
| **Community** | **$10/mo** | **$9.99/mo** |
| Community yearly (founding) | not shown | $49.99/yr |
| Community yearly (regular) | not shown | $99.99/yr |
| **Professional** | **$16/mo** | **no SKU yet** |

**Two questions for you:**
1. Display **$10/mo and $16/mo** (matching .org marketing) or **$9.99/mo** (literal Gumroad)? Recommendation: **$10/mo** on the cards with fine-print "$9.99 USD billed via Gumroad" — keeps brand consistent.
2. Has Professional been created on Gumroad yet? If not, that card shows **"Coming soon — join the waitlist"** instead of a checkout button, and I'll wire a `tier_waitlist` table + admin view.

### The three cards (content from techfleet.org/overview, verbatim)

```text
┌───────────────────┬─────────────────────┬───────────────────┐
│ STARTER           │ COMMUNITY ⭐ POPULAR │ PROFESSIONAL      │
│                   │                     │                   │
│ Shift your        │ Commit to           │ Working           │
│ mindset to        │ developing as a     │ professionals     │
│ empowered teams   │ service leader and  │ and executive     │
│ and build a       │ build empowered     │ leaders are a     │
│ better future     │ teams.              │ part of the       │
│ of work.          │                     │ future of work    │
│                   │                     │ too.              │
│ FREE              │ $10 USD / month     │ $16 USD / month   │
│ forever           │ — or —              │                   │
│                   │ $49.99/yr · founding│                   │
│                   │ rate, locked for    │                   │
│                   │ life (thru Sep 30)  │                   │
│                   │                     │                   │
│ Includes:         │ Includes:           │ Includes:         │
│ • Community Access│ • Asynchronous      │ • Career Coaching │
│ • Free Events     │   Courses           │ • Late-Career     │
│ • Leadership      │ • Communities of    │   Support         │
│   Training        │   Practice          │                   │
│ • Lab-Based       │ • Discounts to      │ Plus everything   │
│   Classes ($100)  │   Classes           │ in Community:     │
│ • Online Career   │ • Free Agile        │ • Asynchronous    │
│   Guidance        │   Training          │   Courses         │
│ • Platform Access │ • Group Mentoring   │ • Communities of  │
│ • Project Team    │ • Member-Only Events│   Practice        │
│   Training        │ • Residencies       │ • Discounts to    │
│                   │ • Skills Assessments│   Classes         │
│                   │ • Lab-Based Classes │ • Free Agile      │
│                   │   ($50)             │   Training        │
│                   │                     │ • Group Mentoring │
│                   │ Plus Starter:       │ • Member-Only     │
│                   │ • Community Access  │   Events          │
│                   │ • Free Leadership   │ • Residencies     │
│                   │   Training          │ • Skills          │
│                   │ • Online Career     │   Assessments     │
│                   │   Guidance          │ • Lab-Based       │
│                   │ • Platform Access   │   Classes ($50)   │
│                   │ • Project Team      │                   │
│                   │   Training          │ Plus Starter      │
│                   │                     │ benefits.         │
│ [Your current ✓]  │ [Subscribe monthly] │ [Coming soon ·    │
│   (disabled)      │ [Subscribe yearly]  │  join waitlist]   │
│                   │  yearly = primary   │  or live checkout │
└───────────────────┴─────────────────────┴───────────────────┘
```

Below all three: the PPP "Fair pricing, wherever you are" notice and the Founding Member promo strip (when the window is active).

### Card behavior by user state

| Current tier | Starter | Community | Professional |
|---|---|---|---|
| Starter | Current ✓ (disabled) | Two CTAs (yearly primary) | Coming soon / waitlist |
| Community monthly | Downgrade (confirm) | Current ✓ + "Switch to yearly" | Upgrade |
| Community yearly | Downgrade (confirm) | Current ✓ + founding badge if applicable | Upgrade |
| Professional | Downgrade | Downgrade | Current ✓ |

Downgrades route to the Gumroad customer portal (no destructive action without confirmation — Heuristic #5).

### Visual & interaction rules

- Community card highlighted (subtle border + "POPULAR" badge) — matches .org hierarchy and conversion goal
- Three-up grid on desktop ≥1024px, stacked on tablet/mobile, full feature parity (responsiveness constraint)
- Each "Includes" list = semantic `<ul>` with checkmark icons (WCAG 2.0 SC 1.3.1)
- "Plus everything in [lower tier]" pattern matches .org structure
- Class price differential ($50 vs $100) shown contextually inside each card so the value calc is obvious (Heuristic #6)
- Tier comparison toggle below cards: "Compare all features side-by-side" expands a feature matrix table for power users (Heuristic #7)

### What gets built

**1. `src/config/membership-tiers.ts`** — single source of truth for all three tiers, all copy, all SKU URLs. Lint rule bans hardcoded prices/feature lists elsewhere.

**2. `<MembershipTiersGrid>` component** — renders the three cards from the config. Used on:
- Membership tab in profile / settings
- Inside `<UpgradeCard>` (gets a "View all tiers" link to expand)
- Standalone `/membership` route (deep-linkable for marketing)

**3. `<TierComparisonTable>` component** — collapsible side-by-side feature matrix in an accordion below the grid.

**4. Database migration — extend `membership_tier` enum**

```text
ALTER TYPE membership_tier ADD VALUE 'starter';
ALTER TYPE membership_tier ADD VALUE 'community';
ALTER TYPE membership_tier ADD VALUE 'professional';

-- Data migration: 'free' → 'starter', 'paid' → 'community'
-- Phase 2 (post-deploy): drop legacy 'free' / 'paid' values
```

Two-phase so existing rows aren't broken mid-deploy. Audit log captures every tier change.

**5. Professional waitlist table (if no SKU yet)**

```text
tier_waitlist
├ id              uuid PK
├ user_id         uuid FK → profiles
├ requested_tier  text   -- 'professional'
├ created_at      timestamptz
└ notified_at     timestamptz NULL
```

RLS: users insert/read own; admins read all. Admin dashboard gets "Professional Waitlist" view + CSV export so demand is visible before you stand up the SKU.

**6. `gumroad-webhook` handler updates**

Routes to the right tier by SKU:
- Founding-membership → `community` + `is_founding_member = true`
- Community-monthly / yearly → `community`
- Professional (when it exists) → `professional`
- Cancellation → `starter`

Idempotent, write-once founding flag, audit-logged.

### Accessibility (WCAG 2.0 + 3.0)

- Each card = `<article>` with `aria-labelledby` → tier name
- "Popular" badge = visible `<span>` + SR-only "Most popular tier"
- Disabled "Your current tier" uses `aria-disabled` + visible ✓, NOT `disabled` (Heuristic #1: visibility of system status)
- Color never the only indicator — checkmarks on every included feature
- 4.5:1 contrast verified on dark-theme tokens
- Keyboard order: Starter → Community monthly → Community yearly → Professional → Compare features
- Comparison table = proper `<table>` with `<th scope>` headers
- Reduced-motion respected on popular-tier highlight

### BDD scenarios added to `bdd_scenarios`

- All three cards render with copy matching techfleet.org/overview
- "Your current tier" shows correctly on user's actual tier; keyboard-accessible
- Community card visually highlighted as popular
- Yearly CTA is primary on Community
- Founding-member promo strip only inside active window
- Professional card → waitlist CTA when no SKU; live checkout when SKU configured
- Waitlist insert respects RLS (own row only, no dupes)
- Downgrade prompts confirmation before Gumroad portal
- Tier change persists, fires audit log, updates UI <500ms
- Comparison table accordion keyboard-toggleable + SR-announced
- Mobile ≤640px: cards stack, no horizontal scroll
- Webhook routing: each SKU → correct tier value
- All passes axe-core + manual NVDA/VoiceOver smoke

### Performance & scale

- Tier config bundled at build, zero runtime fetches → instant render
- Comparison table lazy-loads on accordion open (separate chunk)
- Webhook write uses `ON CONFLICT (user_id) DO UPDATE` for sub-ms upserts
- Waitlist table indexed on `(user_id, requested_tier)` with unique constraint

### Three things I need from you before building

1. **$10/mo or $9.99/mo on the cards?** Recommendation: $10/mo, fine-print the actual charge.
2. **Professional Gumroad SKU exists or use the waitlist pattern?**
3. **"Late-Career Support"** in Professional — keep verbatim from .org or soften the wording for platform context?

