import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Tech Fleet Network"
const BASE_URL = "https://techfleet.network"

interface ObserverRoleGrantedProps {
  firstName?: string
}

const ObserverRoleGrantedEmail = ({ firstName }: ObserverRoleGrantedProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're an Observer — your Discord roles are active 🎉</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={brandTag}>TECH FLEET NETWORK</Text>
        </Section>

        <Heading style={h1}>You're an Observer! 🎉</Heading>

        <Text style={text}>Hey {firstName || 'there'},</Text>

        <Text style={text}>
          Your <strong>Projects</strong> and <strong>Observers</strong> Discord roles are now active.
          You can hop into project channels and join live meetings as an observer.
        </Text>

        <Section style={stepsBox}>
          <Text style={stepsLabel}>WHAT TO DO NEXT</Text>

          <Text style={stepTitle}>1. Pick a project meeting</Text>
          <Text style={stepBody}>
            Browse upcoming Tech Fleet project meetings on the Events Calendar in the platform.
          </Text>
          <Section style={ctaSection}>
            <Button style={ctaButton} href={`${BASE_URL}/events`}>Open Events Calendar</Button>
          </Section>

          <Hr style={innerHr} />

          <Text style={stepTitle}>2. Explore project Discord channels</Text>
          <Text style={stepBody}>
            Visit the Tech Fleet Discord and check out the project channels to see what each team is working on.
          </Text>

          <Hr style={innerHr} />

          <Text style={stepTitle}>3. Watch for daily alerts</Text>
          <Text style={stepBody}>
            New posts in <strong>#calling-all-observers</strong> ping you each day with meetings to join.
          </Text>
        </Section>

        <Hr style={hr} />
        <Text style={signature}>The Tech Fleet Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ObserverRoleGrantedEmail,
  subject: "You're an Observer — your Discord roles are active 🎉",
  displayName: 'Observer role granted',
  previewData: { firstName: 'Jane' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '13px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 20px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const stepsBox = { backgroundColor: '#f0f9ff', borderRadius: '8px', padding: '20px 22px', margin: '20px 0', border: '1px solid #bfdbfe' }
const stepsLabel = { fontSize: '11px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 12px' }
const stepTitle = { fontSize: '15px', fontWeight: '700' as const, color: '#18181b', margin: '8px 0 4px' }
const stepBody = { fontSize: '14px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 8px' }
const ctaSection = { textAlign: 'center' as const, margin: '12px 0 4px' }
const ctaButton = { backgroundColor: '#3B82F6', borderRadius: '6px', color: '#ffffff', fontSize: '14px', fontWeight: '600' as const, padding: '10px 22px', textDecoration: 'none' }
const innerHr = { borderColor: '#bfdbfe', margin: '14px 0' }
const hr = { borderColor: '#e4e4e7', margin: '24px 0' }
const signature = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', margin: '0' }
