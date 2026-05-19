import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface ProjectBlastProps {
  firstName?: string
  projectName?: string
  bodyHtml?: string
  senderName?: string
}

const ProjectBlastEmail = ({ firstName, projectName, bodyHtml, senderName }: ProjectBlastProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Update from ${senderName || 'your project coordinator'}${projectName ? ` — ${projectName}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Text style={brandTag}>TECH FLEET NETWORK</Text>
        </Section>

        {projectName ? <Heading style={h1}>{projectName}</Heading> : null}

        <Text style={text}>Hi {firstName || 'there'},</Text>

        {/*
          Body is sanitized server-side via sanitize_user_html() before render.
          Use React.createElement explicitly to guarantee no `children` prop
          coexists with `dangerouslySetInnerHTML` (react-email/renderAsync
          throws "Can only set one of `children` or `props.dangerouslySetInnerHTML`"
          when JSX whitespace sneaks in as a child).
        */}
        {React.createElement('div', {
          style: bodySection,
          dangerouslySetInnerHTML: { __html: (bodyHtml ?? '').toString() },
        })}

        <Hr style={hr} />

        <Text style={signature}>
          {senderName ? `${senderName}` : 'Your project coordinator'}<br />
          The Tech Fleet Network Team
        </Text>

        <Text style={footnote}>
          You received this because you applied to{projectName ? ` ${projectName}` : ' this project'}.
          Manage your{' '}
          <Link href="https://techfleet.network/settings/notifications" style={link}>notification preferences</Link>.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ProjectBlastEmail,
  subject: (data: Record<string, any>) =>
    typeof data?.subject === 'string' && data.subject.trim()
      ? data.subject.trim().slice(0, 150)
      : 'Project update',
  displayName: 'Project blast',
  previewData: {
    firstName: 'Jane',
    projectName: 'Acme — Discovery Sprint',
    senderName: 'Alex Kim',
    bodyHtml: '<p>Quick update on this week\'s milestones and what\'s next. Thanks for being on the team!</p>',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '13px', fontWeight: '700' as const, color: '#0056A7', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#18181b', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const bodySection = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const hr = { borderColor: '#e4e4e7', margin: '24px 0' }
const signature = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', margin: '0 0 24px' }
const footnote = { fontSize: '12px', color: '#71717a', margin: '0' }
const link = { color: '#0056A7', textDecoration: 'underline' }
