import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Tech Fleet Network"

interface AdminMemberAlertProps {
  adminFirstName?: string
  alertTitle?: string
  alertBodyHtml?: string
  alertBodyText?: string
  ctaLabel?: string
  ctaUrl?: string
}

const AdminMemberAlertEmail = ({
  adminFirstName,
  alertTitle = 'A member updated their project status',
  alertBodyHtml,
  alertBodyText,
  ctaLabel = 'Open Recruiting Center',
  ctaUrl = 'https://techfleet.network/admin/roster',
}: AdminMemberAlertProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{alertTitle}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={brandTag}>TECH FLEET NETWORK · ADMIN ALERT</Text>
        </Section>

        <Heading style={h1}>{alertTitle}</Heading>

        <Text style={text}>Hi {adminFirstName || 'there'},</Text>

        {alertBodyText && !alertBodyHtml && (
          <Text style={text}>{alertBodyText}</Text>
        )}
        {alertBodyHtml && (
          <Section
            style={text}
            // Body is server-rendered from trusted edge function (already escaped).
            dangerouslySetInnerHTML={{ __html: alertBodyHtml }}
          />
        )}

        <Section style={ctaSection}>
          <Button style={ctaButton} href={ctaUrl}>{ctaLabel}</Button>
        </Section>

        <Hr style={hr} />

        <Text style={footer}>
          You are receiving this because you are an administrator on {SITE_NAME}.
          Member-driven project status alerts are always emailed so they do not
          get lost.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminMemberAlertEmail,
  subject: (data: Record<string, any>) =>
    data?.alertTitle || 'New project status update from a member',
  displayName: 'Admin alert — member status update',
  previewData: {
    adminFirstName: 'Morgan',
    alertTitle: '📅 Interview Scheduled — Jane Doe',
    alertBodyHtml: '<p><strong>Jane Doe</strong> has indicated they have scheduled their interview for the <strong>Acme Nonprofit</strong> project.</p>',
    ctaLabel: 'Open Recruiting Center',
    ctaUrl: 'https://techfleet.network/admin/roster',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '12px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 20px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const ctaSection = { textAlign: 'center' as const, margin: '28px 0' }
const ctaButton = { backgroundColor: '#0056A7', borderRadius: '6px', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, padding: '12px 28px', textDecoration: 'none' }
const hr = { borderColor: '#e4e4e7', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#6b7280', lineHeight: '1.6', margin: '0' }
