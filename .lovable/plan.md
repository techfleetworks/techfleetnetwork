I’ll implement the six-step performance refactor as a no-UX-regression architecture change once approved.

Scope:

1. Create route shells
   - Add a `PublicShell` for public routes that should not mount authenticated layout/background services.
   - Add an `AuthenticatedShell` for member routes.
   - Add an `AdminShell` for admin routes.
   - Keep the current visual behavior intact for authenticated/admin pages by preserving `AppLayout` there.

2. Move authenticated-only services out of public routes
   - Keep these inside authenticated/admin shells only:
     - `AppLayout`
     - `IdleTimeoutGuard`
     - `SelfHealingRunner`
     - authenticated background behavior tied to session/user state
   - Keep global-safe providers/services at the top level where needed:
     - `QueryClientProvider`
     - `ThemeProvider`
     - `TooltipProvider`
     - `BrowserRouter`
     - error boundary/toasters as appropriate
   - Ensure public pages such as `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/project-openings`, `/project-openings/:projectId`, `/confirm-admin`, and `/unsubscribe` do not pay authenticated shell cost.

3. Lazy-load Login/Register/NotFound
   - Convert `LoginPage`, `RegisterPage`, and `NotFound` from eager imports to `lazyWithRetry` imports.
   - Keep `Index` eager only if it remains the critical landing entry; otherwise evaluate lazy-loading it safely.
   - Preserve the existing accessible route fallback.

4. Add `DeferredSection` and defer NetworkActivity
   - Add a reusable `DeferredSection` component using `IntersectionObserver` with an idle/timeout fallback.
   - Use it in `LandingPage` so `NetworkActivity` does not mount/load until the user scrolls near it or the browser has had time to finish initial work.
   - Preserve reserved height to avoid CLS.
   - Ensure it degrades safely if `IntersectionObserver` is unavailable.

5. Add BDD scenarios
   - Create a migration registering BDD scenarios in `bdd_scenarios` for public-route lightweight loading.
   - Scenarios will cover:
     - landing route does not mount authenticated-only shell services
     - public auth routes lazy-load without authenticated background services
     - deferred network activity preserves layout while delaying heavy work

6. Add tests
   - Add focused source-level/unit tests verifying:
     - `LoginPage`, `RegisterPage`, and `NotFound` are lazy imports in `App.tsx`
     - public routes are wrapped in `PublicShell`, not `AuthenticatedShell`/`AdminShell`
     - `AppLayout`, `IdleTimeoutGuard`, and `SelfHealingRunner` are only mounted in authenticated/admin shells
     - `LandingPage` uses `DeferredSection` around `NetworkActivity`
   - Add a lightweight component test for `DeferredSection` fallback/visibility behavior if practical in jsdom.

Expected outcome:

- Lower landing-page initial JavaScript execution.
- Fewer authenticated-only components mounted for public visitors.
- Lower initial heap and main-thread cost on `/`.
- No extra clicks, no new prompts, no visual regression.
- BDD-backed coverage for the performance architecture decision.

Technical notes:

- I will use semantic design-system classes only if any UI wrapper/fallback markup is added.
- I will not edit generated backend client/types files.
- No backend function changes are needed for this specific refactor.
- Any new BDD scenario migration will use `ON CONFLICT` to avoid duplicate scenario failures.
- I’ll run focused tests for the changed shell/deferred loading behavior after implementation.