/**
 * Braintrust observability — the SINGLE owner of "trace one LLM turn to Braintrust".
 *
 * Why this module exists (decisions.md §5 "compose _shared, don't hand-roll"):
 * Fleety's edge functions raw-fetch their LLM providers (techfleet-chat does NOT
 * use _shared/llm/port.ts), so there is no one SDK seam to hook. This module is
 * that seam: every function that wants to stream a turn to Braintrust calls
 * startFleetyTrace()/llmSpan()/finish() and never imports the Braintrust SDK or
 * reads the key/flag itself. ADR-0073.
 *
 * Three hard constraints shape the design:
 *
 *  1. FAIL-OPEN, ALWAYS (decisions.md §4). Observability must never degrade the
 *     member-facing turn. Every SDK/network call is wrapped; a failure REPORTS
 *     (edge logs + optional caller escalation) and the turn proceeds. A missing
 *     BRAINTRUST_API_KEY or FLEETY_BRAINTRUST_ENABLED=0 makes the whole thing a
 *     no-op — which doubles as the deploy-free kill switch.
 *
 *  2. ZERO HOT-PATH COST. We do NOT touch the Braintrust SDK while the member is
 *     waiting. During the turn we only push plain span records into an in-memory
 *     buffer (sync, allocation-only). The dynamic import, span materialisation
 *     and flush all run AFTER the response via EdgeRuntime.waitUntil. Real timing
 *     is preserved by carrying metrics.start/metrics.end (unix seconds) rather
 *     than relying on when the span object is constructed.
 *
 *  3. BEST-EFFORT DELIVERY. Supabase Edge gives no guaranteed post-response
 *     window for durable work (handoff/email-outbox moved to DB-queue + cron for
 *     that reason). EdgeRuntime.waitUntil is the right primitive for *best-effort
 *     telemetry* and is used here (feature-detected); a dropped span is acceptable
 *     for evals and is never allowed to affect the answer. If guaranteed capture
 *     is ever required, promote this to the durable-queue pattern (see ADR-0073).
 *
 * Secrets are stripped from logged content via _shared/dlp.ts scrubSecretsOnly()
 * even in full-raw mode; free-text PII is retained per ADR-0073 and governed by
 * short Braintrust retention + access controls + the processor DPA.
 */

import { createEdgeLogger } from "../logger.ts";
import { scrubSecretsOnly } from "../dlp.ts";

const log = createEdgeLogger("braintrust");

/** Pinned, stable (~2-week-old) SDK release. Single source of the version.
 *  Returned from a function (not referenced as a literal at the import site) so
 *  `deno check` does not eagerly resolve or type-check the SDK's own type surface
 *  — the import is loaded purely at runtime and is fully fail-open. */
function braintrustSpecifier(): string {
  return "npm:braintrust@3.35.0";
}

/** Fleety's Braintrust project (overridable via env for other projects). */
const DEFAULT_PROJECT_ID = "8ccac30b-263e-416a-a003-f0e25a3d2c42";

/** Bound on the post-response flush so a slow/stalled Braintrust can never hold
 *  the isolate open indefinitely. */
const FLUSH_TIMEOUT_MS = 2000;

export type FleetySpanType = "llm" | "tool" | "function";

export interface SpanMetrics {
  prompt_tokens?: number;
  completion_tokens?: number;
  tokens?: number;
  time_to_first_token?: number;
  [k: string]: number | undefined;
}

export interface SpanLogFields {
  output?: unknown;
  metadata?: Record<string, unknown>;
  metrics?: SpanMetrics;
}

export interface FleetySpan {
  /** Record output/metadata/metrics on this span. Safe to call once; last write wins per field. */
  log(fields: SpanLogFields): void;
  /** Mark the span finished (stamps end time). Idempotent. */
  end(): void;
}

export interface FleetyTrace {
  /** Open a child LLM/tool span. `input` is scrubbed for secrets before buffering. */
  llmSpan(name: string, input: unknown, metadata?: Record<string, unknown>): FleetySpan;
  /** Record fields on the root task span. */
  log(fields: SpanLogFields): void;
  /** Flag the turn as errored (sets error metadata on the root span). */
  setError(err: unknown): void;
  /** End the root span and schedule the post-response materialise+flush. Idempotent.
   *  Resolves immediately when EdgeRuntime.waitUntil is available (flush runs in the
   *  background); otherwise awaits a bounded inline flush. Never throws. */
  finish(): Promise<void>;
}

