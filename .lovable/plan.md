## Plan: Add Gumroad Subscription Management Links to Profile

### Problem
Members on paid tiers (Community, Professional) cannot manage their subscription directly from the profile. The only guidance is a toast saying "use the Gumroad email link from your original receipt." Users expect a direct, seamless path to upgrade, downgrade, or cancel on Gumroad from the Membership tab.

### Solution
Add a direct "Manage subscription" link to Gumroad for all paid members, and wire every downgrade/manage action to open Gumroad instead of showing a passive toast.

### Files to change

#### 1. `src/lib/gumroad.ts` — NEW
- Helper `getGumroadManageUrl(sku: string): string | null`
- Normalizes the stored `membership_sku` (may be a permalink slug like `founding-membership` or a full URL like `https://techfleet.gumroad.com/l/founding-membership`) into `https://app.gumroad.com/d/{slug}/manage`
- Returns `null` for invalid/empty input

#### 2. `src/components/CurrentMembershipBanner.tsx` — EDIT
- Add optional `manageUrl?: string | null` prop
- For paid tiers (`currentTier !== 'starter'`), render a "Manage subscription on Gumroad" button below the plan details using `SafeExternalLink`
- Button opens in a new tab with `noopener,noreferrer`
- Starter tier omits the button (nothing to manage)

#### 3. `src/components/MembershipTiersGrid.tsx` — EDIT
- Add optional `manageUrl?: string | null` prop
- In `TierCtaButtons`, when `isCurrent` and tier is paid:
  - Replace the static non-interactive "Your Current Plan" badge with the badge **plus** a "Manage subscription" button underneath it
- For `isDowngrade` on any card: change CTA from generic "Switch to X" to "Manage on Gumroad" and trigger `action: "manage"` instead of `action: "downgrade"`

#### 4. `src/pages/EditProfilePage.tsx` — EDIT
- Compute `manageUrl` from `profile.membership_sku` using the new helper
- Pass `manageUrl` to both `CurrentMembershipBanner` and `MembershipTiersGrid`
- Update `MembershipTiersGrid.onSelect` handler:
  - `action === "manage"` or `action === "downgrade"`: open `manageUrl` (or `https://gumroad.com/library` as fallback) in a new tab
  - Remove the old toast-only downgrade message
  - Keep existing `subscribe` and `waitlist` behaviors

#### 5. `src/data/membership-faq.ts` — EDIT
- Update the `switch-tier` FAQ entry to mention the direct manage link: "You can switch any time from this Membership tab. Paid members can manage, change, or cancel their subscription directly on Gumroad using the Manage subscription button."

#### 6. Database migration — NEW `supabase/migrations/`
- Insert BDD scenarios for the new feature:
  - `MEMBER-MANAGE-001`: Starter member sees no manage button
  - `MEMBER-MANAGE-002`: Community/Professional member sees "Manage subscription" on current plan banner and in tier grid
  - `MEMBER-MANAGE-003`: Downgrade CTA opens Gumroad manage URL
  - `MEMBER-MANAGE-004`: SKU normalization correctly handles full URL vs slug

### Technical details
- Gumroad manage URL format: `https://app.gumroad.com/d/{permalink-slug}/manage`
- The stored `profiles.membership_sku` may be a full Gumroad URL or just the permalink slug; the helper strips the domain/path prefix to extract the slug safely
- All external links use the existing `SafeExternalLink` component for security (URL validation + `noopener noreferrer nofollow`)
- No backend changes needed; this is purely a frontend UX improvement using already-stored profile data