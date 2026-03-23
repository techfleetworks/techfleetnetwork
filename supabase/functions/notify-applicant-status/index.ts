import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // Verify the caller is authenticated
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Verify caller is admin
  const { data: isAdmin } = await supabase.rpc('has_role', {
    _user_id: user.id,
    _role: 'admin',
  })
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: {
    applicationId: string
    applicantUserId: string
    applicantEmail: string
    applicantFirstName: string
    newStatus: string
    coordinatorName: string
    schedulingUrl?: string
    projectId: string
  }

  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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
  } = body

  if (!applicationId || !applicantUserId || !newStatus) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Update applicant_status
  const { error: updateError } = await supabase
    .from('project_applications')
    .update({ applicant_status: newStatus })
    .eq('id', applicationId)

  if (updateError) {
    console.error('Failed to update status', updateError)
    return new Response(JSON.stringify({ error: 'Failed to update status' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Build notification content based on status
  let notifTitle = ''
  let notifBody = ''
  let notifType = 'status_change'
  let linkUrl = ''

  switch (newStatus) {
    case 'invited_to_interview':
      notifTitle = '🎉 Interview Invitation'
      notifBody = `<p>You have been invited to interview by <strong>${coordinatorName}</strong>.</p>`
      if (schedulingUrl) {
        notifBody += `<p>Schedule your interview: <a href="${schedulingUrl}">${schedulingUrl}</a></p>`
        notifBody += `<p>Prepare with the <a href="https://guide.techfleet.org/team-portal/new-teammate-handbook/project-training-teams/applying-to-tech-fleet-project-training/interview-guide-for-tech-fleet-project-training/teammate-interview-guide-for-project-coordinators">Interview Guide</a>.</p>`
      }
      notifType = 'interview_invite'
      break
    case 'picked_for_team':
      notifTitle = '🚀 You\'ve been picked for a team!'
      notifBody = `<p>Congratulations! You have been selected to join a Tech Fleet project team.</p>`
      notifType = 'picked_for_team'
      break
    case 'not_selected':
      notifTitle = 'Application Update'
      notifBody = `<p>Thank you for applying. Unfortunately, you were not selected for this project at this time. We encourage you to apply to future projects!</p>`
      notifType = 'not_selected'
      break
    case 'active_participant':
      notifTitle = '✅ You\'re now an Active Participant'
      notifBody = `<p>Your status has been updated to Active Participant. Welcome to the team!</p>`
      notifType = 'active_participant'
      break
    case 'left_the_project':
      notifTitle = 'Project Status Updated'
      notifBody = `<p>Your project participation status has been updated.</p>`
      notifType = 'left_project'
      break
    default:
      notifTitle = 'Application Status Updated'
      notifBody = `<p>Your application status has been updated to: ${newStatus}.</p>`
  }

  // Insert in-app notification (service_role bypasses RLS)
  const { error: notifError } = await supabase.from('notifications').insert({
    user_id: applicantUserId,
    title: notifTitle,
    body_html: notifBody,
    notification_type: notifType,
    link_url: linkUrl,
    read: false,
  })

  if (notifError) {
    console.error('Failed to insert notification', notifError)
  } else {
    console.log('In-app notification created for', applicantUserId, notifType)
  }

  // Write audit log
  await supabase.rpc('write_audit_log', {
    p_event_type: `applicant_status_${newStatus}`,
    p_table_name: 'project_applications',
    p_record_id: applicationId,
    p_user_id: user.id,
    p_changed_fields: [applicantUserId, newStatus],
  }).catch((e: unknown) => console.warn('Audit log write failed', e))

  // Send email for interview invites
  let emailSent = false
  if (newStatus === 'invited_to_interview' && applicantEmail && schedulingUrl) {
    const idempotencyKey = `interview-invite-${applicationId}-${Date.now()}`
    try {
      const { error: emailError } = await supabase.functions.invoke(
        'send-transactional-email',
        {
          body: {
            templateName: 'interview-invite',
            recipientEmail: applicantEmail,
            idempotencyKey,
            templateData: {
              firstName: applicantFirstName || undefined,
              coordinatorName,
              schedulingUrl,
            },
          },
        }
      )
      if (emailError) {
        console.error('Email invocation error', emailError)
      } else {
        emailSent = true
        console.log('Interview invite email sent to', applicantEmail)
      }
    } catch (e) {
      console.error('Email send failed', e)
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      notificationCreated: !notifError,
      emailSent,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
