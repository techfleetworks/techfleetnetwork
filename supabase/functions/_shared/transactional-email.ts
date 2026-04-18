import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from './transactional-email-templates/registry.ts'

const SITE_NAME = 'techfleetnetwork'
const SENDER_DOMAIN = 'notify.techfleet.org'
const FROM_DOMAIN = 'techfleet.org'

type JsonRecord = Record<string, unknown>

export interface QueueTransactionalEmailInput {
  templateName: string
  recipientEmail?: string
  idempotencyKey?: string
  messageId?: string
  templateData?: JsonRecord
  supabase?: SupabaseClient
}

export type QueueTransactionalEmailResult =
  | {
      ok: true
      queued: true
      messageId: string
      suppressed: boolean
      reason?: 'email_suppressed'
    }
  | {
      ok: false
      status: number
      error: string
      messageId?: string
    }

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function getServiceSupabaseClient(existingClient?: SupabaseClient): SupabaseClient {
  if (existingClient) return existingClient

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing required environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

async function insertEmailLog(
  supabase: SupabaseClient,
  payload: {
    message_id: string
    template_name: string
    recipient_email: string
    status: string
    error_message?: string
  }
) {
  const { error } = await supabase.from('email_send_log').insert(payload)

  if (error) {
    console.error('Failed to write email log entry', {
      payload,
      error,
    })
  }
}

async function resolveUnsubscribeToken(
  supabase: SupabaseClient,
  normalizedEmail: string,
  messageId: string,
  templateName: string,
  recipientEmail: string
): Promise<
  | { ok: true; token: string }
  | { ok: true; suppressed: true }
  | { ok: false; error: string }
> {
  // Defensive: in case legacy duplicate rows exist for an email, take the
  // oldest unused row (or oldest if all used) instead of erroring on multi-row.
  const { data: tokenRows, error: tokenLookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at, created_at')
    .eq('email', normalizedEmail)
    .order('used_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(1)
  const existingToken = tokenRows && tokenRows.length > 0 ? tokenRows[0] : null

  if (tokenLookupError) {
    console.error('Token lookup failed', {
      error: tokenLookupError,
      email: normalizedEmail,
    })
    await insertEmailLog(supabase, {
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipientEmail,
      status: 'failed',
      error_message: 'Failed to look up unsubscribe token',
    })
    return { ok: false, error: 'Failed to prepare email' }
  }

  if (existingToken && !existingToken.used_at) {
    return { ok: true, token: existingToken.token }
  }

  if (!existingToken) {
    const nextToken = generateToken()
    const { error: tokenError } = await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: nextToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (tokenError) {
      console.error('Failed to create unsubscribe token', {
        error: tokenError,
      })
      await insertEmailLog(supabase, {
        message_id: messageId,
        template_name: templateName,
        recipient_email: recipientEmail,
        status: 'failed',
        error_message: 'Failed to create unsubscribe token',
      })
      return { ok: false, error: 'Failed to prepare email' }
    }

    const { data: storedRows, error: reReadError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .order('created_at', { ascending: true })
      .limit(1)
    const storedToken = storedRows && storedRows.length > 0 ? storedRows[0] : null

    if (reReadError || !storedToken) {
      console.error('Failed to read back unsubscribe token after upsert', {
        error: reReadError,
        email: normalizedEmail,
      })
      await insertEmailLog(supabase, {
        message_id: messageId,
        template_name: templateName,
        recipient_email: recipientEmail,
        status: 'failed',
        error_message: 'Failed to confirm unsubscribe token storage',
      })
      return { ok: false, error: 'Failed to prepare email' }
    }

    return { ok: true, token: storedToken.token }
  }

  console.warn('Unsubscribe token already used but email not suppressed', {
    email: normalizedEmail,
  })
  await insertEmailLog(supabase, {
    message_id: messageId,
    template_name: templateName,
    recipient_email: recipientEmail,
    status: 'suppressed',
    error_message: 'Unsubscribe token used but email missing from suppressed list',
  })

  return { ok: true, suppressed: true }
}

export async function queueTransactionalEmail({
  templateName,
  recipientEmail,
  idempotencyKey,
  messageId = crypto.randomUUID(),
  templateData = {},
  supabase: existingClient,
}: QueueTransactionalEmailInput): Promise<QueueTransactionalEmailResult> {
  let supabase: SupabaseClient

  try {
    supabase = getServiceSupabaseClient(existingClient)
  } catch (error) {
    console.error('Missing required environment variables', { error })
    return {
      ok: false,
      status: 500,
      error: 'Server configuration error',
      messageId,
    }
  }

  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return {
      ok: false,
      status: 404,
      error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      messageId,
    }
  }

  const effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return {
      ok: false,
      status: 400,
      error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      messageId,
    }
  }

  const normalizedEmail = effectiveRecipient.toLowerCase()
  const requestIdempotencyKey = idempotencyKey || messageId

  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return {
      ok: false,
      status: 500,
      error: 'Failed to verify suppression status',
      messageId,
    }
  }

  if (suppressed) {
    await insertEmailLog(supabase, {
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return {
      ok: true,
      queued: true,
      messageId,
      suppressed: true,
      reason: 'email_suppressed',
    }
  }

  const unsubscribe = await resolveUnsubscribeToken(
    supabase,
    normalizedEmail,
    messageId,
    templateName,
    effectiveRecipient
  )

  if (!unsubscribe.ok) {
    return {
      ok: false,
      status: 500,
      error: unsubscribe.error,
      messageId,
    }
  }

  if ('suppressed' in unsubscribe && unsubscribe.suppressed) {
    return {
      ok: true,
      queued: true,
      messageId,
      suppressed: true,
      reason: 'email_suppressed',
    }
  }

  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  await insertEmailLog(supabase, {
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: requestIdempotencyKey,
      unsubscribe_token: unsubscribe.token,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue email', {
      error: enqueueError,
      templateName,
      effectiveRecipient,
    })

    await insertEmailLog(supabase, {
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })

    return {
      ok: false,
      status: 500,
      error: 'Failed to enqueue email',
      messageId,
    }
  }

  console.log('Transactional email enqueued', {
    templateName,
    effectiveRecipient,
    messageId,
  })

  return {
    ok: true,
    queued: true,
    messageId,
    suppressed: false,
  }
}