import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify calling user is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: callingUser }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !callingUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role to check admin status (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: callerRole } = await adminClient
      .from('user_roles')
      .select('id')
      .eq('user_id', callingUser.id)
      .eq('role', 'admin')
      .single()

    if (!callerRole) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const targetUserId = body?.user_id

    if (!targetUserId || typeof targetUserId !== 'string') {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Prevent self-promotion
    if (targetUserId === callingUser.id) {
      return new Response(JSON.stringify({ error: 'Cannot change your own role' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if user already has admin role
    const { data: existingRole } = await adminClient
      .from('user_roles')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('role', 'admin')
      .single()

    if (existingRole) {
      return new Response(JSON.stringify({ error: 'User is already an admin' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get target user's email from profiles
    const { data: targetProfile } = await adminClient
      .from('profiles')
      .select('email, first_name, display_name')
      .eq('user_id', targetUserId)
      .single()

    if (!targetProfile?.email) {
      return new Response(JSON.stringify({ error: 'Target user profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create pending promotion
    const { data: promotion, error: promoErr } = await adminClient
      .from('admin_promotions')
      .insert({ user_id: targetUserId, promoted_by: callingUser.id })
      .select('token')
      .single()

    if (promoErr) {
      console.error('Failed to create promotion:', promoErr)
      return new Response(JSON.stringify({ error: 'Failed to create promotion' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build confirmation URL
    const projectId = Deno.env.get('SUPABASE_URL')?.match(/\/\/([^.]+)/)?.[1] || ''
    const confirmUrl = `${supabaseUrl}/functions/v1/confirm-admin-role?token=${promotion.token}`

    // Enqueue the confirmation email
    const userName = targetProfile.first_name || targetProfile.display_name || 'there'
    const emailPayload = {
      to: targetProfile.email,
      subject: 'Tech Fleet: Confirm Your Admin Role',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Admin Role Confirmation</h2>
          <p>Hi ${userName},</p>
          <p>You've been promoted to an <strong>Admin</strong> role in the Tech Fleet Network by an existing administrator.</p>
          <p>To confirm and activate your admin privileges, please click the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmUrl}" 
               style="background-color: hsl(221, 83%, 53%); color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Confirm Admin Role
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">If you did not expect this, you can safely ignore this email.</p>
          <p style="color: #666; font-size: 14px;">— Tech Fleet Team</p>
        </div>
      `,
    }

    // Try to enqueue via pgmq, fall back to log
    try {
      await adminClient.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: emailPayload,
      })
    } catch (enqueueErr) {
      console.error('Failed to enqueue email, logging instead:', enqueueErr)
      // Log the confirmation URL so it's not lost
      await adminClient.from('email_send_log').insert({
        recipient_email: targetProfile.email,
        template_name: 'admin_promotion',
        status: 'pending',
        metadata: { confirm_url: confirmUrl },
      })
    }

    // Audit
    await adminClient.rpc('write_audit_log', {
      p_event_type: 'admin_promotion_initiated',
      p_table_name: 'admin_promotions',
      p_record_id: targetUserId,
      p_user_id: callingUser.id,
      p_changed_fields: ['role:admin', `target:${targetProfile.email}`],
    })

    return new Response(
      JSON.stringify({ success: true, message: `Confirmation email sent to ${targetProfile.email}` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
