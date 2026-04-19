---
name: Context Modules HMR Safety
description: Rules for React context modules — pin to globalThis, force HMR reload, single import path, dev-time duplicate detector
type: constraint
---

React context modules (`src/contexts/*`) are HMR-fragile: if Vite ever loads
two copies of a context file, the Provider writes to one instance and the
hook reads from the other, throwing
`useAuth must be used within AuthProvider` (which surfaced to users as
"authorization failed" on login).

### Mandatory pattern for every context module

1. **Pin the context to `globalThis`** under a unique key (e.g. `__tfn_auth_context__`).
   Reuse the existing instance on re-evaluation rather than calling `createContext` again.
2. **Force a full reload on HMR updates**:
   ```ts
   if (import.meta.hot) {
     import.meta.hot.accept(() => window.location.reload());
   }
   ```
3. **Dev-time duplicate-context detector**: throw loudly if `globalThis[KEY]`
   is reassigned to a different `createContext` instance.
4. **Single canonical import path**: only `@/contexts/<Name>` — no relative
   paths, no `.tsx` extension. Enforced by `no-restricted-imports` in
   `eslint.config.js`.

### Regression coverage

- `e2e/hmr-context-stability.spec.ts` edits `AuthContext.tsx` and asserts the
  page didn't crash. Run as part of the standard Playwright suite.

### Files implementing this pattern

- `src/contexts/AuthContext.tsx`
- `src/contexts/PageHeaderContext.tsx`

Any new context module added to `src/contexts/` MUST follow all four rules
above before merge.
