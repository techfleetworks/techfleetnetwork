---
name: Web Vitals RUM
description: Real User Monitoring beacon (LCP/INP/CLS/FCP/TTFB) → record-web-vital edge fn → web_vital_samples table; admin Performance tab in System Health
type: feature
---

- Client: `src/lib/web-vitals.ts` installed once from `src/main.tsx`. Dynamic-imports `web-vitals` (not in main bundle), defers via `requestIdleCallback`, honours Save-Data, uses `navigator.sendBeacon` (keepalive fetch fallback).
- Endpoint: `record-web-vital` edge fn, `verify_jwt = false` (public beacon — sendBeacon fires after page hide). Hardened: strict allow-lists for metric/rating/nav-type, 16KB body cap, route normalised to path-only ≤256 chars, UA capped 512 chars, swallows errors (always returns 204 except on body-cap rejection from parseJsonBody).
- Storage: `web_vital_samples` table, RLS revokes anon/auth writes; only service role inserts; admin SELECT via `has_role(auth.uid(),'admin')`. Indexed on `(created_at desc, metric_name)` and `(route, metric_name, created_at desc)`. 7-day retention via existing nightly hygiene job.
- RPCs (security definer, granted to authenticated only — RLS still enforces admin via the SELECT policy that the views read through): `web_vitals_p75(window_hours)` and `web_vitals_trend(window_hours)`. Routes need ≥5 samples to appear (cardinality + privacy).
- UI: `src/components/system-health/PerformanceTab.tsx` mounted as the new "Performance" tab in System Health. Shows per-route p75/p95 + good% with Google CWV thresholds.
- Never block first paint, never spend Save-Data users' bandwidth on telemetry, never store PII (user_id only when session present and uuid-validated).
