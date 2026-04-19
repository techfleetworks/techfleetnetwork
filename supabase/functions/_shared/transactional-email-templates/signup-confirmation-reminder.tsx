import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Tech Fleet Network"

interface SignupConfirmationReminderProps {
  confirmationUrl?: string
  hoursAgo?: number
}

const SignupConfirmationReminderEmail = ({
  confirmationUrl,
  hoursAgo = 48,
}: SignupConfirmationReminderProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your {SITE_NAME} account — your link is ready</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={brandTag}>TECH FLEET NETWORK</Text>
        </Section>

        <Heading style={h1}>One quick step to finish setup ✉️</Heading>

        <Text style={text}>Hi there,</Text>

        <Text style={text}>
          You started creating a {SITE_NAME} account about {hoursAgo} hours ago, but we never
          saw the email get confirmed. No worries — that link may have been missed or expired.
          Here's a fresh one so you can pick up right where you left off.
        </Text>

        {confirmationUrl && (
          <Section style={ctaSection}>
            <Button style={ctaButton} href={confirmationUrl}>
              Confirm my email
            </Button>
          </Section>
        )}

        <Text style={smallText}>
          This link is valid for the next 24 hours. If the button doesn't work, copy and paste
          this URL into your browser:
        </Text>
        {confirmationUrl && (
          <Text style={urlText}>{confirmationUrl}</Text>
        )}

        <Hr style={hr} />

        <Text style={text}>
          Didn't sign up for {SITE_NAME}? You can safely ignore this email — no account will
          be created without confirmation.
        </Text>

        <Text style={signature}>The Tech Fleet Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SignupConfirmationReminderEmail,
  subject: `Reminder: confirm your ${SITE_NAME} account`,
  displayName: 'Signup confirmation reminder',
  previewData: {
    confirmationUrl: 'https://techfleetnetwork.lovable.app/confirm?token=sample',
    hoursAgo: 48,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '13px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 20px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const smallText = { fontSize: '13px', color: '#6b7280', lineHeight: '1.6', margin: '16px 0 8px' }
const urlText = { fontSize: '12px', color: '#3B82F6', wordBreak: 'break-all' as const, margin: '0 0 16px' }
const ctaSection = { textAlign: 'center' as const, margin: '28px 0' }
const ctaButton = { backgroundColor: '#3B82F6', borderRadius: '6px', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, padding: '12px 28px', textDecoration: 'none' }
const hr = { borderColor: '#e4e4e7', margin: '24px 0' }
const signature = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', margin: '0' }
