import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface QueueItem { event_type: string; source: string; occurrence_count: number; status: string }

interface Props {
  firstName?: string
  date?: string
  pendingCount?: number
  proposedCount?: number
  resolvedYesterday?: number
  auditPressure?: 'none' | 'soft' | 'medium' | 'hard'
  audit24hCount?: number
  topItems?: QueueItem[]
  triageBudgetUsed?: number
  triageBudgetCap?: number
  adminUrl?: string
  planMarkdown?: string
}

const TriageDigest = ({
  firstName,
  date = 'today',
  pendingCount = 0,
  proposedCount = 0,
  resolvedYesterday = 0,
  auditPressure = 'none',
  audit24hCount = 0,
  topItems = [],
  triageBudgetUsed = 0,
  triageBudgetCap = 20,
  adminUrl = 'https://techfleet.network/admin/system-health?tab=triage',
  planMarkdown = '',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Triage digest — ${pendingCount} pending, ${proposedCount} ready to apply`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={brandTag}>TECH FLEET NETWORK · ERROR TRIAGE</Text>
        </Section>

        <Heading style={h1}>Daily error triage digest</Heading>
        <Text style={text}>Hey {firstName || 'there'}, here's the platform error picture for {date}.</Text>

        <Section style={statRow}>
          <Stat label="Pending" value={String(pendingCount)} />
          <Stat label="Proposed" value={String(proposedCount)} />
          <Stat label="Resolved 24h" value={String(resolvedYesterday)} />
          <Stat label="Pressure" value={auditPressure} />
        </Section>

        <Hr style={hr} />

        <Heading style={h2}>Top open errors</Heading>
        {topItems.length === 0 ? (
          <Text style={muted}>Nothing in the queue. 🎉</Text>
        ) : (
          topItems.slice(0, 8).map((it, i) => (
            <Text key={i} style={listItem}>
              <strong>{it.occurrence_count}×</strong> {it.event_type}
              <span style={dim}> · {it.source.slice(0, 80)} · {it.status}</span>
            </Text>
          ))
        )}

        <Hr style={hr} />
        <Text style={muted}>
          Audit log volume (24h): {audit24hCount.toLocaleString()} rows · AI triage budget: {triageBudgetUsed}/{triageBudgetCap}
        </Text>

        <Section style={ctaSection}>
          <Button style={ctaButton} href={adminUrl}>Open Triage queue</Button>
        </Section>

        {planMarkdown ? (
          <>
            <Hr style={hr} />
            <Heading style={h2}>Full plan (markdown)</Heading>
            <Text style={muted}>Copy/paste into Notion, Obsidian, or your tracker.</Text>
            <pre style={planPre}>{planMarkdown}</pre>
          </>
        ) : null}

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

export const template: TemplateEntry = {
  component: TriageDigest,
  subject: (data: Record<string, any>) =>
    `Triage digest — ${data.pendingCount ?? 0} pending, ${data.proposedCount ?? 0} ready to apply`,
  displayName: 'Daily error triage digest',
  previewData: {
    firstName: 'Admin',
    date: 'May 5, 2026',
    pendingCount: 4,
    proposedCount: 2,
    resolvedYesterday: 3,
    auditPressure: 'none',
    audit24hCount: 612,
    topItems: [
      { event_type: 'client_error', source: 'CourseList.tsx:142', occurrence_count: 18, status: 'proposed' },
      { event_type: 'edge_function_error', source: 'process-email-queue', occurrence_count: 5, status: 'pending' },
    ],
    triageBudgetUsed: 6,
    triageBudgetCap: 20,
  },
}

const main: React.CSSProperties = { backgroundColor: '#0F172A', fontFamily: 'Inter, system-ui, sans-serif', color: '#E2E8F0', margin: 0, padding: 0 }
const container: React.CSSProperties = { maxWidth: 640, margin: '0 auto', padding: '32px 24px' }
const headerSection: React.CSSProperties = { paddingBottom: 12 }
const brandTag: React.CSSProperties = { fontSize: 11, letterSpacing: 1.5, color: '#3B82F6', margin: 0 }
const h1: React.CSSProperties = { fontSize: 26, color: '#FFFFFF', margin: '8px 0 16px' }
const h2: React.CSSProperties = { fontSize: 16, color: '#FFFFFF', margin: '24px 0 8px' }
const text: React.CSSProperties = { fontSize: 14, lineHeight: 1.6, color: '#CBD5E1', margin: '0 0 12px' }
const muted: React.CSSProperties = { fontSize: 12, color: '#94A3B8', margin: '6px 0' }
const listItem: React.CSSProperties = { fontSize: 13, color: '#E2E8F0', margin: '4px 0' }
const dim: React.CSSProperties = { color: '#94A3B8' }
const hr: React.CSSProperties = { borderColor: '#1E293B', margin: '20px 0' }
const statRow: React.CSSProperties = { display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }
const statBox: React.CSSProperties = { padding: '12px 14px', backgroundColor: '#111827', borderRadius: 8, flex: 1, minWidth: 110 }
const statLabel: React.CSSProperties = { fontSize: 11, color: '#94A3B8', margin: 0 }
const statValue: React.CSSProperties = { fontSize: 22, color: '#FFFFFF', margin: '4px 0 0', fontWeight: 700 }
const ctaSection: React.CSSProperties = { textAlign: 'center' as const, margin: '24px 0' }
const ctaButton: React.CSSProperties = { backgroundColor: '#3B82F6', color: '#FFFFFF', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }
const signature: React.CSSProperties = { fontSize: 12, color: '#94A3B8', textAlign: 'center' as const }
const planPre: React.CSSProperties = { fontFamily: 'JetBrains Mono, ui-monospace, Menlo, monospace', fontSize: 11, lineHeight: 1.5, color: '#CBD5E1', backgroundColor: '#0B1120', border: '1px solid #1E293B', borderRadius: 8, padding: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto', margin: '8px 0 0' }
