#!/usr/bin/env bash
# Shared deno retry helper — the ONE definition, sourced by the deno-check job's steps in
# .github/workflows/ci.yml (type-check + edge unit gates). Previously this function was
# duplicated inline in both steps; keep it here so the retry policy has a single owner.
#
# WHY THIS EXISTS
# --------------
# `deno check` / `deno test` resolve npm deps live from the registry, so CI must tolerate
# TRANSIENT remote-resolution failures without reddening — a registry blip is not a code
# defect. Two classes are transient and are retried:
#
#   1. Remote-fetch blips — esm.sh / deno.land / npm CDN 5xx, connection resets, DNS,
#      timeouts (e.g. Cloudflare 522 origin timeout).
#   2. npm-registry METADATA inconsistency — a version that EXISTS on npm but a CDN edge
#      momentarily omits from the package's version list, surfacing as
#      "Could not find npm package 'fast-uri' matching '^3.1.7'". (A real 2026-09 incident:
#      fast-uri@3.1.7 was published and resolvable everywhere except the edge the runners
#      hit, failing all 130 functions.) Between attempts we PURGE deno's npm cache so the
#      retry RE-QUERIES the registry fresh — a stale edge's cached version-list is otherwise
#      reused from DENO_DIR — and back off long enough to span a CDN metadata refresh.
#
# A genuine type/test error, or a version that truly does not exist, still fails after the
# retries are exhausted: the original non-zero exit + captured output are returned, so
# nothing is masked (it just fails a few attempts later).
deno_retry() {
  local n=0 max=5 delay=6 out rc
  while :; do
    out="$("$@" 2>&1)"
    rc=$?
    printf '%s\n' "$out"
    [ "$rc" -eq 0 ] && return 0
    if printf '%s' "$out" | grep -qiE 'failed: [0-9]{3}|<unknown status code>|error sending request|connection (closed|reset|refused)|(connection|operation) timed out|tcp connect error|dns error|502 bad gateway|503 service|504 gateway|429 too many|could not find npm package .* matching|could not resolve npm|npm package .* not found'; then
      n=$((n + 1))
      if [ "$n" -ge "$max" ]; then
        echo "::warning::transient remote-resolution failure persisted after ${max} attempts"
        return "$rc"
      fi
      # Force the retry to re-query the registry (drop deno's cached npm metadata so a stale
      # CDN version-list can't be reused). Best-effort; never fail the retry on cleanup.
      rm -rf "${DENO_DIR:-$HOME/.cache/deno}/npm" 2>/dev/null || true
      echo "::warning::transient remote-resolution failure (attempt ${n}/${max}); purged npm cache, retrying in ${delay}s"
      sleep "$delay"
      delay=$((delay * 2))
      continue
    fi
    return "$rc"
  done
}
