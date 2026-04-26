#!/usr/bin/env bash
set -euo pipefail

if ! command -v nix >/dev/null 2>&1; then
  echo "Nix is required for sandbox Playwright runs because this environment has no apt-get." >&2
  exit 1
fi

exec nix shell nixpkgs#chromium -c bash -lc '
  export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)"
  exec npx playwright test "$@"
' bash "$@"
