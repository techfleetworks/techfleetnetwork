/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as interviewInvite } from './interview-invite.tsx'
import { template as questNudge } from './quest-nudge.tsx'
import { template as applicantStatusChange } from './applicant-status-change.tsx'
import { template as signupConfirmationReminder } from './signup-confirmation-reminder.tsx'
import { template as fleetyCoachDigest } from './fleety-coach-digest.tsx'
import { template as triageDigest } from './triage-digest.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'interview-invite': interviewInvite,
  'quest-nudge': questNudge,
  'applicant-status-change': applicantStatusChange,
  'signup-confirmation-reminder': signupConfirmationReminder,
  'fleety-coach-digest': fleetyCoachDigest,
  'triage-digest': triageDigest,
}
