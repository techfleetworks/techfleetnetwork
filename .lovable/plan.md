## Goal

Make the home + dashboard **General Applications Completed** card show the **combined** total = live platform count (`applications_completed`) + historical Airtable carry-over (`general_applications_pre_platform = 890`).

## Current state

- `get_network_stats()` returns `applications_completed` from `network_stats_snapshots` (platform-only, distinct submitted general apps) and `historical.general_applications_pre_platform = 890` (unique Airtable submitters).
- `NetworkActivity.tsx` line 227 renders the All-Time card with `safeStats.applications_completed` only — the 890 sits separately in the Historical (pre-platform) section.

## Plan

Mirror the pattern just shipped for Beginner/Advanced — keep the SQL source-of-truth split (live vs historical) and combine at render time.

### 1) UI — `src/components/NetworkActivity.tsx`

Change the All-Time **General Applications Completed** card (line 227):

```tsx
<StatCard
  icon={<FileCheck …/>}
  value={(safeStats.historical?.general_applications_pre_platform ?? 0) + (safeStats.applications_completed ?? 0)}
  label="General applications submitted"
  sublabel={`+${safeStats.applications_completed ?? 0} since platform launch`}
  colorClass="bg-success/10"
/>
```

- Sentence case + verb-of-action label per brand voice ("submitted" matches what Airtable + platform both measure).
- Sublabel makes the live delta auditable, same shape as Beginner/Advanced.
- Past-7-days card stays as-is (it's a delta window — combining would be wrong).
- Historical (pre-platform) section keeps the standalone "890" card so the carry-over remains auditable.

### 2) DB / RPC

No change. `get_network_stats()` already returns both values in the right shape. No new historical row, no new override.

### 3) TypeScript contract

No change. `HistoricalStats.general_applications_pre_platform` already exists.

### 4) BDD scenario

Insert `NETSTATS-COMBINED-GENAPPS-001` (feature_area `Network Stats v4`):

```
Given general_applications_pre_platform=890 and live applications_completed=N
When an unauthenticated visitor loads "/" and an authenticated member loads "/dashboard"
Then [DB] get_network_stats() returns applications_completed=N and historical.general_applications_pre_platform=890
And  [Code] NetworkActivity sums historical + live for the All-Time card without mutating either source field
And  [UI] both surfaces render "General applications submitted" with value 890+N and sublabel "+N since platform launch"
And  [UI] the Past 7 Days card still shows only the live weekly delta
```

### 5) Memory

Append to the Network Stats v4 memory line: "General Applications = live `applications_completed` + historical `general_applications_pre_platform` (890), combined at render in `NetworkActivity` — DB stays split."

## Out of scope

- No Airtable re-sync; 890 is already in `network_stats_historical` and admin-editable.
- No changes to badges, courses, or projects cards.
- Past-7-days card stays live-only.

## Technical details

- 1 file touched: `src/components/NetworkActivity.tsx` (single StatCard).
- 1 BDD insert into `bdd_scenarios`.
- No migration, no type change, no cache-key bump.
