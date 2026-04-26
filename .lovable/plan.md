I’ll fix the GitHub Actions injection warning by hardening the workflows and adding a CI guard so it cannot regress.

Plan:
1. Update `.github/workflows/pentest.yml`
   - Replace direct shell interpolation of `github.event.inputs.suites` with an environment variable.
   - Validate `suites` against a strict allowlist: `db`, `edge`, `web`, `sast`.
   - Avoid shelling untrusted GitHub context directly into `run:` blocks.

2. Review concurrency and metadata expressions
   - Keep safe GitHub context usage outside shell commands where appropriate.
   - If needed, normalize concurrency keys to avoid scanner false positives.

3. Add/extend static security detection
   - Extend the SAST/security scan to flag future `${{ github.event.* }}` or unsafe GitHub context expressions inside `run:` commands.
   - Include unsafe suffixes like `body`, `title`, `email`, `head_ref`, and workflow dispatch inputs.

4. Validate
   - Run the secret scan.
   - Run the SAST suite.
   - Confirm the workflows no longer directly interpolate untrusted GitHub context into shell commands.

Technical target:
- Main risky line found: `requested="${{ github.event.inputs.suites }}"` in `.github/workflows/pentest.yml`.
- Safer pattern: pass it through `env:` and validate before use in bash.