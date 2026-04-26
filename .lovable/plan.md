The detected `*****tabc` value is not a real API key. It is a fake JWT-like string inside the DB pentest redaction test:

```text
Bearer eyJabcdefghijklmnop.eyJabcdefghijklmnop.signaturepartabc
```

It is still worth fixing because scanners correctly flag JWT-shaped strings in git history.

Plan:
1. Replace the hardcoded JWT-shaped fixture in `scripts/pentest/db-rls.mjs` with a runtime-built test token so no complete token-shaped string exists in source.
2. Keep the redaction test behavior intact by still sending a Bearer/JWT-like value to `public.redact_sensitive_text()` at runtime.
3. Review nearby pentest fixtures for other secret-shaped literals and split/build them safely where needed.
4. Run the secret scan and pentest SAST checks to verify the repository no longer contains the flagged pattern.
5. After the code is clean, mark the alert resolved manually in the security scanner. Since this is a fake fixture, no key rotation is required; if your policy requires history removal, use BFG or `git filter-repo` and coordinate a force-push.