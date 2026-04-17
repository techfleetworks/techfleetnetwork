/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Tech Fleet Network'

interface AdminPasskeyRecoveryProps {
  firstName?: string
  recoveryUrl?: string
  ipAddress?: string
}

const AdminPasskeyRecoveryEmail = ({ firstName, recoveryUrl, ipAddress }: AdminPasskeyRecoveryProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your one-time admin passkey recovery link for {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Text style={brandTag}>{SITE_NAME} • Admin Security</Text>
          <Heading style={h1}>Passkey Recovery Link</Heading>
          <Text style={text}>Hi {firstName || 'Admin'},</Text>
          <Text style={text}>
            We received a request to bypass passkey verification on your admin
            session. Click the button below to verify and continue.
          </Text>
          <Section style={btnWrap}>
            <Button href={recoveryUrl} style={btn}>
              Verify and continue
            </Button>
          </Section>
          <Text style={muted}>
            This link expires in 15 minutes and can only be used once.
            {ipAddress && ipAddress !== 'unknown' ? ` Requested from IP ${ipAddress}.` : ''}
          </Text>
          <Text style={muted}>
            If you didn't request this, you can safely ignore this email — your
            account is still protected by your passkey.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AdminPasskeyRecoveryEmail,
  subject: 'Admin passkey recovery link',
  displayName: 'Admin passkey recovery',
  previewData: {
    firstName: 'Morgan',
    recoveryUrl: 'https://techfleetnetwork.lovable.app/admin-recovery?token=sample',
    ipAddress: '203.0.113.42',
  },
} satisfies TemplateEntry

const main: React.CSSProperties = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', margin: 0, padding: 0 }
const container: React.CSSProperties = { maxWidth: '600px', margin: '0 auto', padding: '40px 20px' }
const card: React.CSSProperties = { background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '32px' }
const brandTag: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px', textAlign: 'center' }
const h1: React.CSSProperties = { fontSize: '22px', fontWeight: 700, color: '#18181b', margin: '0 0 16px' }
const text: React.CSSProperties = { fontSize: '15px', lineHeight: 1.6, color: '#3f3f46', margin: '0 0 16px' }
const btnWrap: React.CSSProperties = { textAlign: 'center', margin: '24px 0' }
const btn: React.CSSProperties = { display: 'inline-block', backgroundColor: '#18181b', color: '#ffffff', fontSize: '14px', fontWeight: 600, padding: '12px 24px', borderRadius: '6px', textDecoration: 'none' }
const muted: React.CSSProperties = { fontSize: '12px', color: '#a1a1aa', margin: '12px 0 0' }
