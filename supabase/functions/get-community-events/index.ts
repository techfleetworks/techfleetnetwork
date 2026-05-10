/**
 * get-community-events
 *
 * Public endpoint that fetches the Tech Fleet community Google Calendar's
 * public iCal feed, parses VEVENT blocks, expands simple RRULEs for the
 * requested window, and returns clean JSON for the frontend to render.
 *
 * Public on purpose: the underlying calendar is already public. We still
 * apply WAF, validate inputs, rate-limit per IP, and return a 10-min
 * Cache-Control header.
 */
import { z } from "npm:zod@3.23.8";
import { applyWaf } from "../_shared/waf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ICAL_URL =
  "https://calendar.google.com/calendar/ical/techfleetnetwork%40gmail.com/public/basic.ics";

const QuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(60).default(60),
});

// ─── In-memory cache + rate limit ────────────────────────────────────
type CacheEntry = { at: number; payload: unknown };
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

const RL_WINDOW_MS = 60 * 60 * 1000;
const RL_LIMIT = 60;
const rl = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rl.get(ip);
  if (!entry || entry.reset < now) {
    rl.set(ip, { count: 1, reset: now + RL_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RL_LIMIT;
}

// ─── ICS parsing ─────────────────────────────────────────────────────

interface ParsedEvent {
  uid: string;
  title: string;
  startUtc: string; // ISO
  endUtc: string;   // ISO
  allDay: boolean;
  description: string;
  location: string;
  url: string;
  organizerEmail: string;
}

/** Unfold RFC 5545 line continuations (lines starting with space/tab). */
function unfoldIcs(raw: string): string[] {
  const rawLines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeIcsText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Parse `YYYYMMDDTHHmmssZ` or floating `YYYYMMDDTHHmmss` or all-day `YYYYMMDD`. */
function parseIcsDate(value: string, params: Record<string, string>): { date: Date; allDay: boolean } {
  const isAllDay = params.VALUE === "DATE" || /^\d{8}$/.test(value);
  if (isAllDay) {
    const y = +value.slice(0, 4);
    const m = +value.slice(4, 6) - 1;
    const d = +value.slice(6, 8);
    return { date: new Date(Date.UTC(y, m, d)), allDay: true };
  }
  const y = +value.slice(0, 4);
  const mo = +value.slice(4, 6) - 1;
  const d = +value.slice(6, 8);
  const h = +value.slice(9, 11);
  const mi = +value.slice(11, 13);
  const s = +value.slice(13, 15);
  if (value.endsWith("Z")) {
    return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), allDay: false };
  }
  // Floating local time — best-effort: treat as UTC. Most Google feeds
  // emit Z-terminated UTC, so this branch is rare.
  return { date: new Date(Date.UTC(y, mo, d, h, mi, s)), allDay: false };
}

function splitParams(key: string): { name: string; params: Record<string, string> } {
  const [name, ...paramParts] = key.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).toUpperCase();
  }
  return { name: name.toUpperCase(), params };
}

interface RawVEvent {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  url?: string;
  organizerEmail?: string;
  start?: { date: Date; allDay: boolean };
  end?: { date: Date; allDay: boolean };
  rrule?: Record<string, string>;
  exdates?: Date[];
}

function parseVEvents(ics: string): RawVEvent[] {
  const lines = unfoldIcs(ics);
  const events: RawVEvent[] = [];
  let cur: RawVEvent | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { exdates: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const { name, params } = splitParams(left);
    switch (name) {
      case "UID":
        cur.uid = value;
        break;
      case "SUMMARY":
        cur.summary = unescapeIcsText(value);
        break;
      case "DESCRIPTION":
        cur.description = unescapeIcsText(value);
        break;
      case "LOCATION":
        cur.location = unescapeIcsText(value);
        break;
      case "URL":
        cur.url = value;
        break;
      case "ORGANIZER": {
        // value is like "mailto:foo@bar.com" possibly with CN= param
        const m = /mailto:([^\s;]+)/i.exec(value);
        if (m) cur.organizerEmail = m[1];
        break;
      }
      case "DTSTART":
        cur.start = parseIcsDate(value, params);
        break;
      case "DTEND":
        cur.end = parseIcsDate(value, params);
        break;
      case "RRULE": {
        const rule: Record<string, string> = {};
        for (const part of value.split(";")) {
          const [k, v] = part.split("=");
          if (k && v) rule[k.toUpperCase()] = v;
        }
        cur.rrule = rule;
        break;
      }
      case "EXDATE": {
        const parts = value.split(",");
        for (const p of parts) {
          cur.exdates!.push(parseIcsDate(p, params).date);
        }
        break;
      }
    }
  }
  return events;
}