interface SpanRecord {
  name: string;
  type: FleetySpanType;
  input: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  metrics: SpanMetrics;
  start: number; // unix seconds
  end?: number; // unix seconds
}

export interface TraceBuffer {
  rootName: string;
  input: unknown;
  output?: unknown;
  metadata: Record<string, unknown>;
  metrics: SpanMetrics;
  start: number;
  end?: number;
  children: SpanRecord[];
}

/** FLEETY_BRAINTRUST_ENABLED is ON unless explicitly turned off, AND the key must exist.
 *  Flipping the secret to "0"/"false"/"off" disables emission on the next isolate — the
 *  deploy-free kill switch (a _shared change otherwise forces a full-fleet redeploy). */
let complianceGateWarned = false;

export function braintrustEnabled(): boolean {
  const flag = (Deno.env.get("FLEETY_BRAINTRUST_ENABLED") ?? "").trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off" || flag === "no") return false;
  if (!Deno.env.get("BRAINTRUST_API_KEY")) return false;
  // Compliance gate (ADR-0073; enterprise-readiness audit 2026-10 C2/H7). Braintrust receives
  // verbatim member Q&A + the DB user_id, so emission must NOT turn on merely because a key exists.
  // It stays a fail-safe no-op until BRAINTRUST_COMPLIANCE_READY affirms the prerequisites are LIVE:
  // a signed processor DPA, retention ≤ 30 days configured in Braintrust, and the deletion-cascade
  // job deployed (so an erased member's turns are purged). See docs/runbooks/braintrust-prod-enable.md.
  const ready = (Deno.env.get("BRAINTRUST_COMPLIANCE_READY") ?? "").trim().toLowerCase();
  const compliant =
    ready !== "" && ready !== "0" && ready !== "false" && ready !== "off" && ready !== "no";
  if (!compliant) {
    if (!complianceGateWarned) {
      complianceGateWarned = true;
      log.warn(
        "BRAINTRUST_API_KEY present but BRAINTRUST_COMPLIANCE_READY not affirmed — member-PII " +
          "telemetry stays DISABLED until the DPA + ≤30d retention + deletion-cascade are live " +
          "(docs/runbooks/braintrust-prod-enable.md)."
      );
    }
    return false;
  }
  return true;
}

// ── Lazy, isolate-wide Braintrust handle ────────────────────────────────────
// undefined = not yet attempted; null = attempted and unavailable (don't retry);
// object = ready. A single in-flight promise dedupes concurrent initialisation.
type BtReady = { initLogger: unknown; logger: unknown } | null;
let btState: BtReady | undefined = undefined;
let btInit: Promise<BtReady> | null = null;

async function ensureBraintrust(): Promise<BtReady> {
  if (btState !== undefined) return btState;
  if (btInit) return btInit;
  btInit = (async () => {
    try {
      const apiKey = Deno.env.get("BRAINTRUST_API_KEY");
      if (!apiKey) {
        btState = null;
        return null;
      }
      const projectId = Deno.env.get("BRAINTRUST_PROJECT_ID") || DEFAULT_PROJECT_ID;
      // Dynamic import so an SDK that is incompatible with the Deno edge runtime
      // degrades to "no spans" instead of failing the function at module load.
      const bt = await import(braintrustSpecifier());
      const logger = bt.initLogger({ projectId, apiKey });
      btState = { initLogger: bt.initLogger, logger };
      return btState;
    } catch (err) {
      log.error("init", "Braintrust SDK init failed; disabling for this isolate", {}, err);
      btState = null;
      return null;
    } finally {
      btInit = null;
    }
  })();
  return btInit;
}

function nowSeconds(): number {
  return Date.now() / 1000;
}

