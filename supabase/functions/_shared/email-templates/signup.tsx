/// <reference types="npm:@types/react@18.3.1" />

import * as React from "npm:react@18.3.1";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from "npm:@react-email/components@0.0.22";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
  // ADR-0064: the 6-digit GoTrue OTP. Primary confirmation path — a typed code
  // cannot be consumed by a link scanner and works on any device.
  token?: string;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  token,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm your email</Heading>
        <Text style={text}>
          Thanks for signing up for{" "}
          <Link href={siteUrl} style={link}>
            <strong>Tech Fleet</strong>
          </Link>
          !
        </Text>
        <Text style={text}>
          Enter this confirmation code for{" "}
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          :
        </Text>
        {token ? <Text style={code}>{token}</Text> : null}
        <Text style={text}>Or confirm with one tap:</Text>
        <Button style={button} href={confirmationUrl}>
          Confirm email
        </Button>
        <Text style={footer}>
          This code expires soon and can only be used once. If you didn't create an account, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export default SignupEmail;

const main = { backgroundColor: "#ffffff", fontFamily: "'Poppins', Arial, sans-serif" };
const container = { padding: "32px 28px" };
const h1 = {
  fontSize: "22px",
  fontWeight: "bold" as const,
  color: "#141726",
  margin: "0 0 20px",
};
const text = {
  fontSize: "14px",
  color: "#64748b",
  lineHeight: "1.6",
  margin: "0 0 25px",
};
const link = { color: "inherit", textDecoration: "underline" };
const code = {
  fontSize: "32px",
  fontWeight: "bold" as const,
  letterSpacing: "8px",
  color: "#141726",
  fontFamily: "'Courier New', Courier, monospace",
  textAlign: "center" as const,
  margin: "0 0 25px",
};
const button = {
  backgroundColor: "#0056A7",
  color: "#ffffff",
  fontSize: "14px",
  borderRadius: "6px",
  padding: "12px 24px",
  textDecoration: "none",
  fontWeight: "600" as const,
};
const footer = { fontSize: "12px", color: "#64748b", margin: "30px 0 0", lineHeight: "1.5" };