/** Expand a recurring event into instances within [windowStart, windowEnd]. */
function expandOccurrences(ev: RawVEvent, windowStart: Date, windowEnd: Date): Array<{ start: Date; end: Date }> {
  if (!ev.start) return [];
  const start = ev.start.date;
  const end = ev.end?.date ?? new Date(start.getTime() + 60 * 60 * 1000);
  const duration = end.getTime() - start.getTime();

  if (!ev.rrule) {
    if (end < windowStart || start > windowEnd) return [];
    return [{ start, end }];
  }

  const freq = ev.rrule.FREQ;
  const interval = parseInt(ev.rrule.INTERVAL ?? "1", 10) || 1;
  const count = ev.rrule.COUNT ? parseInt(ev.rrule.COUNT, 10) : Infinity;
  let until: Date | null = null;
  if (ev.rrule.UNTIL) {
    until = parseIcsDate(ev.rrule.UNTIL, ev.rrule.UNTIL.length === 8 ? { VALUE: "DATE" } : {}).date;
  }
  const byday = ev.rrule.BYDAY ? ev.rrule.BYDAY.split(",") : null;
  const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const exdateSet = new Set((ev.exdates ?? []).map((d) => d.getTime()));

  const out: Array<{ start: Date; end: Date }> = [];
  const stepMs: Record<string, number> = {
    DAILY: 24 * 60 * 60 * 1000,
    WEEKLY: 7 * 24 * 60 * 60 * 1000,
  };

  // Hard safety cap to keep the endpoint cheap.
  const MAX_INSTANCES = 200;

  if (freq === "DAILY" || freq === "WEEKLY") {
    let occurrencesEmitted = 0;
    let cursor = new Date(start.getTime());
    let iterations = 0;
    while (
      cursor <= windowEnd &&
      occurrencesEmitted < count &&
      out.length < MAX_INSTANCES &&
      iterations < 5000
    ) {
      iterations++;
      if (until && cursor > until) break;
      const candidates: Date[] = [];
      if (freq === "WEEKLY" && byday) {
        // Emit each BYDAY in this week
        const weekStart = new Date(cursor.getTime());
        weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday
        for (const code of byday) {
          const dayCode = code.replace(/^[+\-\d]+/, "");
          const wd = dayMap[dayCode];
          if (wd === undefined) continue;
          const inst = new Date(weekStart.getTime());
          inst.setUTCDate(weekStart.getUTCDate() + wd);
          inst.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), 0);
          if (inst >= start) candidates.push(inst);
        }
      } else {
        candidates.push(new Date(cursor.getTime()));
      }
      for (const c of candidates) {
        if (until && c > until) continue;
        if (exdateSet.has(c.getTime())) continue;
        if (occurrencesEmitted >= count) break;
        occurrencesEmitted++;
        const cEnd = new Date(c.getTime() + duration);
        if (cEnd >= windowStart && c <= windowEnd) {
          out.push({ start: c, end: cEnd });
        }
      }
      cursor = new Date(cursor.getTime() + stepMs[freq] * interval);
    }
  } else if (freq === "MONTHLY" || freq === "YEARLY") {
    let occurrencesEmitted = 0;
    const cursor = new Date(start.getTime());
    let iterations = 0;
    while (cursor <= windowEnd && occurrencesEmitted < count && out.length < MAX_INSTANCES && iterations < 200) {
      iterations++;
      if (until && cursor > until) break;
      if (cursor >= start && !exdateSet.has(cursor.getTime())) {
        const cEnd = new Date(cursor.getTime() + duration);
        if (cEnd >= windowStart && cursor <= windowEnd) {
          out.push({ start: new Date(cursor.getTime()), end: cEnd });
        }
        occurrencesEmitted++;
      }
      if (freq === "MONTHLY") {
        cursor.setUTCMonth(cursor.getUTCMonth() + interval);
      } else {
        cursor.setUTCFullYear(cursor.getUTCFullYear() + interval);
      }
    }
  } else {
    // Unsupported FREQ — just emit the master event if it's in window.
    if (end >= windowStart && start <= windowEnd) out.push({ start, end });
  }

  return out;
}

async function fetchAndParse(windowDays: number): Promise<ParsedEvent[]> {
  const cacheKey = `events:${windowDays}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.payload as ParsedEvent[];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(ICAL_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "TechFleetNetwork/1.0 (+events)" },
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`ICS fetch failed ${res.status}`);
  }
  const text = await res.text();
  const raw = parseVEvents(text);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const out: ParsedEvent[] = [];
  for (const ev of raw) {
    if (!ev.start || !ev.uid) continue;
    const occurrences = expandOccurrences(ev, now, windowEnd);
    for (const occ of occurrences) {
      if (occ.end < now) continue;
      out.push({
        uid: `${ev.uid}@${occ.start.toISOString()}`,
        title: ev.summary?.trim() || "Untitled event",
        startUtc: occ.start.toISOString(),
        endUtc: occ.end.toISOString(),
        allDay: ev.start.allDay,
        description: ev.description ?? "",
        location: ev.location ?? "",
        url: ev.url ?? "",
        organizerEmail: ev.organizerEmail ?? "",
      });
    }
  }

  out.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  // Dedupe near-duplicate occurrences (same uid+start).
  const seen = new Set<string>();
  const deduped = out.filter((e) => {
    if (seen.has(e.uid)) return false;
    seen.add(e.uid);
    return true;
  });

  cache.set(cacheKey, { at: Date.now(), payload: deduped });
  return deduped;
}

// ─── Handler ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const blocked = await applyWaf(req, "get-community-events");
  if (blocked) return blocked;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ windowDays: url.searchParams.get("windowDays") ?? undefined });
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid windowDays" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const events = await fetchAndParse(parsed.data.windowDays);
    return new Response(JSON.stringify({ events }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (err) {
    console.error("get-community-events error:", err);
    // Serve stale cache on failure if available
    const stale = cache.get(`events:${parsed.data.windowDays}`);
    if (stale) {
      return new Response(JSON.stringify({ events: stale.payload, stale: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Failed to load events" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