function scrubValue(v: unknown): unknown {
  if (typeof v === "string") return scrubSecretsOnly(v);
  if (v == null) return v;
  // Objects/arrays: scrub the serialised form (Braintrust stores structured values,
  // but secrets most plausibly ride inside string fields; stringify→scrub→parse keeps
  // the shape while stripping embedded tokens). Fall back to raw on parse trouble.
  try {
    return JSON.parse(scrubSecretsOnly(JSON.stringify(v)));
  } catch {
    return v;
  }
}

const NOOP_SPAN: FleetySpan = { log() {}, end() {} };

const NOOP_TRACE: FleetyTrace = {
  llmSpan: () => NOOP_SPAN,
  log() {},
  setError() {},
  finish: () => Promise.resolve(),
};

export interface StartTraceOpts {
  /** Edge function name (e.g. "techfleet-chat"). */
  fn: string;
  /** Shared trace id from withAuditWrapper's ctx — joins Braintrust ↔ audit_log ↔ logs. */
  traceId?: string;
  /** DB user_id, carried as metadata (NOT scrubbed — identity, not content). */
  userId?: string;
  /** "member" | "internal" — the Discord/adapter path is system-attributed, not a real user. */
  caller?: string;
  /** Raw user question (root span input). Scrubbed for secrets before buffering. */
  question: unknown;
  /** Extra root metadata (intent, retrieval counts, cache flags, …). */
  metadata?: Record<string, unknown>;
  /** Optional escalation for flush failures (e.g. a capped audit event). */
  onError?: (message: string, err: unknown) => void;
}

/**
 * Begin a trace for one Fleety turn. Returns a no-op trace when disabled, so
 * callers never branch on the flag/key. Pure allocation — no SDK work here.
 */
export function startFleetyTrace(opts: StartTraceOpts): FleetyTrace {
  if (!braintrustEnabled()) return NOOP_TRACE;

  const buffer: TraceBuffer = {
    rootName: "fleety-turn",
    input: scrubValue(opts.question),
    metadata: {
      fn: opts.fn,
      ...(opts.traceId ? { trace_id: opts.traceId } : {}),
      ...(opts.userId ? { user_id: opts.userId } : {}),
      caller: opts.caller ?? "member",
      ...(opts.metadata ?? {}),
    },
    metrics: {},
    start: nowSeconds(),
    children: [],
  };

  let finished = false;

  const makeSpan = (rec: SpanRecord): FleetySpan => {
    let ended = false;
    return {
      log(fields: SpanLogFields) {
        try {
          if (fields.output !== undefined) rec.output = scrubValue(fields.output);
          if (fields.metadata) rec.metadata = { ...(rec.metadata ?? {}), ...fields.metadata };
          if (fields.metrics) rec.metrics = { ...rec.metrics, ...fields.metrics };
        } catch {
          /* fail-open: never let telemetry throw into the turn */
        }
      },
      end() {
        if (ended) return;
        ended = true;
        rec.end = nowSeconds();
      },
    };
  };

  return {
    llmSpan(name: string, input: unknown, metadata?: Record<string, unknown>): FleetySpan {
      try {
        const rec: SpanRecord = {
          name,
          type: "llm",
          input: scrubValue(input),
          metadata,
          metrics: {},
          start: nowSeconds(),
        };
        buffer.children.push(rec);
        return makeSpan(rec);
      } catch {
        return NOOP_SPAN;
      }
    },
    log(fields: SpanLogFields) {
      try {
        if (fields.output !== undefined) buffer.output = scrubValue(fields.output);
        if (fields.metadata) buffer.metadata = { ...buffer.metadata, ...fields.metadata };
        if (fields.metrics) buffer.metrics = { ...buffer.metrics, ...fields.metrics };
      } catch {
        /* fail-open */
      }
    },
    setError(err: unknown) {
      try {
        buffer.metadata = {
          ...buffer.metadata,
          error: true,
          error_message: err instanceof Error ? err.message : String(err),
        };
      } catch {
        /* fail-open */
      }
    },
    finish(): Promise<void> {
      if (finished) return Promise.resolve();
      finished = true;
      buffer.end = nowSeconds();
      return scheduleFlush(() => materialiseAndFlush(buffer, opts.onError));
    },
    // Test-only seam (not on the FleetyTrace interface): inspect the buffered
    // records without touching the SDK or the network.
    _snapshot: () => buffer,
  } as FleetyTrace & { _snapshot: () => TraceBuffer };
}

