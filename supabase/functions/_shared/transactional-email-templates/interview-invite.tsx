import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Link, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Tech Fleet Network"

interface InterviewInviteProps {
  firstName?: string
  coordinatorName?: string
  schedulingUrl?: string
}

const InterviewInviteEmail = ({ firstName, coordinatorName, schedulingUrl }: InterviewInviteProps) => (
  <Html lang="en" dir="ltr">
    <Head />
      <Preview>You're invited to interview for a Tech Fleet project</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={brandTag}>TECH FLEET NETWORK</Text>
        </Section>

        <Heading style={h1}>You're invited to interview</Heading>

        <Text style={text}>
          Hi {firstName || 'there'},
        </Text>

        <Text style={text}>
          Great news —{' '}
          <strong>{coordinatorName || 'a Tech Fleet project coordinator'}</strong>{' '}
          would like to interview you for a project.
        </Text>

        <Text style={subheading}>Here's what to do next</Text>

        <Text style={listItem}>
          <strong>1.</strong> Pick a time that works for you using the coordinator's{' '}
          <Link href={schedulingUrl || '#'} style={link}>scheduling link</Link>.
        </Text>

        <Text style={listItem}>
          <strong>2.</strong> Prep with our{' '}
          <Link href="https://guide.techfleet.org/team-portal/new-teammate-handbook/project-training-teams/applying-to-tech-fleet-project-training/interview-guide-for-tech-fleet-project-training/teammate-interview-guide-for-project-coordinators" style={link}>
            teammate interview guide
          </Link>{' '}
          so you walk in feeling ready.
        </Text>

        <Text style={listItem}>
          <strong>3.</strong> After your interview, we'll follow up by email and in Tech Fleet Network with your next steps.
        </Text>

        <Hr style={hr} />

        <Text style={text}>
          Need a hand? Email{' '}
          <Link href="mailto:info@techfleet.org" style={link}>info@techfleet.org</Link>{' '}
          and we'll help.
        </Text>

        <Text style={signature}>
          The Tech Fleet project coordinator team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InterviewInviteEmail,
  subject: "You're invited to interview for a Tech Fleet project",
  displayName: 'Interview invitation',
  previewData: {
    firstName: 'Jane',
    coordinatorName: 'René Pachaux',
    schedulingUrl: 'https://calendly.com/rene-techfleet',
  },
} satisfies TemplateEntry

// Brand styles — Tech Fleet primary blue: hsl(217 91% 60%) ≈ #3B82F6
const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '13px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 20px' }
const subheading = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', lineHeight: '1.6', margin: '20px 0 12px' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const listItem = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 12px', paddingLeft: '4px' }
const link = { color: '#3B82F6', textDecoration: 'underline' }
const hr = { borderColor: '#e4e4e7', margin: '24px 0' }
const signature = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', margin: '0' }
