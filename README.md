# Tech Fleet Network

![Regression](https://github.com/lovable-dev/techfleetnetwork/actions/workflows/regression.yml/badge.svg)
![Vitest](https://github.com/lovable-dev/techfleetnetwork/actions/workflows/regression.yml/badge.svg?event=push&branch=main)
![BDD Coverage](https://github.com/lovable-dev/techfleetnetwork/actions/workflows/regression.yml/badge.svg?event=push)

## Project info

Tech Fleet Network is a Lovable-built web app for Tech Fleet trainees and administrators.

## Development

```sh
npm i
npm run dev
```

## Testing

### Local regression

- `npm run test` — runs the Vitest suite
- `npx playwright test` — runs the Playwright end-to-end suite

### Permanent workaround for Lovable runner `.tsx` limitation

Lovable's built-in `run_tests` tool can return a false `Vitest is not configured` error for tests whose import tree includes `.tsx` files.
The permanent repository-level fix is the GitHub Actions workflow at `.github/workflows/regression.yml`, which runs the full Vitest and Playwright regression suite directly in CI.

This means:
- `.tsx` UI tests stay in the codebase
- full regression runs reliably in CI
- critical user journeys are still validated end-to-end in Playwright

## Stack

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Publish

Frontend changes go live when you click **Publish** → **Update** in Lovable.
