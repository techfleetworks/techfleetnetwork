#!/usr/bin/env python3
"""
post-json.py — Safe JSON POST helper.

Encodes JSON in Python (no shell-arg length limits, no quoting issues) and
POSTs to a URL. Use this from any shell/agent context instead of building
`curl -d '{...}'` invocations by hand.

Usage:
  # Inline payload (still safe — no shell quoting needed downstream):
  python scripts/util/post-json.py URL --json '{"key":"value"}'

  # Payload from file (preferred for anything > a few KB):
  python scripts/util/post-json.py URL --file payload.json

  # Payload from stdin:
  echo '{"k":1}' | python scripts/util/post-json.py URL --stdin

  # Auth header:
  python scripts/util/post-json.py URL --file p.json --bearer "$TOKEN"
  python scripts/util/post-json.py URL --file p.json --header "X-Foo: bar"

Exits non-zero on HTTP >= 400. Prints response body to stdout.
"""
from __future__ import annotations
import argparse, json, sys, urllib.request, urllib.error


def main() -> int:
    p = argparse.ArgumentParser(description="Safe JSON POST (Python-encoded).")
    p.add_argument("url")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--json", help="Inline JSON string.")
    src.add_argument("--file", help="Path to JSON payload file.")
    src.add_argument("--stdin", action="store_true", help="Read JSON from stdin.")
    p.add_argument("--bearer", help="Bearer token for Authorization header.")
    p.add_argument("--header", action="append", default=[],
                   help='Extra header "Key: value" (repeatable).')
    p.add_argument("--method", default="POST")
    p.add_argument("--timeout", type=float, default=120.0)
    args = p.parse_args()

    # Load + validate JSON in Python (catches errors before the network call).
    if args.file:
        with open(args.file, "rb") as f:
            raw = f.read()
    elif args.stdin:
        raw = sys.stdin.buffer.read()
    else:
        raw = args.json.encode("utf-8")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON payload: {e}", file=sys.stderr)
        return 2
    body = json.dumps(payload).encode("utf-8")

    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if args.bearer:
        headers["Authorization"] = f"Bearer {args.bearer}"
    for h in args.header:
        if ":" not in h:
            print(f"Bad --header (need 'Key: value'): {h}", file=sys.stderr)
            return 2
        k, v = h.split(":", 1)
        headers[k.strip()] = v.strip()

    req = urllib.request.Request(args.url, data=body, headers=headers, method=args.method)
    try:
        with urllib.request.urlopen(req, timeout=args.timeout) as resp:
            sys.stdout.write(resp.read().decode("utf-8", errors="replace"))
            return 0
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"HTTP {e.code} {e.reason}\n")
        sys.stdout.write(e.read().decode("utf-8", errors="replace"))
        return 1
    except urllib.error.URLError as e:
        sys.stderr.write(f"Network error: {e.reason}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
