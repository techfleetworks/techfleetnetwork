import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Link, Hr, Section, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface StatusChangeProps {
  firstName?: string
  statusLabel?: string
  statusMessage?: string
  projectName?: string
  ctaUrl?: string
  ctaLabel?: string
}

const StatusChangeEmail = ({
  firstName,
  statusLabel,
  statusMessage,
  projectName,
  ctaUrl,
  ctaLabel,
}: StatusChangeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your application status has been updated${projectName ? ` for ${projectName}` : ''}.`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={brandTag}>TECH FLEET NETWORK</Text>
        </Section>

        <Heading style={h1}>Application Status Update</Heading>

        <Text style={text}>Hello {firstName || 'there'},</Text>

        <Text style={text}>
          {projectName
            ? <>Your application for <strong>{projectName}</strong> has been updated.</>
            : <>Your application status has been updated.</>}
        </Text>

        {statusLabel ? (
          <Section style={statusBox}>
            <Text style={statusLabelStyle}>NEW STATUS</Text>
            <Text style={statusValueStyle}>{statusLabel}</Text>
          </Section>
        ) : null}

        {statusMessage ? <Text style={text}>{statusMessage}</Text> : null}

        {ctaUrl ? (
          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            <Button href={ctaUrl} style={button}>
              {ctaLabel || 'View Application'}
            </Button>
          </Section>
        ) : null}

        <Hr style={hr} />

        <Text style={text}>
          Need help? Email us at{' '}
          <Link href="mailto:info@techfleet.org" style={link}>info@techfleet.org</Link>.
        </Text>

        <Text style={signature}>The Tech Fleet Network Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: StatusChangeEmail,
  subject: (data: Record<string, any>) => {
    const project = data?.projectName ? ` — ${data.projectName}` : ''
    const status = data?.statusLabel ? `: ${data.statusLabel}` : ''
    return `Application Status Update${project}${status}`
  },
  displayName: 'Applicant Status Change',
  previewData: {
    firstName: 'Jane',
    statusLabel: 'Not Selected',
    statusMessage:
      'Thank you for applying. Unfortunately, you were not selected for this project at this time. We encourage you to apply to future projects!',
    projectName: 'Acme — Discovery Sprint',
    ctaUrl: 'https://techfleetnetwork.lovable.app/applications',
    ctaLabel: 'View Your Applications',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '13px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const statusBox = { backgroundColor: '#f4f4f5', borderLeft: '4px solid #3B82F6', padding: '16px 20px', borderRadius: '4px', margin: '20px 0' }
const statusLabelStyle = { fontSize: '11px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 4px' }
const statusValueStyle = { fontSize: '18px', fontWeight: '700' as const, color: '#18181b', margin: '0' }
const button = { backgroundColor: '#3B82F6', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '15px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const link = { color: '#3B82F6', textDecoration: 'underline' }
const hr = { borderColor: '#e4e4e7', margin: '24px 0' }
const signature = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', margin: '0' }
