import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface GapItem { question: string; count: number }
interface DraftItem { title: string; slug: string }

interface Props {
  firstName?: string
  weekRange?: string
  totalTurns?: number
  thumbsUp?: number
  thumbsDown?: number
  practicalScore?: number | null
  gaps?: GapItem[]
  drafts?: DraftItem[]
  adminUrl?: string
}

const FleetyCoachDigest = ({
  firstName,
  weekRange = 'this week',
  totalTurns = 0,
  thumbsUp = 0,
  thumbsDown = 0,
  practicalScore,
  gaps = [],
  drafts = [],
  adminUrl = 'https://techfleet.network/admin/system-health',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Fleety Coach: ${gaps.length} gaps, ${drafts.length} drafts to review`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={brandTag}>TECH FLEET NETWORK · FLEETY COACH</Text>
        </Section>

        <Heading style={h1}>Fleety weekly digest</Heading>
        <Text style={text}>Hey {firstName || 'there'}, here's how Fleety performed for {weekRange}.</Text>

        <Section style={statRow}>
          <Stat label="Turns" value={String(totalTurns)} />
          <Stat label="👍" value={String(thumbsUp)} />
          <Stat label="👎" value={String(thumbsDown)} />
          <Stat label="Practical" value={practicalScore != null ? practicalScore.toFixed(2) : '—'} />
        </Section>

        <Hr style={hr} />

        <Heading style={h2}>Top playbook gaps</Heading>
        {gaps.length === 0 ? (
          <Text style={muted}>No notable gaps this week. 🎉</Text>
        ) : (
          gaps.slice(0, 5).map((g, i) => (
            <Text key={i} style={listItem}>
              <strong>{g.count}×</strong> {g.question}
            </Text>
          ))
        )}

        <Heading style={h2}>Drafts awaiting review</Heading>
        {drafts.length === 0 ? (
          <Text style={muted}>No auto-drafted playbooks pending.</Text>
        ) : (
          drafts.slice(0, 5).map((d, i) => (
            <Text key={i} style={listItem}>• {d.title}</Text>
          ))
        )}

        <Section style={ctaSection}>
          <Button style={ctaButton} href={adminUrl}>Open Fleety Coach</Button>
        </Section>

        <Hr style={hr} />
        <Text style={signature}>The Tech Fleet Team</Text>
      </Container>
    </Body>
  </Html>
)

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Section style={statBox}>
      <Text style={statLabel}>{label}</Text>
      <Text style={statValue}>{value}</Text>
    </Section>
  )
}

export const template = {
  component: FleetyCoachDigest,
  subject: (data: Record<string, any>) =>
    `Fleety Coach digest — ${data.gaps?.length ?? 0} gaps, ${data.drafts?.length ?? 0} drafts`,
  displayName: 'Fleety Coach weekly digest',
  previewData: {
    firstName: 'Admin',
    weekRange: 'Apr 26 – May 3',
    totalTurns: 124,
    thumbsUp: 18,
    thumbsDown: 3,
    practicalScore: 0.72,
    gaps: [
      { question: 'how do I write my first stakeholder interview script', count: 6 },
      { question: 'what should my MVP scope look like', count: 4 },
    ],
    drafts: [
      { title: 'Draft a stakeholder interview script', slug: 'draft-stakeholder-interview' },
    ],
    adminUrl: 'https://techfleet.network/admin/system-health',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '13px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 12px', textAlign: 'center' as const }
const h2 = { fontSize: '16px', fontWeight: '700' as const, color: '#18181b', margin: '20px 0 8px' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const muted = { fontSize: '14px', color: '#6b7280', margin: '0 0 8px' }
const listItem = { fontSize: '14px', color: '#3f3f46', margin: '0 0 6px', lineHeight: '1.5' }
const statRow = { display: 'flex' as const, gap: '8px', justifyContent: 'space-between' as const, margin: '12px 0' }
const statBox = { backgroundColor: '#f0f9ff', borderRadius: '8px', padding: '12px', textAlign: 'center' as const, border: '1px solid #bfdbfe', flex: '1 1 0' }
const statLabel = { fontSize: '11px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, margin: '0 0 4px' }
const statValue = { fontSize: '18px', fontWeight: '700' as const, color: '#3B82F6', margin: '0' }
const ctaSection = { textAlign: 'center' as const, margin: '24px 0' }
const ctaButton = { backgroundColor: '#3B82F6', borderRadius: '6px', color: '#ffffff', fontSize: '15px', fontWeight: '600' as const, padding: '12px 28px', textDecoration: 'none' }
const hr = { borderColor: '#e4e4e7', margin: '24px 0' }
const signature = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', margin: '0' }
