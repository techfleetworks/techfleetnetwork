import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Tech Fleet Network"

interface QuestNudgeProps {
  firstName?: string
  questTitle?: string
  completedSteps?: number
  totalSteps?: number
  questUrl?: string
}

const QuestNudgeEmail = ({ firstName, questTitle, completedSteps = 0, totalSteps = 1, questUrl }: QuestNudgeProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your quest "{questTitle}" is waiting for you at {SITE_NAME}!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={brandTag}>TECH FLEET NETWORK</Text>
        </Section>

        <Heading style={h1}>Pick Back Up Your Quest 🚀</Heading>

        <Text style={text}>
          Hey {firstName || 'there'},
        </Text>

        <Text style={text}>
          We noticed you haven't made progress on <strong>{questTitle || 'your quest'}</strong> recently.
          No worries — life happens! But your journey is still here, and you're closer than you think.
        </Text>

        <Section style={progressBox}>
          <Text style={progressLabel}>YOUR PROGRESS</Text>
          <Text style={progressValue}>{completedSteps} of {totalSteps} steps completed</Text>
          <Text style={progressEncourage}>
            {completedSteps === 0
              ? "Take that first step — you've got this!"
              : `You're ${Math.round((completedSteps / totalSteps) * 100)}% there. Keep going!`
            }
          </Text>
        </Section>

        {questUrl && (
          <Section style={ctaSection}>
            <Button style={ctaButton} href={questUrl}>
              Continue Your Quest
            </Button>
          </Section>
        )}

        <Hr style={hr} />

        <Text style={text}>
          Even 15 minutes of progress adds up. Your future self will thank you.
        </Text>

        <Text style={signature}>
          The Tech Fleet Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: QuestNudgeEmail,
  subject: (data: Record<string, any>) =>
    `Your quest "${data.questTitle || 'journey'}" misses you!`,
  displayName: 'Quest re-engagement nudge',
  previewData: {
    firstName: 'Jane',
    questTitle: 'Get Real Agile Team Experience',
    completedSteps: 3,
    totalSteps: 8,
    questUrl: 'https://techfleetnetwork.lovable.app/my-journey',
  },
} satisfies TemplateEntry

// Brand styles — Tech Fleet primary blue: hsl(217 91% 60%) ≈ #3B82F6
const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '13px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 20px', textAlign: 'center' as const }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const progressBox = { backgroundColor: '#f0f9ff', borderRadius: '8px', padding: '20px', margin: '20px 0', textAlign: 'center' as const, border: '1px solid #bfdbfe' }
const progressLabel = { fontSize: '11px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 4px' }
const progressValue = { fontSize: '20px', fontWeight: '700' as const, color: '#3B82F6', margin: '0 0 8px' }
const progressEncourage = { fontSize: '14px', color: '#3f3f46', margin: '0' }
const ctaSection = { textAlign: 'center' as const, margin: '24px 0' }
const ctaButton = { backgroundColor: '#3B82F6', borderRadius: '6px', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, padding: '12px 28px', textDecoration: 'none' }
const hr = { borderColor: '#e4e4e7', margin: '24px 0' }
const signature = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', margin: '0' }
