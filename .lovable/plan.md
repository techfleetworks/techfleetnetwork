## Problem

`admin-purge-auth-user/index.ts` fails to deploy with:

```
Failed to bundle the function (reason: ...Unexpected eof at ...index.ts:174:3
  })
    ~)
```

The brackets are correctly balanced (`Deno.serve(withAuditWrapper("...", async (req) => { ... }))` closes with `}))` on line 174). Local `deno check` passes. However, the file ends mid-line with no trailing newline:

```
...
}))   ← last byte, no \n
```

The edge-runtime bundler is strict about this and reports "Unexpected EOF" at the final `})`.

## Fix

1. Append a single `\n` after the closing `}))` on line 174 of `supabase/functions/admin-purge-auth-user/index.ts`.
2. Redeploy the `admin-purge-auth-user` edge function.
3. Verify deploy succeeds (no SUPABASE_CODEGEN_ERROR).

## Out of scope

- No logic changes. The auth-purge handler, audit wrapper, and step-up flow stay exactly as they are.
