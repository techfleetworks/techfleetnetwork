

# Pre-Launch Hardening, Testing, and Refactoring Plan

## Current State Assessment

**Strengths already in place:**
- Comprehensive security library (`src/lib/security.ts`) covering OWASP Top 10
- Zod validation on auth and profile forms
- RLS on all tables, service-role gating on sensitive tables
- Error boundary with audit logging, global error reporter with dedup/rate-limiting
- Lazy-loaded routes, React Query with stale times
- Admin role checks via `has_role()` SECURITY DEFINER function
- Session age enforcement (8-hour max)
- Rate limiting edge function with server-side hash

**Issues found:**
1. **Linter: SECURITY DEFINER view** — likely `project_roster_member_view`, needs ownership review
2. **Linter: 3 public buckets allow file listing** — `avatars`, `announcement-videos`, `client-logos` allow unauthenticated enumeration
3. **Admin routes not server-guarded** — admin pages check `isAdmin` client-side but `ProtectedRoute` only checks auth, not role. A non-admin user can navigate to `/admin/*` and see the page shell before data queries fail.
4. **`ProfileService.updateFields` accepts arbitrary fields** — no allowlist, potential mass assignment
5. **`/project-openings/:projectId` is unprotected** — exposed outside `ProtectedRoute`
6. **Test coverage gaps** — 46 pages, ~57 components, but only 26 UI tests. No tests for admin pages, services, or edge functions in the suite.
7. **No BDD scenarios for several features** — new features (quest system, feedback, recordings plan) may lack BDD entries
8. **`bio` field in profile not in Zod schema** — can accept unsanitized content

---

## Phase 1: Security Hardening

### 1.1 Fix Storage Bucket Listing
- Add restrictive SELECT policies on `storage.objects` for `avatars`, `announcement-videos`, and `client-logos` buckets so unauthenticated users cannot enumerate files.
- Files remain publicly readable by direct URL, but listing is blocked.

### 1.2 Admin Route Guard Component
- Create `AdminRoute` wrapper that checks `useAdmin()` and redirects non-admins to `/dashboard` with an access-denied toast.
- Apply to all `/admin/*` routes in `App.tsx`.

### 1.3 Mass Assignment Protection in ProfileService
- Add an allowlist to `updateFields()` using `pickAllowedFields` from the security library.
- Only permit known safe fields like `bio`, `professional_background`, `professional_goals`, `education_background`, etc.

### 1.4 Sanitize Bio Input
- Add `bio` to the profile Zod schema with XSS validation and max length.
- Apply `deepSanitize` before profile updates.

### 1.5 SECURITY DEFINER View Audit
- Review `project_roster_member_view` ownership and ensure it runs with minimal privileges, not a superuser role.

### 1.6 Protect Public Project Detail Route
- Wrap `/project-openings/:projectId` in `ProtectedRoute` (it currently renders `ProjectOpeningDetailPage` without auth).

---

## Phase 2: Refactoring

### 2.1 Centralize Admin Guard Pattern
- Extract repeated `if (!isAdmin && !adminLoading) return <AccessDenied />` pattern from 8+ admin pages into the shared `AdminRoute` component.

### 2.2 Type-Safe Profile Service
- Replace `as any` casts in `ProfileService.update()` and `updateFields()` with properly typed Supabase table types.
- Remove `as unknown as Profile` cast in `fetch()` by aligning the Profile interface with the generated types.

### 2.3 Consolidate Error Handling in Services
- Several services duplicate try/catch + logging patterns. Extract a shared `serviceCall` wrapper that handles logging, error formatting, and audit trail consistently.

### 2.4 Performance: Admin Data Fetching
- Admin pages like `UserAdminPage` and `ActivityLogPage` use `useState` + `useEffect` for data fetching instead of React Query. Migrate to `useQuery` for caching, dedup, and stale-while-revalidate.

---

## Phase 3: Testing

### 3.1 Missing Unit Tests (Priority)
- `ProfileService` — fetch, update, updateFields
- `AuthService` — session expiration logic, signOut fallback
- `security.ts` — remaining untested functions: `sanitizeHtml`, `validateFileUpload`, `hasPathTraversal`, `hasHeaderInjection`, `pickAllowedFields`, `isValidUuid`, `sanitizeFileName`, `isSafeRedirectUrl`, `isClientRateLimited`, `hasCRSAttackPattern`
- `form-validation.ts` — `getFieldValidationState`, `validationBorderClass`

### 3.2 Missing UI Tests
- `AdminRoute` (new component) — verify redirect for non-admins
- `ProtectedRoute` — verify redirect for unauthenticated users
- `EditProfilePage` — form submission and validation
- `DashboardPage` — widget rendering (extend existing test)
- `FeedbackPage` — form submission
- `ProjectOpeningsPage` — listing and filtering

### 3.3 BDD Scenario Coverage
- Insert BDD scenarios for all new security hardening work
- Insert scenarios for admin route protection, storage bucket restrictions, mass assignment protection

### 3.4 Edge Function Tests
- Add unit tests for `rate-limit` input validation
- Add tests for `confirm-admin-role` path traversal rejection

---

## Phase 4: Final Verification

### 4.1 Type Check + Build
- Run `tsc --noEmit` and `npm run build` to confirm zero errors

### 4.2 Full Test Suite
- Run complete Vitest suite and fix any failures

### 4.3 Security Re-Scan
- Re-run the database linter and verify all findings are resolved
- Log resolved findings in the security scanner

---

## Implementation Order

1. Security fixes first (Phase 1) — highest impact for launch safety
2. Refactoring (Phase 2) — reduce technical debt before adding tests
3. Testing (Phase 3) — lock in correctness
4. Final verification (Phase 4) — confirm everything passes

**Estimated scope:** ~15-20 files modified, 4-6 new test files, 2-3 database migrations, ~10 BDD scenarios added.