export interface BtSpanEvent {
  name: string;
  type: string;
  event: {
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
    metrics?: SpanMetrics;
  };
}

export interface BtEvents {
  root: BtSpanEvent;
  children: BtSpanEvent[];
}

/**
 * Map an OpenAI-compatible `usage` object (OpenRouter/DeepSeek, Gemini-compat) to
 * Braintrust span metrics. Tolerant of missing/partial fields. Pure.
 */
export function parseUsage(usage: unknown): SpanMetrics {
  const u = (usage ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  const prompt_tokens = num(u.prompt_tokens);
  const completion_tokens = num(u.completion_tokens);
  const total = num(u.total_tokens);
  const m: SpanMetrics = {};
  if (prompt_tokens !== undefined) m.prompt_tokens = prompt_tokens;
  if (completion_tokens !== undefined) m.completion_tokens = completion_tokens;
  const tokens =
    total ??
    (prompt_tokens !== undefined || completion_tokens !== undefined
      ? (prompt_tokens ?? 0) + (completion_tokens ?? 0)
      : undefined);
  if (tokens !== undefined) m.tokens = tokens;
  return m;
}

/**
 * Pure mapper from the in-memory buffer to the exact {name,type,event} objects
 * handed to the Braintrust SDK. Extracted so span assembly is unit-testable with
 * no SDK import and no network.
 */
export function buildEvents(buffer: TraceBuffer): BtEvents {
  return {
    root: {
      name: buffer.rootName,
      type: "task",
      event: {
        input: buffer.input,
        ...(buffer.output !== undefined ? { output: buffer.output } : {}),
        metadata: buffer.metadata,
        metrics: withTiming(buffer.metrics, buffer.start, buffer.end),
      },
    },
    children: buffer.children.map((c) => ({
      name: c.name,
      type: c.type,
      event: {
        input: c.input,
        ...(c.output !== undefined ? { output: c.output } : {}),
        ...(c.metadata ? { metadata: c.metadata } : {}),
        metrics: withTiming(c.metrics, c.start, c.end),
      },
    })),
  };
}

/**
 * Run the post-response work: prefer EdgeRuntime.waitUntil (non-blocking, the
 * platform keeps the isolate alive to finish it). When unavailable, fall back to
 * a bounded inline run that the caller may await. Never throws.
 */
function scheduleFlush(task: () => Promise<void>): Promise<void> {
  try {
    const edge = (
      globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }
    ).EdgeRuntime;
    if (edge && typeof edge.waitUntil === "function") {
      edge.waitUntil(boundedRun(task));
      return Promise.resolve();
    }
  } catch {
    /* fall through to inline */
  }
  return boundedRun(task);
}

async function boundedRun(task: () => Promise<void>): Promise<void> {
  try {
    let timer: number | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, FLUSH_TIMEOUT_MS) as unknown as number;
    });
    await Promise.race([task(), timeout]);
    if (timer !== undefined) clearTimeout(timer);
  } catch (err) {
    log.warn("flush", "Braintrust post-response work failed", {}, err);
  }
}

async function materialiseAndFlush(
  buffer: TraceBuffer,
  onError?: (message: string, err: unknown) => void
): Promise<void> {
  try {
    const bt = await ensureBraintrust();
    if (!bt) return;
    // deno-lint-ignore no-explicit-any
    const logger = bt.logger as any;

    const events = buildEvents(buffer);
    const root = logger.startSpan(events.root);
    for (const child of events.children) {
      const span = root.startSpan(child);
      span.end();
    }
    root.end();

    await logger.flush();
  } catch (err) {
    log.warn("flush", "Braintrust materialise/flush failed", {}, err);
    try {
      onError?.("braintrust_flush_failed", err);
    } catch {
      /* never let escalation throw */
    }
  }
}

function withTiming(metrics: SpanMetrics, start: number, end?: number): SpanMetrics {
  return { ...metrics, start, ...(end !== undefined ? { end } : {}) };
}
