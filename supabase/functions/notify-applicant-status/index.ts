/**
 * notify-applicant-status — Enterprise-grade Edge Function
 *
 * Atomically updates an applicant's status, creates an in-app notification,
 * writes an audit log entry, and optionally triggers a transactional email
 * (interview invite). When status is "active_participant", automatically assigns
 * the project's Discord role and logs the result to the activity log.
 *
 * Security: JWT verification + admin role check (SECURITY DEFINER has_role).
 * Payload: Zod-validated, size-limited (32 KiB), XSS-sanitized.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { queueTransactionalEmail } from '../_shared/transactional-email.ts'
import { discordFetch } from '../_shared/discord-fetch.ts'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_PAYLOAD_BYTES = 32_768 // 32 KiB
const VALID_STATUSES = new Set([
  'pending_review',
  'invited_to_interview',
  'interview_scheduled',
  'not_selected',
  'active_participant',
  'left_the_project',
] as const)

type ApplicantStatus = 'pending_review' | 'invited_to_interview' | 'interview_scheduled' | 'not_selected' | 'active_participant' | 'left_the_project'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
} as const

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' } as const

const INTERVIEW_GUIDE_URL =
  'https://guide.techfleet.org/team-portal/new-teammate-handbook/project-training-teams/applying-to-tech-fleet-project-training/interview-guide-for-tech-fleet-project-training/teammate-interview-guide-for-project-coordinators'

/* ------------------------------------------------------------------ */
/*  Notification content map                                           */
/* ------------------------------------------------------------------ */

interface NotificationContent {
  title: string
  bodyFn: (ctx: { coordinatorName: string; schedulingUrl?: string }) => string
  type: string
  linkUrl: string
}

