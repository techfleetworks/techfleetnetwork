// Scheduled job: find users in auth.users who registered >48h ago and never confirmed,
// generate a fresh signup confirmation link, and email it to them as a reminder.
// Safeguards: max 2 reminders per user, min 48h between reminders, hard cutoff at 14 days.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REMINDER_AFTER_HOURS = 48
const MIN_HOURS_BETWEEN_REMINDERS = 48
const MAX_REMINDERS_PER_USER = 2
const HARD_CUTOFF_DAYS = 14
const APP_URL = 'https://techfleetnetwork.lovable.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Service-role only (cron / admin invocation). Accept any token whose JWT
  // payload has role=service_role — this works whether the caller uses the
  // env-injected key or a vault-stored historical key.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  let isServiceRole = false
  try {
    const payloadPart = token.split('.')[1]
    if (payloadPart) {
      const padded = payloadPart + '='.repeat((4 - (payloadPart.length % 4)) % 4)
      const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')))
      isServiceRole = decoded?.role === 'service_role'
    }
  } catch {
    isServiceRole = false
  }
  if (!isServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const now = new Date()
  const reminderThreshold = new Date(now.getTime() - REMINDER_AFTER_HOURS * 3600 * 1000)
  const hardCutoff = new Date(now.getTime() - HARD_CUTOFF_DAYS * 24 * 3600 * 1000)
  const minGapThreshold = new Date(now.getTime() - MIN_HOURS_BETWEEN_REMINDERS * 3600 * 1000)

  let processed = 0
  let sent = 0
  let skipped = 0
  const errors: Array<{ email: string; error: string }> = []

  try {
    // Page through auth.users via admin API (paginate up to ~10 pages = 10,000 users)
    const candidates: Array<{ id: string; email: string; created_at: string }> = []
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      const users = data?.users ?? []
      if (users.length === 0) break

      for (const u of users) {
        if (!u.email) continue
        if (u.email_confirmed_at) continue
        const createdAt = new Date(u.created_at)
        if (createdAt > reminderThreshold) continue // too new
        if (createdAt < hardCutoff) continue // too old, give up
        candidates.push({ id: u.id, email: u.email, created_at: u.created_at })
      }

      if (users.length < 1000) break
    }

    console.log(`[resend-signup-confirmations] ${candidates.length} unconfirmed candidates`)

    for (const c of candidates) {
      processed++
      try {
        // Check existing reminder history
        const { data: existing } = await supabase
          .from('signup_confirmation_reminders')
          .select('attempt_number, sent_at')
          .eq('user_id', c.id)
          .order('sent_at', { ascending: false })

        const reminderCount = existing?.length ?? 0
        if (reminderCount >= MAX_REMINDERS_PER_USER) {
          skipped++
          continue
        }

        if (existing && existing.length > 0) {
          const lastSent = new Date(existing[0].sent_at)
          if (lastSent > minGapThreshold) {
            skipped++
            continue
          }
        }

        // Generate a fresh signup confirmation link
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: 'signup',
          email: c.email,
          options: { redirectTo: `${APP_URL}/` },
        })

        if (linkErr || !linkData?.properties?.action_link) {
          errors.push({ email: c.email, error: linkErr?.message ?? 'no link returned' })
          continue
        }

        const confirmationUrl = linkData.properties.action_link
        const hoursAgo = Math.round((now.getTime() - new Date(c.created_at).getTime()) / 3600000)
        const attemptNumber = reminderCount + 1

        // Send via the standard transactional pipeline (handles queue, retries, suppression)
        const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'signup-confirmation-reminder',
            recipientEmail: c.email,
            idempotencyKey: `signup-reminder-${c.id}-${attemptNumber}`,
            templateData: {
              confirmationUrl,
              hoursAgo,
            },
          },
        })

        if (sendErr) {
          errors.push({ email: c.email, error: sendErr.message })
          continue
        }

        // Log the reminder
        await supabase.from('signup_confirmation_reminders').insert({
          user_id: c.id,
          email: c.email,
          attempt_number: attemptNumber,
        })

        sent++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push({ email: c.email, error: msg })
      }
    }

    return new Response(
      JSON.stringify({
        processed,
        sent,
        skipped,
        errors: errors.slice(0, 20),
        candidates: candidates.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[resend-signup-confirmations] fatal:', msg)
    return new Response(JSON.stringify({ error: msg, processed, sent, skipped }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
