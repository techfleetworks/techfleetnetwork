import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!token || typeof token !== 'string' || token.length < 32) {
      return new Response(
        JSON.stringify({ error: 'Invalid or missing token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Find the pending promotion
    const { data: promotion, error: fetchErr } = await supabase
      .from('admin_promotions')
      .select('id, user_id, confirmed_at')
      .eq('token', token)
      .single()

    if (fetchErr || !promotion) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired confirmation link' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (promotion.confirmed_at) {
      return new Response(
        JSON.stringify({ message: 'Admin role already confirmed', already_confirmed: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Derive the app origin from the Supabase URL (e.g. https://xyz.supabase.co → published app)
    // We use a known app URL; fall back to referer or a safe default
    const appOrigin = Deno.env.get('APP_ORIGIN') || 'https://techfleetnetwork.lovable.app'

    // Grant the admin role
    const { error: roleErr } = await supabase
      .from('user_roles')
      .upsert({ user_id: promotion.user_id, role: 'admin' }, { onConflict: 'user_id,role' })

    if (roleErr) {
      console.error('Failed to grant admin role:', roleErr)
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: `${appOrigin}/login?admin_confirmed=error` },
      })
    }

    // Mark promotion as confirmed
    await supabase
      .from('admin_promotions')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', promotion.id)

    // Audit log
    await supabase.rpc('write_audit_log', {
      p_event_type: 'admin_role_confirmed',
      p_table_name: 'user_roles',
      p_record_id: promotion.user_id,
      p_user_id: promotion.user_id,
      p_changed_fields: ['role:admin'],
    })

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: `${appOrigin}/login?admin_confirmed=true` },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
