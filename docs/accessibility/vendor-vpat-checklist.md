# Vendor / Third-Party Accessibility (VPAT) Checklist

Tech Fleet Network's Accessibility Policy commits to procuring only
third-party services and libraries that meet **WCAG 2.2 AA** and
**EN 301 549** equivalents. This checklist gates every new dependency,
embed, SDK, or external integration before it lands in `main`.

> A copy of this checklist must be filled in (or explicitly waived with a
> documented remediation plan) inside the PR description for any change that:
>  - adds a new runtime dependency in `package.json`,
>  - embeds a third-party iframe / widget / script tag,
>  - introduces a new SaaS integration (auth, payments, video, analytics, etc.),
>  - or upgrades a major version of an existing dependency that ships UI.

---

## 1. Conformance Documentation

- [ ] Vendor publishes a current **VPAT 2.5 Rev** or **EN 301 549** conformance report (link: ____)
- [ ] Report covers **WCAG 2.2 AA** (or explains 2.1 → 2.2 delta)
- [ ] Report dated within the last **24 months**
- [ ] Vendor commits in writing to remediating reported barriers within a defined SLA

## 2. Visual & Structural

- [ ] All UI text scales to **200%** without loss of content or function
- [ ] Reflow works at **320 CSS px** width (no horizontal scroll)
- [ ] Color contrast ≥ **4.5:1** body / **3:1** large + non-text (WCAG 1.4.3 / 1.4.11)
- [ ] No information conveyed by color alone (WCAG 1.4.1)
- [ ] Reduced-motion preference respected (WCAG 2.3.3)

## 3. Keyboard & Focus

- [ ] Every interactive control reachable by keyboard (WCAG 2.1.1)
- [ ] No keyboard traps (WCAG 2.1.2)
- [ ] Visible focus indicator on every focusable element (WCAG 2.4.7)
- [ ] Focus order matches visual order (WCAG 2.4.3)
- [ ] All hit targets **≥ 24 × 24 CSS px** (WCAG 2.5.8)

## 4. Assistive Technology

- [ ] Tested with at least one of: **NVDA**, **JAWS**, **VoiceOver**, **TalkBack**
- [ ] Programmatic name + role + value on every control (WCAG 4.1.2)
- [ ] Status messages use `aria-live` / `role="status"` (WCAG 4.1.3)
- [ ] No reliance on hover or pointer-only gestures (WCAG 2.5.1, 2.5.4)

## 5. Forms & Errors

- [ ] All inputs have programmatic labels (WCAG 1.3.1, 3.3.2)
- [ ] Errors identified in text and associated with the field (WCAG 3.3.1)
- [ ] Suggestions offered when known (WCAG 3.3.3)

## 6. Media

- [ ] Captions on prerecorded video (WCAG 1.2.2)
- [ ] Transcripts for audio-only content (WCAG 1.2.1)
- [ ] Audio description available for video that needs it (WCAG 1.2.5)

## 7. Localization & Identity

- [ ] Vendor honors `Accept-Language` / per-user locale
- [ ] No hard-coded English-only error or success messages embedded in their UI
- [ ] Right-to-left layout supported for `ar`, `he`, `fa`, `ur` (where vendor renders UI)

## 8. Privacy & Security Cross-Cutting

- [ ] No third-party cookies / fingerprinting beyond what user has consented to
- [ ] Vendor signs DPA or equivalent (handled by Compliance, link: ____)
- [ ] No outbound calls to non-conformant CDNs that bypass our CSP

## 9. Decision

- [ ] **Accepted** — meets all required boxes above
- [ ] **Accepted with mitigation** — gaps tracked in
      `docs/accessibility/known-limitations.md` with target remediation date
- [ ] **Rejected** — alternative vendor selected: ____

Reviewer (a11y owner): ____
Date: ____
