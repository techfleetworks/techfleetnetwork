import { sendLovableEmail } from 'npm:@lovable.dev/email-js'
import { createClient } from 'npm:@supabase/supabase-js@2'

// ── Configuration ──────────────────────────────────────────────────────────────
const MAX_RETRIES = 5
const MAX_READ_CT = 20              // Safety net: DLQ if pgmq read_ct exceeds this
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60
const CONSECUTIVE_FAIL_CIRCUIT_BREAKER = 3  // Skip rest of queue after N consecutive failures
const REQUIRED_PAYLOAD_FIELDS = ['to', 'from', 'sender_domain', 'subject', 'html'] as const

// ── Helpers ────────────────────────────────────────────────────────────────────
function isRateLimited(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429
  }
  return error instanceof Error && error.message.includes('429')
}

function getRetryAfterSeconds(error: unknown): number {
  if (error && typeof error === 'object' && 'retryAfterSeconds' in error) {
    return (error as { retryAfterSeconds: number | null }).retryAfterSeconds ?? 60
  }
  return 60
}

function buildPlainText(html: unknown): string {
  if (typeof html !== 'string' || !html.trim()) return ''
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Validate that the payload has all required fields for the email API */
function validatePayload(payload: Record<string, unknown>): string | null {
  for (const field of REQUIRED_PAYLOAD_FIELDS) {
    if (!payload[field] || typeof payload[field] !== 'string' || !(payload[field] as string).trim()) {
      return `Missing or empty required field: ${field}`
    }
  }
  return null
}

/** Ensure every message has a usable message_id for dedup/tracking */
function ensureMessageId(payload: Record<string, unknown>): string {
  if (payload.message_id && typeof payload.message_id === 'string') {
    return payload.message_id
  }
  // Generate a deterministic fallback from available fields
  const fallback = `auto-${crypto.randomUUID()}`
  payload.message_id = fallback
  return fallback
}

async function getOrCreateUnsubscribeToken(
  supabase: ReturnType<typeof createClient>,
  email: unknown
): Promise<string | null> {
  if (typeof email !== 'string') return null
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return null

  const { data: existingToken, error: existingError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalizedEmail)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError
  if (existingToken?.token) return existingToken.token

  const token = crypto.randomUUID()
  const { error: insertError } = await supabase.from('email_unsubscribe_tokens').insert({
    email: normalizedEmail,
    token,
  })
  if (insertError) throw insertError
  return token
}

// ── Message disposition helpers ────────────────────────────────────────────────
interface MessageContext {
  supabase: ReturnType<typeof createClient>
  queue: string
  dlq: string
  msgId: number
  payload: Record<string, unknown>
  messageId: string
}

async function moveToDlq(ctx: MessageContext, reason: string): Promise<void> {
  await ctx.supabase.from('email_send_log').insert({
    message_id: ctx.messageId,
    template_name: (ctx.payload.label || ctx.queue) as string,
    recipient_email: (ctx.payload.to || 'unknown') as string,
    status: 'dlq',
    error_message: reason.slice(0, 1000),
  })
  const { error } = await ctx.supabase.rpc('move_to_dlq', {
    source_queue: ctx.queue,
    dlq_name: ctx.dlq,
    message_id: ctx.msgId,
    payload: ctx.payload,
  })
  if (error) {
    console.error('Failed to move message to DLQ', {
      queue: ctx.queue,
      msg_id: ctx.msgId,
      message_id: ctx.messageId,
      error,
    })
  }
}

async function deleteFromQueue(ctx: MessageContext): Promise<void> {
  const { error } = await ctx.supabase.rpc('delete_email', {
    queue_name: ctx.queue,
    message_id: ctx.msgId,
  })
  if (error) {
    console.error('Failed to delete message from queue', {
      queue: ctx.queue,
      msg_id: ctx.msgId,
      error,
    })
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const token = authHeader.slice('Bearer '.length).trim()
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1. Check rate-limit cooldown and read queue config
  const { data: state } = await supabase
    .from('email_send_state')
    .select('retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes')
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails: state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0
  let totalSkipped = 0
  let totalDlq = 0
  const stats: Record<string, unknown> = {}

  // 2. Process auth_emails first (priority), then transactional_emails
  for (const queue of ['auth_emails', 'transactional_emails']) {
    const dlq = `${queue}_dlq`
    let consecutiveFailures = 0
    let queueProcessed = 0
    let queueDlq = 0

    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', { queue, error: readError })
      continue
    }

    if (!messages?.length) continue

    // Pre-load failed attempt counts for all messages with valid message_ids
    const messageIds = Array.from(
      new Set(
        messages
          .map((msg: { message: Record<string, unknown> }) => {
            const mid = msg?.message?.message_id
            return mid && typeof mid === 'string' ? mid : null
          })
          .filter((id: string | null): id is string => Boolean(id))
      )
    )

    const failedAttemptsByMessageId = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: failedRows, error: failedRowsError } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')

      if (failedRowsError) {
        console.error('Failed to load failed-attempt counters', { queue, error: failedRowsError })
      } else {
        for (const row of failedRows ?? []) {
          const mid = row?.message_id
          if (typeof mid !== 'string' || !mid) continue
          failedAttemptsByMessageId.set(mid, (failedAttemptsByMessageId.get(mid) ?? 0) + 1)
        }
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message as Record<string, unknown>
      const messageId = ensureMessageId(payload)

      const ctx: MessageContext = {
        supabase,
        queue,
        dlq,
        msgId: msg.msg_id,
        payload,
        messageId,
      }

      const failedAttempts = failedAttemptsByMessageId.get(messageId) ?? 0

      // ── GUARD 1: read_ct safety net ──────────────────────────────────────
      // If pgmq has read this message MAX_READ_CT times, something is very
      // wrong. DLQ it immediately regardless of failed_attempts tracking.
      if (msg.read_ct >= MAX_READ_CT) {
        console.error('Message exceeded max read count — force DLQ', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          message_id: messageId,
        })
        await moveToDlq(ctx, `Max read count exceeded (read_ct=${msg.read_ct}, limit=${MAX_READ_CT})`)
        queueDlq++
        continue
      }

      // ── GUARD 2: Payload validation ──────────────────────────────────────
      // Reject malformed messages immediately instead of retrying forever
      const validationError = validatePayload(payload)
      if (validationError) {
        console.error('Malformed email payload — moving to DLQ', {
          queue,
          msg_id: msg.msg_id,
          message_id: messageId,
          error: validationError,
        })
        await moveToDlq(ctx, `Invalid payload: ${validationError}`)
        queueDlq++
        continue
      }

      // ── GUARD 3: TTL expiry ──────────────────────────────────────────────
      if (payload.queued_at) {
        const ageMs = Date.now() - new Date(payload.queued_at as string).getTime()
        const maxAgeMs = (ttlMinutes[queue] ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES) * 60 * 1000
        if (ageMs > maxAgeMs) {
          console.warn('Email expired (TTL exceeded)', {
            queue,
            msg_id: msg.msg_id,
            queued_at: payload.queued_at,
            ttl_minutes: ttlMinutes[queue],
          })
          await moveToDlq(ctx, `TTL exceeded (${ttlMinutes[queue]} minutes)`)
          queueDlq++
          continue
        }
      }

      // ── GUARD 4: Max failed retries ──────────────────────────────────────
      if (failedAttempts >= MAX_RETRIES) {
        await moveToDlq(ctx, `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`)
        queueDlq++
        continue
      }

      // ── GUARD 5: Idempotency — already sent ─────────────────────────────
      if (messageId) {
        const { data: alreadySent } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', messageId)
          .eq('status', 'sent')
          .maybeSingle()

        if (alreadySent) {
          console.warn('Skipping duplicate send (already sent)', {
            queue,
            msg_id: msg.msg_id,
            message_id: messageId,
          })
          await deleteFromQueue(ctx)
          totalSkipped++
          continue
        }
      }

      // ── SEND ─────────────────────────────────────────────────────────────
      try {
        const unsubscribeToken =
          payload.purpose === 'transactional'
            ? await getOrCreateUnsubscribeToken(supabase, payload.to)
            : null

        const requestPayload: Record<string, unknown> = {
          to: payload.to,
          from: payload.from,
          sender_domain: payload.sender_domain,
          subject: payload.subject,
          html: payload.html,
          text: payload.text || buildPlainText(payload.html),
          purpose: payload.purpose,
          label: payload.label || payload.template_name,
          idempotency_key: payload.idempotency_key ?? messageId,
          unsubscribe_token: payload.unsubscribe_token ?? unsubscribeToken,
        }

        await sendLovableEmail(requestPayload, {
          apiKey,
          sendUrl: Deno.env.get('LOVABLE_SEND_URL'),
          idempotencyKey: (payload.idempotency_key ?? messageId) as string,
        })

        // Success — log + delete
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: (payload.label || queue) as string,
          recipient_email: payload.to as string,
          status: 'sent',
        })
        await deleteFromQueue(ctx)
        queueProcessed++
        consecutiveFailures = 0  // Reset circuit breaker on success
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        consecutiveFailures++

        if (isRateLimited(error)) {
          console.warn('Rate limited — pausing queue', {
            queue,
            msg_id: msg.msg_id,
            message_id: messageId,
          })

          // Log rate-limit event (NOT counted as a "failed" attempt)
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: (payload.label || queue) as string,
            recipient_email: (payload.to || 'unknown') as string,
            status: 'rate_limited',
            error_message: errorMsg.slice(0, 1000),
          })

          const retryAfterSecs = getRetryAfterSeconds(error)
          await supabase
            .from('email_send_state')
            .update({
              retry_after_until: new Date(Date.now() + retryAfterSecs * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', 1)

          // IMPORTANT: Only stop processing THIS queue, continue to next queue
          // The remaining messages in this queue stay invisible until VT expires
          break  // Break inner loop, continue outer for-loop
        }

        // Non-429 failure — log as "failed" (counts toward MAX_RETRIES)
        console.error('Email send failed', {
          queue,
          msg_id: msg.msg_id,
          read_ct: msg.read_ct,
          failed_attempts: failedAttempts,
          consecutive_failures: consecutiveFailures,
          message_id: messageId,
          error: errorMsg.slice(0, 500),
        })

        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: (payload.label || queue) as string,
          recipient_email: (payload.to || 'unknown') as string,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
        })
        failedAttemptsByMessageId.set(messageId, failedAttempts + 1)

        // Circuit breaker: if N messages in a row fail with non-429 errors,
        // stop processing this queue. Likely a systemic issue.
        if (consecutiveFailures >= CONSECUTIVE_FAIL_CIRCUIT_BREAKER) {
          console.error('Circuit breaker tripped — stopping queue processing', {
            queue,
            consecutive_failures: consecutiveFailures,
          })
          break
        }

        // Message stays invisible until VT expires (30s), then retried
        continue
      }

      // Small delay between sends to smooth bursts
      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }

    totalProcessed += queueProcessed
    totalDlq += queueDlq
    stats[queue] = { processed: queueProcessed, dlq: queueDlq }
  }

  return new Response(
    JSON.stringify({
      processed: totalProcessed,
      skipped: totalSkipped,
      dlq: totalDlq,
      queues: stats,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
