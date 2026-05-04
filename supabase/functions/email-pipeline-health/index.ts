// Generic email-pipeline health probe.
//
// For every template we care about, count *truly* stuck pending sends and
// recent failed sends using the latest-status RPCs (which dedupe email_send_log
// by message_id). If anything is unhealthy, write an audit_log event with a
// fingerprintable event_type so System Health → Top Errors surfaces it.
//
// This mirrors the fix shipped for signup confirmations (where naive
// COUNT(status='pending') inflated forever as later 'sent' rows accumulated)
// and applies the same treatment to all other email pipelines.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// template_name in email_send_log -> short slug used to build the event_type.
// event_type regex requires ^[a-z][a-z0-9_:-]{2,80}$ so we map dashes/underscores
// into a safe slug.
const PROBES: Array<{ template: string; slug: string }> = [
  { template: 'signup',                       slug: 'signup_confirmation' },
  { template: 'signup-confirmation-reminder', slug: 'signup_reminder' },
  { template: 'recovery',                     slug: 'password_recovery' },
  { template: 'transactional_emails',         slug: 'transactional' },
  { template: 'announcement',                 slug: 'announcement' },
  { template: 'interview-invite',             slug: 'interview_invite' },
  { template: 'project_opening_alert',        slug: 'project_opening_alert' },
  { template: 'feedback_alert',               slug: 'feedback_alert' },
  { template: 'admin_promotion',              slug: 'admin_promotion' },
]

const STUCK_AFTER_MINUTES = 15
const FAILED_WINDOW_HOURS = 24

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Service-role only.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  let isServiceRole = false
  try {
    const part = token.split('.')[1]
    if (part) {
      const padded = part + '='.repeat((4 - (part.length % 4)) % 4)
      const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')))
      isServiceRole = decoded?.role === 'service_role'
    }
  } catch { /* ignore */ }
  if (!isServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const stuckCutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000).toISOString()
  const failedCutoff = new Date(Date.now() - FAILED_WINDOW_HOURS * 60 * 60 * 1000).toISOString()

  const results: Array<Record<string, unknown>> = []

  for (const { template, slug } of PROBES) {
    try {
      const [stuckRes, failedRes] = await Promise.all([
        supabase.rpc('email_send_log_latest_stuck', {
          p_template_name: template, p_older_than: stuckCutoff,
        }),
        supabase.rpc('email_send_log_latest_failed', {
          p_template_name: template, p_since: failedCutoff,
        }),
      ])

      const stuck = Array.isArray(stuckRes.data) ? stuckRes.data.length : 0
      const failed = Array.isArray(failedRes.data) ? failedRes.data.length : 0

      const unhealthy = stuck > 0 || failed > 0
      results.push({ template, stuck, failed, unhealthy })

      if (unhealthy) {
        const summary = `${template} email pipeline degraded — stuck_pending:${stuck} · failed_last_24h:${failed}`
        await supabase.rpc('write_audit_log', {
          p_event_type: `email_${slug}_pipeline_unhealthy`,
          p_table_name: 'email_send_log',
          p_record_id: null,
          p_user_id: null,
          p_changed_fields: [
            `stuck_pending:${stuck}`,
            `failed_last_24h:${failed}`,
            `template:${slug}`,
          ],
          p_error_message: summary,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[email-pipeline-health] probe failed', { template, error: msg })
      results.push({ template, error: msg })
    }
  }

  return new Response(JSON.stringify({ ok: true, probed: PROBES.length, results }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