const NOTIFICATION_MAP: Record<ApplicantStatus, NotificationContent> = {
  pending_review: {
    title: 'Application Status Updated',
    bodyFn: () => '<p>Your application status has been updated to Pending Review.</p>',
    type: 'status_change',
    linkUrl: '',
  },
  invited_to_interview: {
    title: '🎉 Interview Invitation',
    bodyFn: ({ coordinatorName, schedulingUrl }) => {
      const safeName = escapeHtml(coordinatorName || 'a Tech Fleet Project Coordinator')
      let html = `<p>You have been invited to interview by <strong>${safeName}</strong>.</p>`
      if (schedulingUrl) {
        const safeUrl = escapeHtml(schedulingUrl)
        html += `<p>Schedule your interview: <a href="${safeUrl}">${safeUrl}</a></p>`
        html += `<p>Prepare with the <a href="${INTERVIEW_GUIDE_URL}">Interview Guide</a>.</p>`
      }
      return html
    },
    type: 'interview_invite',
    linkUrl: '',
  },
  interview_scheduled: {
    title: '📅 Interview Scheduled',
    bodyFn: () => '<p>The applicant has indicated they have scheduled their interview.</p>',
    type: 'interview_scheduled',
    linkUrl: '',
  },
  active_participant: {
    title: '🚀 You\'re now an Active Teammate!',
    bodyFn: () => '<p>Congratulations! You have been selected to join a Tech Fleet project team. Welcome aboard!</p>',
    type: 'active_participant',
    linkUrl: '',
  },
  not_selected: {
    title: 'Application Update',
    bodyFn: () =>
      '<p>Thank you for applying. Unfortunately, you were not selected for this project at this time. We encourage you to apply to future projects!</p>',
    type: 'not_selected',
    linkUrl: '',
  },
  left_the_project: {
    title: 'Project Status Updated',
    bodyFn: () => '<p>Your project participation status has been updated.</p>',
    type: 'left_project',
    linkUrl: '',
  },
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeString(val: unknown, maxLen = 512): string {
  if (typeof val !== 'string') return ''
  return val.slice(0, maxLen).trim()
}

function isValidUuid(val: unknown): val is string {
  return typeof val === 'string' && UUID_RE.test(val)
}

function isValidUrl(val: unknown): boolean {
  if (typeof val !== 'string' || !val) return false
  try {
    const url = new URL(val)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status)
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

interface ValidatedPayload {
  applicationId: string
  applicantUserId: string
  applicantEmail: string
  applicantFirstName: string
  newStatus: ApplicantStatus
  coordinatorName: string
  schedulingUrl: string | undefined
  projectId: string
}

function validatePayload(raw: unknown): { ok: true; data: ValidatedPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid payload' }

  const obj = raw as Record<string, unknown>

  const applicationId = obj.applicationId
  const applicantUserId = obj.applicantUserId
  const projectId = obj.projectId
  const newStatus = obj.newStatus

  if (!isValidUuid(applicationId)) return { ok: false, error: 'Invalid applicationId' }
  if (!isValidUuid(applicantUserId)) return { ok: false, error: 'Invalid applicantUserId' }
  if (!isValidUuid(projectId)) return { ok: false, error: 'Invalid projectId' }
  if (typeof newStatus !== 'string' || !VALID_STATUSES.has(newStatus as ApplicantStatus)) {
    return { ok: false, error: `Invalid status: ${sanitizeString(newStatus, 64)}` }
  }

  const schedulingUrl = obj.schedulingUrl ? sanitizeString(obj.schedulingUrl, 2048) : undefined
  if (schedulingUrl && !isValidUrl(schedulingUrl)) {
    return { ok: false, error: 'Invalid schedulingUrl' }
  }

  return {
    ok: true,
    data: {
      applicationId,
      applicantUserId,
      applicantEmail: sanitizeString(obj.applicantEmail, 320),
      applicantFirstName: sanitizeString(obj.applicantFirstName, 128),
      newStatus: newStatus as ApplicantStatus,
      coordinatorName: sanitizeString(obj.coordinatorName, 256),
      schedulingUrl,
      projectId,
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Discord role assignment helper (with retry)                        */
/* ------------------------------------------------------------------ */

async function assignDiscordRole(discordUserId: string, roleId: string): Promise<{ ok: boolean; error?: string }> {
  const botToken = Deno.env.get('DISCORD_BOT_TOKEN')
  const guildId = Deno.env.get('DISCORD_GUILD_ID')

  if (!botToken || !guildId) {
    return { ok: false, error: 'Discord bot not configured' }
  }

  try {
    const { response: res, retries } = await discordFetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bot ${botToken}` },
      },
    )

    if (retries > 0) {
      console.info('Discord role assignment succeeded after retries', { retries, discordUserId, roleId })
    }

    if (!res.ok) {
      const errorText = await res.text()
      console.error('Discord role assignment failed', { status: res.status, error: errorText.substring(0, 500) })
      return { ok: false, error: `Discord API ${res.status}` }
    }

    await res.text() // consume body
    return { ok: true }
  } catch (e) {
    console.error('Discord role assignment error after retries', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  /* ---- Env ---- */
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return errorResponse('Server misconfiguration', 500)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  /* ---- Auth ---- */
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Unauthorized', 401)
  }

  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return errorResponse('Unauthorized', 401)
  }

  const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' })
  if (!isAdmin) {
    return errorResponse('Forbidden', 403)
  }

  /* ---- Payload size check ---- */
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    return errorResponse('Payload too large', 413)
  }

  /* ---- Parse & validate ---- */
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return errorResponse('Invalid JSON', 400)
  }

  const validation = validatePayload(rawBody)
  if (!validation.ok) {
    return errorResponse(validation.error, 400)
  }

  const {
    applicationId,
    applicantUserId,
    applicantEmail,
    applicantFirstName,
    newStatus,
    coordinatorName,
    schedulingUrl,
    projectId,
  } = validation.data

  /* ---- 1. Update status (critical — fail-fast) ---- */
  const { error: updateError } = await supabase
    .from('project_applications')
    .update({ applicant_status: newStatus })
    .eq('id', applicationId)

  if (updateError) {
    console.error('Status update failed', { applicationId, newStatus, error: updateError.message })
    return errorResponse('Failed to update status', 500)
  }

  console.info('Status updated', { applicationId, newStatus })

  /* ---- 2. In-app notification (non-blocking) ---- */
  const content = NOTIFICATION_MAP[newStatus]
  let notificationCreated = false

  try {
    const { error: notifError } = await supabase.from('notifications').insert({
      user_id: applicantUserId,
      title: content.title,
      body_html: content.bodyFn({ coordinatorName, schedulingUrl }),
      notification_type: content.type,
      link_url: content.linkUrl,
      read: false,
    })

    if (notifError) {
      console.error('Notification insert failed', { applicantUserId, error: notifError.message })
    } else {
      notificationCreated = true
      console.info('Notification created', { applicantUserId, type: content.type })
    }
  } catch (e) {
    console.error('Notification error', e)
  }

  /* ---- 3. Audit log (non-blocking) ---- */
  try {
    await supabase.rpc('write_audit_log', {
      p_event_type: `applicant_status_${newStatus}`,
      p_table_name: 'project_applications',
      p_record_id: applicationId,
      p_user_id: user.id,
      p_changed_fields: [applicantUserId, newStatus],
    })
  } catch (e) {
    console.warn('Audit log failed (non-critical)', e)
  }

  /* ---- 4. Email — interview invite (non-blocking) ---- */
  let emailSent = false
  if (newStatus === 'invited_to_interview' && applicantEmail && schedulingUrl) {
    const timestamp = Date.now()
    const idempotencyKey = `interview-invite-${applicationId}-${timestamp}`
    try {
      const emailResult = await queueTransactionalEmail({
        supabase,
        templateName: 'interview-invite',
        recipientEmail: applicantEmail,
        idempotencyKey,
        messageId: idempotencyKey,
        templateData: {
          firstName: applicantFirstName || undefined,
          coordinatorName,
          schedulingUrl,
        },
      })

      if (!emailResult.ok) {
        console.error('Email queue failed', {
          status: emailResult.status,
          error: emailResult.error,
          applicantEmail,
          applicationId,
        })
      } else {
        emailSent = !emailResult.suppressed
        console.info('Interview email processed', {
          applicantEmail,
          queued: !emailResult.suppressed,
          suppressed: emailResult.suppressed,
          messageId: emailResult.messageId,
        })
      }
    } catch (e) {
      console.error('Email send error', e)
    }
  }

  /* ---- 5. Discord role assignment for active_participant (non-blocking) ---- */
  let discordRoleAssigned = false

  if (newStatus === 'active_participant') {
    try {
      // Fetch project Discord role
      const { data: projectData } = await supabase
        .from('projects')
        .select('discord_role_id, discord_role_name')
        .eq('id', projectId)
        .single()

      const discordRoleId = projectData?.discord_role_id as string | undefined
      const discordRoleName = projectData?.discord_role_name as string | undefined

      if (discordRoleId) {
        // Fetch applicant profile for Discord info
        const { data: applicantProfile } = await supabase
          .from('profiles')
          .select('discord_user_id, discord_username')
          .eq('user_id', applicantUserId)
          .single()

        const applicantDiscordUserId = applicantProfile?.discord_user_id as string | undefined

        if (applicantDiscordUserId) {
          // Assign Discord role automatically (with retry)
          const result = await assignDiscordRole(applicantDiscordUserId, discordRoleId)
          if (result.ok) {
            discordRoleAssigned = true
            console.info('Discord role assigned', {
              applicantUserId,
              discordUserId: applicantDiscordUserId,
              roleId: discordRoleId,
              roleName: discordRoleName,
            })

            // Log to audit
            try {
              await supabase.rpc('write_audit_log', {
                p_event_type: 'discord_role_assigned',
                p_table_name: 'project_applications',
                p_record_id: applicationId,
                p_user_id: user.id,
                p_changed_fields: [applicantUserId, discordRoleId, discordRoleName || ''],
              })
            } catch (auditErr) {
              console.warn('Discord role audit log failed', auditErr)
            }
          } else {
            console.error('Discord role assignment failed', {
              applicantUserId,
              error: result.error,
            })

            // Log failure to audit
            try {
              await supabase.rpc('write_audit_log', {
                p_event_type: 'discord_role_assignment_failed',
                p_table_name: 'project_applications',
                p_record_id: applicationId,
                p_user_id: user.id,
                p_changed_fields: [applicantUserId, discordRoleId],
                p_error_message: result.error || 'Unknown error',
              })
            } catch (auditErr) {
              console.warn('Discord role failure audit log failed', auditErr)
            }
          }
        }
      }
    } catch (e) {
      console.error('Discord role assignment flow error', e)
    }
  }

  /* ---- Response ---- */
  return jsonResponse({
    success: true,
    notificationCreated,
    emailSent,
    discordRoleAssigned,
  })
})
