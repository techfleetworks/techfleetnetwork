## Why the blast failed

Edge function `send-project-blast` crashes during email rendering with:

> Error: Can only set one of `children` or `props.dangerouslySetInnerHTML`.

The recipient lookup fix from earlier worked — the function now finds applicants. It fails on the next step: rendering the React Email template.

**Root cause:** In `supabase/functions/_shared/transactional-email-templates/project-blast.tsx` line 28–32, the WYSIWYG body HTML is injected via `dangerouslySetInnerHTML` on a React Email `<Section>`. `<Section>` is a wrapper that renders a `<table>` and always supplies its own children internally, so React's SSR forbids combining it with `dangerouslySetInnerHTML`. Result: every recipient render throws, the function returns a failure, and no emails are sent.

## Fix

Replace the offending `<Section dangerouslySetInnerHTML=… />` with a plain `<div dangerouslySetInnerHTML=… />` (kept inside the email body), preserving the existing `bodySection` styling.

Before:
```tsx
<Section
  style={bodySection}
  dangerouslySetInnerHTML={{ __html: bodyHtml || '' }}
/>
```

After:
```tsx
<div
  style={bodySection}
  // Body is sanitized server-side via sanitize_user_html() before render.
  dangerouslySetInnerHTML={{ __html: bodyHtml || '' }}
/>
```

No changes to sanitization, recipient logic, queueing, or styles. Then redeploy `send-project-blast` so the new template ships.

## Verification

1. Send a test blast from Recruiting Center to a project with applicants.
2. Confirm 200 response with `recipients > 0`.
3. Confirm `email_send_log` rows transition `pending → sent` (template `project_blast`).
4. Confirm no further "Can only set one of children or props.dangerouslySetInnerHTML" errors in `send-project-blast` edge logs.
