import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NUDGE_INTERVAL_DAYS = 7  // Don't nudge more than once per week
const INACTIVITY_THRESHOLD_DAYS = 7 // Nudge after 7 days of no progress
const APP_URL = 'https://techfleetnetwork.lovable.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const now = new Date()
  const inactivityThreshold = new Date(now.getTime() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const nudgeThreshold = new Date(now.getTime() - NUDGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  try {
    // Find active quest selections that:
    // 1. Have a started_at but no completed_at (active quest)
    // 2. Haven't been nudged in the last NUDGE_INTERVAL_DAYS days (or never nudged)
    const { data: selections, error: selErr } = await supabase
      .from('user_quest_selections')
      .select('id, user_id, path_id, last_nudged_at, started_at')
      .not('started_at', 'is', null)
      .is('completed_at', null)
      .or(`last_nudged_at.is.null,last_nudged_at.lt.${nudgeThreshold}`)

    if (selErr) {
      console.error('Error fetching quest selections:', selErr)
      return new Response(JSON.stringify({ error: selErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!selections || selections.length === 0) {
      return new Response(JSON.stringify({ nudged: 0, message: 'No inactive users to nudge' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let nudgedCount = 0

    for (const sel of selections) {
      // Check if user has made any journey progress recently
      const { data: recentProgress } = await supabase
        .from('journey_progress')
        .select('updated_at')
        .eq('user_id', sel.user_id)
        .gte('updated_at', inactivityThreshold)
        .limit(1)

      // If they have recent progress, skip nudging
      if (recentProgress && recentProgress.length > 0) continue

      // Also check self-report progress (quest-specific)
      // If they completed a self-report step recently, skip
      // (self-report completions don't go to journey_progress, they're in user_quest_selections or similar)

      // Get user profile for email + name
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, first_name, display_name, notify_announcements')
        .eq('user_id', sel.user_id)
        .single()

      if (!profile || !profile.email) continue

      // Get quest path info
      const { data: path } = await supabase
        .from('quest_paths')
        .select('title, slug')
        .eq('id', sel.path_id)
        .single()

      if (!path) continue

      // Get step completion info
      const { data: steps } = await supabase
        .from('quest_path_steps')
        .select('id')
        .eq('path_id', sel.path_id)

      const totalSteps = steps?.length ?? 0

      // Count completed journey tasks for this user that match quest steps
      const { data: completedProgress } = await supabase
        .from('journey_progress')
        .select('task_id')
        .eq('user_id', sel.user_id)
        .eq('completed', true)

      const completedCount = completedProgress?.length ?? 0

      const firstName = profile.first_name || profile.display_name || undefined
      const questUrl = `${APP_URL}/my-journey/quest/${sel.path_id}`

      // 1. Create in-app notification
      const { error: notifErr } = await supabase
        .from('notifications')
        .insert({
          user_id: sel.user_id,
          title: `Pick back up: ${path.title}`,
          body_html: `<p>You haven't made progress on <strong>${path.title}</strong> in a while. Even 15 minutes adds up — jump back in!</p>`,
          notification_type: 'quest_nudge',
          link_url: `/my-journey/quest/${sel.path_id}`,
        })

      if (notifErr) {
        console.error(`Failed to create notification for user ${sel.user_id}:`, notifErr)
      }

      // 2. Send email nudge (only if user has email notifications enabled)
      if (profile.notify_announcements) {
        try {
          await supabase.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'quest-nudge',
              recipientEmail: profile.email,
              idempotencyKey: `quest-nudge-${sel.id}-${now.toISOString().slice(0, 10)}`,
              templateData: {
                firstName,
                questTitle: path.title,
                completedSteps: completedCount,
                totalSteps,
                questUrl,
              },
            },
          })
        } catch (emailErr) {
          console.error(`Failed to send nudge email to ${profile.email}:`, emailErr)
        }
      }

      // 3. Update last_nudged_at
      await supabase
        .from('user_quest_selections')
        .update({ last_nudged_at: now.toISOString() })
        .eq('id', sel.id)

      nudgedCount++
    }

    console.log(`Quest nudge complete: ${nudgedCount} users nudged out of ${selections.length} candidates`)

    return new Response(
      JSON.stringify({ nudged: nudgedCount, candidates: selections.length }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('Quest nudge error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error processing nudges' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
