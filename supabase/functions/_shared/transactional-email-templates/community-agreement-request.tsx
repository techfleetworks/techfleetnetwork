import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Tech Fleet Network'

interface CommunityAgreementProps {
  firstName?: string
  projectName?: string
  clientName?: string
  agreementUrl?: string
}

const CommunityAgreementRequestEmail = ({
  firstName,
  projectName,
  clientName,
  agreementUrl,
}: CommunityAgreementProps) => {
  const project = projectName || 'your project'
  const client = clientName || 'a nonprofit client'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Review and agree to the Community Contributor Terms</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <Text style={brandTag}>TECH FLEET NETWORK</Text>
          </Section>

          <Heading style={h1}>Congratulations, you've been selected!</Heading>

          <Text style={text}>
            Hi {firstName || 'there'},
          </Text>

          <Text style={text}>
            You have been selected to be a part of <strong>{project}</strong> with the
            nonprofit client <strong>{client}</strong>.
          </Text>

          <Text style={text}>
            Before you begin your team training, you need to review and agree to the
            Community Terms and Conditions for trainees. Click below to review and agree.
          </Text>

          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={agreementUrl || 'https://techfleet.network/dashboard'} style={button}>
              Review and agree
            </Button>
          </Section>

          <Text style={signature}>
            The Tech Fleet team
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CommunityAgreementRequestEmail,
  subject: ((data: Record<string, any>) =>
    `Sign your Community Contributor Terms to start on ${data?.projectName || 'your Tech Fleet project'}`) as any,
  displayName: 'Community agreement request',
  previewData: {
    firstName: 'Jane',
    projectName: 'Atlas Redesign',
    clientName: 'Hopeful Futures',
    agreementUrl: 'https://techfleet.network/applications/projects/abc/status?agreement=open',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '13px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const button = { backgroundColor: '#0056A7', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', fontSize: '15px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const signature = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', margin: '24px 0 0' }
