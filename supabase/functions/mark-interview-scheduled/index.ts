/**
 * mark-interview-scheduled — Edge Function
 *
 * Called by applicants to mark their interview as scheduled.
 * Updates applicant_status to 'interview_scheduled' and sends
 * an in-app notification to the admin who invited them.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
} as const

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' } as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500, headers: JSON_HEADERS })
  }

  // Auth - verify the calling user
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
  }

  // Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS })
  }

  const applicationId = body.application_id
  if (typeof applicationId !== 'string' || !UUID_RE.test(applicationId)) {
    return new Response(JSON.stringify({ error: 'Invalid application_id' }), { status: 400, headers: JSON_HEADERS })
  }

  // Verify the application belongs to this user and is in a valid state
  const { data: application, error: appError } = await supabase
    .from('project_applications')
    .select('id, user_id, applicant_status, project_id')
    .eq('id', applicationId)
    .single()

  if (appError || !application) {
    return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404, headers: JSON_HEADERS })
  }

  if (application.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: JSON_HEADERS })
  }

  const validFromStatuses = ['invited_to_interview']
  if (!validFromStatuses.includes(application.applicant_status)) {
    return new Response(JSON.stringify({ error: 'Cannot mark as scheduled from current status' }), { status: 400, headers: JSON_HEADERS })
  }

  // Update status
  const { error: updateError } = await supabase
    .from('project_applications')
    .update({ applicant_status: 'interview_scheduled' })
    .eq('id', applicationId)

  if (updateError) {
    console.error('Status update failed', updateError)
    return new Response(JSON.stringify({ error: 'Failed to update status' }), { status: 500, headers: JSON_HEADERS })
  }

  // Find the project coordinator from the projects table
  let adminUserId: string | null = null
  if (application.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('coordinator_id')
      .eq('id', application.project_id)
      .single()
    if (project?.coordinator_id) {
      adminUserId = project.coordinator_id
    }
  }

  // Fallback: search audit log for the admin who sent the invite
  if (!adminUserId) {
    const { data: auditEntries } = await supabase
      .from('audit_log')
      .select('user_id')
      .eq('table_name', 'project_applications')
      .eq('record_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (auditEntries) {
      for (const entry of auditEntries) {
        if (entry.user_id && entry.user_id !== user.id) {
          adminUserId = entry.user_id
          break
        }
      }
    }
  }

  // Get applicant display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, first_name, last_name')
    .eq('user_id', user.id)
    .single()

  const applicantName = profile?.display_name || 
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 
    'An applicant'

  // Get client name for the notification
  let clientName = 'a project'
  if (application.project_id) {
    const { data: project } = await supabase
      .from('projects')
      .select('client_id')
      .eq('id', application.project_id)
      .single()
    if (project?.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('name')
        .eq('id', project.client_id)
        .single()
      if (client?.name) clientName = client.name
    }
  }

  // Send notification to admin(s) — uses safe_create_notification for
  // automatic retry/backoff/DLQ. Failures self-report to the audit log so
  // admins are alerted without manual monitoring.
  const safeApplicantName = escapeHtml(applicantName)
  const safeClientName = escapeHtml(clientName)
  const notifTitle = `📅 Interview Scheduled — ${applicantName}`
  const notifBody = `<p><strong>${safeApplicantName}</strong> has indicated they have scheduled their interview for the <strong>${safeClientName}</strong> project.</p>`

  async function safeNotify(userId: string) {
    const { error } = await supabase.rpc('safe_create_notification', {
      p_user_id: userId,
      p_title: notifTitle,
      p_body_html: notifBody,
      p_notification_type: 'interview_scheduled',
      p_link_url: '/admin/roster',
      p_source: 'mark-interview-scheduled',
    })
    if (error) console.error('Failed to enqueue notification', { userId, error: error.message })
  }

  if (adminUserId) {
    try {
      await safeNotify(adminUserId)
      console.info('Admin notification queued', { adminUserId, applicantName, clientName })
    } catch (e) {
      console.error('Failed to enqueue admin notification', e)
    }
  } else {
    console.warn('No specific admin found — notifying all admins', { applicationId })
    try {
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin')
      if (adminRoles && adminRoles.length > 0) {
        await Promise.all(adminRoles.map((r: { user_id: string }) => safeNotify(r.user_id)))
        console.info('All admins notified', { count: adminRoles.length, applicantName })
      }
    } catch (e) {
      console.error('Fallback admin notification failed', e)
    }
  }

  // Audit log
  try {
    await supabase.rpc('write_audit_log', {
      p_event_type: 'applicant_marked_interview_scheduled',
      p_table_name: 'project_applications',
      p_record_id: applicationId,
      p_user_id: user.id,
      p_changed_fields: ['interview_scheduled'],
    })
  } catch (e) {
    console.warn('Audit log failed (non-critical)', e)
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS })
})
