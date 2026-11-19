// @edge-cron
// Public, unauthenticated read-only LIST feed of published classes + their open
// cohorts (public-access A6). Runs under the SERVICE ROLE — anon has no table
// grants after the REVOKE — and serves the §6 anon field set (validated by the A7
// allowlist guard), with CORS + edge cache headers. Groundwork for the platform's
// own public classes list (Framer is being retired).

import { getAdminClient } from "../_shared/admin-client.ts";

import { withAuditWrapper } from "../_shared/audit.ts";
const ALLOWED_ORIGINS = new Set([
  'https://www.techfleet.network',
  'https://techfleet.network',
  'https://techfleet.org',
  'https://www.techfleet.org',
  'https://framer.com',
  'https://framer.app',
  'https://framercanvas.com',
])

function corsFor(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : '*'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  }
}

Deno.serve(withAuditWrapper("public-classes", async (req) => {
  const origin = req.headers.get('Origin')
  const cors = corsFor(origin)

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  try {
    const url = new URL(req.url)
    const trackParam = url.searchParams.get('track')
    const validTracks = new Set(['basic_training', 'advanced_training'])
    const track = trackParam && validTracks.has(trackParam) ? trackParam : null

    // Service-role client (anon has no grants after the A6 REVOKE). §6-compliant
    // anon select: no owner_user_id, and cohorts reduced to label/dates/
    // registration_url (status/capacity/timezone are authed-only, not in an anon
    // feed). The A7 guard validates these columns are within the anon allowlist.
    const supabase = getAdminClient()

    let q = supabase
      .from('classes')
      .select(`
        id, slug, title, summary, description, track, hero_image_url,
        outcomes, skills, prerequisites, published_at,
        cohorts:cohorts!inner(id, label, start_date, end_date, registration_url)
      `)
      .eq('status', 'published')
      .eq('cohorts.status', 'published')
      .gte('cohorts.end_date', new Date().toISOString().slice(0, 10))
      .order('published_at', { ascending: false })

    if (track) q = q.eq('track', track)

    const { data, error } = await q
    if (error) {
      console.error('public-classes query error:', error)
      return new Response(JSON.stringify({ error: 'Failed to load classes' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const classes = (data ?? []).map((c: any) => ({
      ...c,
      cohorts: (c.cohorts ?? []).sort(
        (a: any, b: any) => (a.start_date || '').localeCompare(b.start_date || ''),
      ),
    }))

    return new Response(
      JSON.stringify({ generated_at: new Date().toISOString(), count: classes.length, classes }),
      {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          // Edge cache 60s, allow stale for a day while revalidating
          'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=86400',
        },
      },
    )
  } catch (err) {
    console.error('public-classes unexpected:', err)
    return new Response(JSON.stringify({ error: 'Unexpected error' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
}))
