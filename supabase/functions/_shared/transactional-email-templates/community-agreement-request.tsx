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
  hats?: string[]
}

const CommunityAgreementRequestEmail = ({
  firstName,
  projectName,
  clientName,
  agreementUrl,
  hats,
}: CommunityAgreementProps) => {
  const project = projectName || 'your project'
  const hatList = Array.isArray(hats) ? hats.filter(Boolean) : []
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Project Training Offer from Tech Fleet</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <Text style={brandTag}>TECH FLEET NETWORK</Text>
          </Section>

          <Text style={text}>Hello {firstName || 'there'}!</Text>

          <Text style={text}>
            Thank you so much for taking the time to chat with the project coordinator.
            It was so wonderful getting to know you.
          </Text>

          <Heading style={h2}>Training Offer</Heading>

          <Text style={text}>
            I am delighted to offer you a training position for the upcoming apprenticeship!
          </Text>

          <Text style={projectLine}>
            <strong>{project}</strong> – Cross-Functional Agile Teammate
          </Text>

          <Heading style={h3}>Hats</Heading>
          {hatList.length > 0 ? (
            <ul style={list}>
              {hatList.map((h) => (
                <li key={h} style={listItem}>{h}</li>
              ))}
            </ul>
          ) : (
            <Text style={text}>The hats you selected when you applied.</Text>
          )}

          <Heading style={h3}>Reply Now</Heading>
          <Text style={text}>
            If you want to commit to this training, click the button below to sign the
            Community Trainee Terms and Conditions so that you know what to expect about
            the training.
          </Text>

          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Button href={agreementUrl || 'https://techfleet.network/dashboard'} style={button}>
              Sign the Terms and Conditions
            </Button>
          </Section>

          <Heading style={h3}>Next steps</Heading>
          <ol style={list}>
            <li style={listItem}>Sign the Community Trainee Terms and Conditions.</li>
            <li style={listItem}>We can get you into the project channels in Discord.</li>
            <li style={listItem}>
              We will have a full teammate kickoff after we build the entire training
              team, so look out for communications in email and Discord to schedule.
            </li>
            <li style={listItem}>
              After that we will all start working with an Agile Coach to do
              “pre-kickoff” for the first 3 weeks of the project.
            </li>
            <li style={listItem}>
              After pre-kickoff, we will start our 8 weeks of project training work together.
            </li>
          </ol>

          <Text style={text}>Looking forward to hearing from you soon!</Text>

          <Text style={signature}>The Tech Fleet team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CommunityAgreementRequestEmail,
  subject: (() => 'Project Training Offer from Tech Fleet') as any,
  displayName: 'Project training offer',
  previewData: {
    firstName: 'Jane',
    projectName: 'Atlas Redesign',
    clientName: 'Hopeful Futures',
    agreementUrl: 'https://techfleet.network/applications/projects/abc/status?agreement=open',
    hats: ['UX Designer', 'Product Manager'],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '580px', margin: '0 auto' }
const headerSection = { textAlign: 'center' as const, marginBottom: '24px' }
const brandTag = { fontSize: '13px', fontWeight: '700' as const, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const h2 = { fontSize: '20px', fontWeight: '700' as const, color: '#18181b', margin: '24px 0 12px' }
const h3 = { fontSize: '17px', fontWeight: '700' as const, color: '#18181b', margin: '20px 0 10px' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px' }
const projectLine = { fontSize: '16px', color: '#18181b', lineHeight: '1.6', margin: '0 0 8px' }
const list = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.7', margin: '0 0 16px', paddingLeft: '20px' }
const listItem = { margin: '0 0 6px' }
const button = { backgroundColor: '#0056A7', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', fontSize: '15px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const signature = { fontSize: '15px', fontWeight: '600' as const, color: '#18181b', margin: '24px 0 0' }
