/**
 * Generates 4 comprehensive policy DOCX files for techfleet.network.
 * Reading level: ~9th grade. Jurisdiction: Delaware, USA. Global coverage.
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  LevelFormat, PageOrientation, ExternalHyperlink, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle,
} = require("docx");

const OUT = "/mnt/documents/techfleet-network-policies";
fs.mkdirSync(OUT, { recursive: true });

const EFFECTIVE = "May 7, 2026";
const ENTITY = "Tech Fleet, a Delaware nonprofit corporation (\u201CTech Fleet,\u201D \u201Cwe,\u201D \u201Cus,\u201D or \u201Cour\u201D)";
const SITE = "techfleet.network";
const EMAIL = "info@techfleet.network";

// ----- helpers -------------------------------------------------------------

const baseStyles = {
  default: { document: { run: { font: "Arial", size: 22 } } }, // 11pt
  paragraphStyles: [
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 32, bold: true, font: "Arial" },
      paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
    { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 26, bold: true, font: "Arial" },
      paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
      run: { size: 23, bold: true, font: "Arial" },
      paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
  ],
};

const numberingConfig = {
  config: [
    { reference: "bul", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
    ]},
  ],
};

const P = (text, opts = {}) => new Paragraph({
  spacing: { after: 120 },
  ...opts,
  children: Array.isArray(text) ? text : [new TextRun(text)],
});
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const B = (text, level = 0) => new Paragraph({
  numbering: { reference: "bul", level },
  spacing: { after: 80 },
  children: [new TextRun(text)],
});
const Bold = (text) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, bold: true })] });
const Mix = (parts) => new Paragraph({ spacing: { after: 120 }, children: parts });
const Link = (text, url) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, style: "Hyperlink", color: "1F4E8C", underline: {} })] });

const titleBlock = (title) => [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: title, bold: true, size: 40 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [
      new TextRun({ text: `Tech Fleet \u2014 ${SITE}`, italics: true }),
      new TextRun({ text: `   |   Effective Date: ${EFFECTIVE}`, italics: true }),
    ],
  }),
];

const sectionConfig = {
  properties: {
    page: {
      size: { width: 12240, height: 15840 }, // US Letter
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    },
  },
};

const buildDoc = (children) => new Document({
  styles: baseStyles,
  numbering: numberingConfig,
  sections: [{ ...sectionConfig, children }],
});

const save = async (name, doc) => {
  const buf = await Packer.toBuffer(doc);
  const file = path.join(OUT, name);
  fs.writeFileSync(file, buf);
  console.log("wrote", file, buf.length, "bytes");
};

// ===========================================================================
// 1) PRIVACY POLICY
// ===========================================================================

const privacy = buildDoc([
  ...titleBlock("Privacy Policy"),

  P([new TextRun({ text: "Plain-language summary: ", bold: true }),
    new TextRun("This policy explains what personal information we collect when you use techfleet.network, why we collect it, who we share it with, how long we keep it, and what choices and rights you have. It is written for a general audience and is meant to be easy to read.")]),

  H1("1. Who We Are and How to Reach Us"),
  Mix([new TextRun(`${ENTITY} operates the website and learning platform at `), new TextRun({ text: SITE, bold: true }), new TextRun(" (the \u201CPlatform\u201D). We are a nonprofit training organization based in the United States.")]),
  Mix([new TextRun("For any privacy question, request, or complaint, contact us at: "), new TextRun({ text: EMAIL, bold: true }), new TextRun(". You can also write to Tech Fleet, Privacy Office, Delaware, USA.")]),
  P("For users in the European Economic Area (EEA), the United Kingdom (UK), or Switzerland, you may also contact our designated representative through the same email address."),

  H1("2. Scope of This Policy"),
  P("This policy applies to personal information we collect through the Platform, our emails, our Discord community, our learning tools, and any related services that link to this policy. It does not apply to third-party websites, apps, or services that we do not own or control, even if you reach them through a link on the Platform."),

  H1("3. Information We Collect"),
  H2("3.1 Information you give us"),
  B("Account information: name, email address, password, profile picture, country, time zone, and similar details you enter when you sign up or update your profile."),
  B("Application and program information: the answers you provide when you apply for a project, class, cohort, or volunteer role, including your background, goals, skills, experience, and any documents you upload."),
  B("Communications: messages, feedback, surveys, support tickets, and other content you send to us or post in our community spaces."),
  B("Payment-related information: if we ever process a donation or paid service, our payment processor will collect your card or bank details. We do not store full payment card numbers."),

  H2("3.2 Information collected automatically"),
  B("Device and connection data: IP address, browser type and version, operating system, device identifiers, screen size, language, and time zone."),
  B("Usage data: pages you view, links you click, time spent on pages, referring website, and similar analytics."),
  B("Performance data: anonymous Core Web Vitals (such as page load speed) used to keep the Platform fast and reliable."),
  B("Cookies and similar technologies: see our separate Cookie Policy for full details."),

  H2("3.3 Information from third parties"),
  B("Single sign-on providers (for example, Google) when you choose to sign in with them. We receive your name, email, profile picture, and a unique ID."),
  B("Discord, when you choose to link your Discord account so we can grant you community roles."),
  B("Public sources, such as professional networks, when you give us a public profile link."),
  B("Service providers who help us run the Platform, such as analytics, email delivery, error monitoring, and meeting recording tools."),

  H2("3.4 Sensitive information"),
  P("We try to avoid collecting sensitive personal information. We do not ask for government ID numbers, health data, biometric data, precise geolocation, financial account credentials, racial or ethnic origin, religious beliefs, sexual orientation, or trade union membership. If you choose to share this kind of information in a free-text field, you do so voluntarily and we will treat it with extra care and only use it to respond to you."),

  H2("3.5 Children\u2019s information"),
  P("The Platform is intended for adults aged 18 and older and for older teenagers (ages 13\u201317) with verifiable parental or guardian consent where required by law. We do not knowingly collect personal information from children under 13 in the United States, under 16 in the European Economic Area or the United Kingdom (or the lower age set by an EU/EEA member state, but never below 13), under 14 in South Korea, or under 14 in China without parental or guardian consent. If you believe a child has given us personal information without proper consent, contact us at info@techfleet.network and we will delete it promptly."),

  H1("4. Why We Use Your Information (Purposes and Legal Bases)"),
  P("We use your personal information for the purposes listed below. For users in jurisdictions that require a legal basis (such as the EU/UK GDPR, Swiss FADP, or Brazil\u2019s LGPD), the matching legal basis is shown in brackets."),
  B("Provide and operate the Platform, including creating your account, authenticating you, and showing you content [contract / legitimate interests / Art. 6(1)(b) GDPR]."),
  B("Run our training programs, projects, classes, cohorts, certifications, and learning paths [contract / legitimate interests]."),
  B("Communicate with you about your account, applications, programs, security alerts, and policy updates [contract / legal obligation / legitimate interests]."),
  B("Send marketing, newsletters, or community updates where allowed [consent or legitimate interests, with an easy way to opt out]."),
  B("Personalize your experience, such as recommending courses or projects [legitimate interests / consent where required]."),
  B("Keep the Platform safe and secure, prevent fraud, abuse, and unauthorized access [legitimate interests / legal obligation]."),
  B("Comply with laws, court orders, and regulatory requests, and to defend legal claims [legal obligation / legitimate interests]."),
  B("Improve our services, including bug fixing, analytics, and research [legitimate interests / consent for non-essential cookies]."),
  P("Where we rely on consent (for example, for non-essential cookies, certain marketing, or sensitive data), you can withdraw consent at any time. Withdrawing consent does not affect the lawfulness of processing before the withdrawal."),

  H1("5. Automated Decisions and Profiling"),
  P("We do not make decisions about you that produce legal or similarly significant effects using automated processing alone. Some features (for example, course recommendations, AI-assisted help from our chatbot \u201CFleety,\u201D or matching you to projects) use automated logic, but a human is involved in any decision that materially affects your participation. You may ask us to explain these features and request human review by emailing info@techfleet.network."),

  H1("6. How We Share Your Information"),
  P("We do not sell your personal information for money. We share information only as described below:"),
  B("With service providers that host, analyze, secure, or otherwise help operate the Platform under written contracts that limit how they use your data."),
  B("With other Platform users when you choose to participate in projects, teams, or community spaces \u2014 only the profile fields you make visible."),
  B("With Discord, Google, and similar providers when you connect those accounts."),
  B("With clients of Tech Fleet projects, only when you apply to or join their project, and only the information needed for that project."),
  B("With law enforcement, regulators, or courts when we are legally required, or to protect rights, property, or safety."),
  B("In connection with a merger, acquisition, financing, reorganization, bankruptcy, or sale of assets, with appropriate confidentiality protections."),
  B("With your consent or at your direction."),

  H2("6.1 \u201CSale\u201D and \u201CSharing\u201D under U.S. state laws"),
  P("Some U.S. state privacy laws (including California\u2019s CCPA/CPRA, Virginia\u2019s VCDPA, Colorado\u2019s CPA, Connecticut\u2019s CTDPA, Utah\u2019s UCPA, Texas\u2019s TDPSA, Oregon\u2019s OCPA, Montana\u2019s MCDPA, and similar laws) define \u201Csale\u201D and \u201Csharing\u201D broadly. We do not sell personal information for monetary value. We do not knowingly share personal information for cross-context behavioral advertising. We may use limited analytics cookies and tracking pixels that some regulators consider \u201Csharing\u201D; you can opt out using our cookie banner, the \u201CDo Not Sell or Share My Personal Information\u201D link, or a Global Privacy Control (GPC) browser signal, which we honor as a valid opt-out request for the browser that sends it."),

  H1("7. International Data Transfers"),
  P("We are based in the United States. If you use the Platform from outside the United States, your information will be transferred to, stored in, and processed in the United States and other countries where we or our service providers operate. These countries may have data protection laws that are different from the laws in your country."),
  P("When we transfer personal information out of the EEA, the UK, or Switzerland, we use lawful transfer mechanisms, such as the European Commission\u2019s Standard Contractual Clauses, the UK International Data Transfer Addendum, the Swiss\u2013U.S. Data Privacy Framework where applicable, or your explicit consent. You may request a copy of the safeguards by emailing info@techfleet.network."),

  H1("8. How Long We Keep Your Information"),
  P("We keep personal information only as long as we need it for the purposes described in this policy, plus a reasonable period to meet legal, accounting, or reporting obligations and to defend legal claims. In general:"),
  B("Account data: while your account is active, plus up to 24 months after deletion for backup, fraud prevention, and dispute resolution."),
  B("Application and program data: for the length of the program plus up to 7 years for nonprofit recordkeeping and tax purposes."),
  B("Audit logs: retained for the period required by SOC 2 and ISO 27001 controls (typically up to 7 years), with cryptographic integrity protection."),
  B("Analytics and performance data: aggregated and de-identified after a short window (typically up to 25 months)."),
  B("Marketing data: until you unsubscribe, plus a short suppression-list period."),
  P("When data is no longer needed, we delete or anonymize it using secure methods."),

  H1("9. How We Protect Your Information"),
  P("We use a layered set of technical and organizational measures aligned with SOC 2, ISO 27001, and applicable HIPAA safeguards, including encryption in transit (HTTPS/TLS) and at rest, role-based access control, row-level security on our database, multi-factor authentication for administrators, vulnerability scanning, audit logging, and a written incident response plan. No system can be 100% secure, so we cannot guarantee absolute security, but we work hard to protect your information and to notify you and regulators if a notifiable security incident affects you."),

  H1("10. Your Privacy Rights"),
  P("Depending on where you live, you may have some or all of the rights below. We do not charge a fee for most requests and we will respond within the time required by law (usually 30\u201345 days, with one extension where allowed)."),
  B("Right to know or access the personal information we hold about you, including categories, sources, purposes, and recipients."),
  B("Right to receive a portable copy of your information in a commonly used, machine-readable format."),
  B("Right to correct inaccurate or incomplete information."),
  B("Right to delete or erase your personal information."),
  B("Right to restrict or object to processing, including profiling, for direct marketing or based on legitimate interests."),
  B("Right to withdraw consent at any time where processing is based on consent."),
  B("Right to opt out of \u201Csale\u201D or \u201Csharing\u201D of personal information and of targeted advertising."),
  B("Right to opt out of certain profiling that produces legal or similarly significant effects."),
  B("Right not to receive discriminatory treatment for exercising your rights."),
  B("Right to appeal a decision we make about your privacy request."),
  B("Right to lodge a complaint with a data protection authority in your country (for EU/EEA, your local supervisory authority; for the UK, the ICO; for Brazil, the ANPD; for Canada, the OPC; etc.)."),
  P("To exercise any right, email us at info@techfleet.network or use the privacy controls in your account settings. We will verify your identity using information already linked to your account. You may use an authorized agent where allowed by law; we may ask the agent for proof of authority."),

  H2("10.1 Region-specific notices"),
  Bold("United States \u2014 California (CCPA/CPRA)"),
  P("California residents have the right to know the categories and specific pieces of personal information we have collected about them in the past 12 months, the categories of sources, the business purposes, and the categories of third parties with whom we shared it. California residents may also request deletion, correction, and to limit the use of \u201Csensitive personal information.\u201D We do not sell personal information for money and we do not knowingly share personal information for cross-context behavioral advertising as those terms are defined under the CCPA/CPRA, except for limited analytics described in our Cookie Policy. We honor Global Privacy Control (GPC) signals."),
  Bold("United States \u2014 other state laws (Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Montana, Iowa, Indiana, Tennessee, Delaware, New Jersey, New Hampshire, Minnesota, Maryland, Rhode Island, Kentucky, and similar)"),
  P("Residents of these states have rights to access, correct (where applicable), delete, and obtain a copy of their personal data, and to opt out of targeted advertising, sale of personal data, and certain profiling. You also have the right to appeal our decision about your request."),
  Bold("European Economic Area, United Kingdom, and Switzerland (GDPR / UK GDPR / FADP)"),
  P("You have all of the rights listed in Section 10. You also have the right to lodge a complaint with your local data protection authority. Our lawful bases are described in Section 4."),
  Bold("Canada (PIPEDA and provincial laws including Quebec Law 25)"),
  P("You may request access to and correction of your personal information, withdraw consent (subject to legal or contractual restrictions), and complain to the Office of the Privacy Commissioner of Canada or your provincial regulator. We perform privacy impact assessments for new high-risk processing as required."),
  Bold("Brazil (LGPD)"),
  P("You have the rights of confirmation, access, correction, anonymization, portability, deletion, information about sharing, and review of automated decisions. Our Data Protection Officer can be reached at info@techfleet.network."),
  Bold("United Kingdom"),
  P("In addition to UK GDPR rights, you may complain to the Information Commissioner\u2019s Office (ICO)."),
  Bold("Australia (Privacy Act 1988 and APPs)"),
  P("You may request access and correction. Complaints can be made to the Office of the Australian Information Commissioner (OAIC)."),
  Bold("New Zealand (Privacy Act 2020)"),
  P("You may complain to the Office of the Privacy Commissioner."),
  Bold("South Africa (POPIA)"),
  P("You may exercise your rights through info@techfleet.network and complain to the Information Regulator."),
  Bold("Japan (APPI), South Korea (PIPA), Singapore (PDPA), India (DPDP Act 2023), Thailand (PDPA), Indonesia (PDP Law), Philippines (DPA), Malaysia (PDPA), Vietnam (PDPD), Hong Kong (PDPO), and Taiwan (PDPA)"),
  P("You have rights of access, correction, withdrawal of consent, deletion, and the right to lodge a complaint with your local supervisory authority. Where required, we have appointed a local representative or grievance officer. Contact info@techfleet.network for details."),
  Bold("China (PIPL), Russia (152-FZ), Saudi Arabia (PDPL), United Arab Emirates (PDPL), Qatar, Bahrain, Israel, Türkiye (KVKK), Kenya, Nigeria (NDPR/NDPA), Egypt, and other jurisdictions"),
  P("Where these laws apply to you, we honor the corresponding rights and follow local rules on cross-border transfers, registration, and data localization. Some of these laws limit transfers of personal information outside the country; in those cases, we use the lawful transfer route required by local law."),

  H1("11. Marketing and Communications"),
  P("We may send you transactional emails (such as account, security, or program updates) that you cannot opt out of while you have an active account. You can opt out of marketing emails at any time by clicking the \u201Cunsubscribe\u201D link in the email or updating your notification preferences in your account. We comply with the U.S. CAN-SPAM Act, Canada\u2019s CASL, the EU/UK ePrivacy rules, and similar laws."),

  H1("12. Cookies and Tracking"),
  P("We use cookies, local storage, pixels, and similar technologies. Please read our separate Cookie Policy for full details, including what each cookie does, how long it lasts, and how to manage your choices."),

  H1("13. Third-Party Services and Links"),
  P("The Platform connects to or links from third-party services such as Google, Discord, YouTube, Calendly, video conferencing platforms, analytics providers, and others. Their privacy practices are governed by their own policies. We encourage you to read them."),

  H1("14. Data Breach Notification"),
  P("If we discover a security incident that affects your personal information and is required to be reported under applicable law, we will notify you and the relevant regulators within the time required (for example, within 72 hours under GDPR, and within the time required by U.S. state laws, HIPAA, Canada\u2019s PIPEDA, Brazil\u2019s LGPD, and similar regimes)."),

  H1("15. Do Not Track and Global Privacy Control"),
  P("Many browsers offer a \u201CDo Not Track\u201D (DNT) setting. Because there is no common industry standard for DNT, we do not respond to DNT signals at this time. We do honor Global Privacy Control (GPC) signals as a valid opt-out of \u201Csale\u201D and \u201Csharing\u201D where U.S. state laws require."),

  H1("16. Changes to This Policy"),
  P("We may update this policy from time to time. When we make material changes, we will post the new version on the Platform and update the Effective Date at the top. If the law requires, we will notify you by email or in-product notice and obtain your consent before the change takes effect."),

  H1("17. Contact and Complaints"),
  Mix([new TextRun("Email: "), new TextRun({ text: EMAIL, bold: true })]),
  P("Mailing address: Tech Fleet, Privacy Office, Delaware, USA."),
  P("If you are not satisfied with our response, you may contact your local data protection authority or supervisory authority. We are committed to resolving privacy concerns in good faith."),
]);

// ===========================================================================
// 2) COOKIE POLICY (extra-comprehensive)
// ===========================================================================

// Cookie list rendered as grouped bullet entries (Framer-friendly: no tables).
// Format per item: "Name — Purpose (Lifetime)"
const cookieGroups = [
  { heading: "4.1 Strictly Necessary", items: [
    "sb-access-token, sb-refresh-token \u2014 Keep you signed in securely (Supabase auth). Lifetime: session / up to 30 days.",
    "tf_session_id \u2014 Anonymous session identifier for security and abuse prevention. Lifetime: session.",
    "tf_csrf \u2014 Cross-site request forgery (CSRF) protection token. Lifetime: session.",
    "cookieyes-consent \u2014 Stores your cookie consent choices (CookieYes). Lifetime: 1 year.",
    "__cf_bm, cf_clearance \u2014 Cloudflare bot management and security. Lifetime: 30 minutes to 1 year.",
  ]},
  { heading: "4.2 Functional", items: [
    "tf_theme \u2014 Remembers your light/dark theme choice. Lifetime: 1 year.",
    "tf_locale \u2014 Remembers your preferred language and time zone. Lifetime: 1 year.",
    "tf_welcome_shown_* \u2014 Remembers that you have seen the welcome dialog. Lifetime: 1 year.",
    "tf_dashboard_layout \u2014 Remembers dashboard widget choices. Lifetime: 1 year.",
    "discord_* \u2014 Set by Discord widgets when you link your Discord account. Lifetime: up to 1 year.",
    "NID, SIDCC, __Secure-*, AEC \u2014 Set by Google when you sign in with Google or load Google fonts/services. Lifetime: up to 24 months.",
  ]},
  { heading: "4.3 Analytics and Performance", items: [
    "_ga, _ga_*, _gid \u2014 Google Analytics 4 measures visits and usage (only with consent in EEA/UK/CH). Lifetime: up to 24 months.",
    "_clck, _clsk, CLID, ANONCHK, MR, MUID, SM \u2014 Microsoft Clarity anonymous heatmaps and session recordings (only with consent). Lifetime: 1 day to 1 year.",
    "_gcl_au \u2014 Google Tag Manager attribution token (only with consent). Lifetime: 90 days.",
    "web_vital_* \u2014 Anonymous Core Web Vitals performance beacon (no personal identifiers). Lifetime: session.",
  ]},
  { heading: "4.4 Marketing / Embedded Media", items: [
    "YSC, VISITOR_INFO1_LIVE, PREF (youtube.com) \u2014 Set by embedded YouTube videos (only with consent). Lifetime: session to 8 months.",
  ]},
];

const cookieListBlocks = cookieGroups.flatMap((g) => [
  H2(g.heading),
  ...g.items.map((t) => B(t)),
]);

const cookies = buildDoc([
  ...titleBlock("Cookie Policy"),

  P([new TextRun({ text: "Plain-language summary: ", bold: true }),
    new TextRun("Cookies are small files saved on your device when you use a website. We use a few that are required to keep the site working, plus optional ones for things like analytics and remembering your settings. You can accept or reject the optional ones at any time using our cookie banner.")]),

  H1("1. About This Policy"),
  Mix([new TextRun(`This Cookie Policy explains how ${ENTITY} uses cookies and similar technologies on `), new TextRun({ text: SITE, bold: true }), new TextRun(". Read it together with our Privacy Policy. By continuing to use the Platform, and by accepting non-essential cookies in our banner, you agree to the use of cookies as described here.")]),
  Mix([new TextRun("Effective date: "), new TextRun({ text: EFFECTIVE, bold: true }), new TextRun(". Last reviewed: "), new TextRun({ text: EFFECTIVE, bold: true }), new TextRun(".")]),

  H1("2. What Are Cookies and Similar Technologies?"),
  P("\u201CCookies\u201D are small text files placed on your device by your web browser. \u201CSimilar technologies\u201D include local storage, session storage, IndexedDB, pixel tags, web beacons, software development kits (SDKs), device fingerprints, and server logs. In this policy, we use the word \u201Ccookies\u201D to mean all of these technologies, unless we say otherwise."),
  B("First-party cookies are set by the website you are visiting (techfleet.network)."),
  B("Third-party cookies are set by another company whose content is loaded by the website (for example, Google, Microsoft, Discord, YouTube)."),
  B("Session cookies disappear when you close your browser."),
  B("Persistent cookies stay on your device for a set time."),

  H1("3. Categories of Cookies We Use"),
  H2("3.1 Strictly Necessary Cookies"),
  P("These cookies are required for the Platform to work. Without them, you cannot sign in, the site cannot stay secure, and we cannot meet legal duties. They do not require your consent under EU/UK ePrivacy law."),
  H2("3.2 Functional Cookies"),
  P("These cookies remember your choices, such as your theme, language, time zone, and dashboard layout. They make the Platform easier to use but are not strictly necessary."),
  H2("3.3 Analytics and Performance Cookies"),
  P("These cookies help us count visits, see which pages are popular, and measure speed and errors. We use Google Analytics 4 with IP-anonymization, Microsoft Clarity for heatmaps and session replays (with text masking), Google Tag Manager, and our own internal performance beacon (Core Web Vitals)."),
  H2("3.4 Marketing and Advertising Cookies"),
  P("We currently do not run paid advertising on the Platform and we do not use cookies for cross-context behavioral advertising. If we ever do, we will update this policy and request fresh consent from users in the EEA, UK, Switzerland, Brazil, and any other region where consent is required."),
  H2("3.5 Social Media Cookies"),
  P("If we embed content from Discord, YouTube, LinkedIn, or similar services, those services may set their own cookies. We load embeds in a privacy-friendly way where possible (for example, with consent and with \u201Cno-cookie\u201D modes)."),

  H1("4. Detailed List of Cookies"),
  P("The list below shows the cookies that may be set when you use the Platform, grouped by category. Each entry shows the cookie name (or pattern), what it does, and how long it stays on your device. Cookie names from third-party services may change without notice; we update this list at least once a year and after any major change."),
  ...cookieListBlocks,
  P("Some browsers also store small pieces of data in local storage and IndexedDB \u2014 for example, your draft form input, your offline cache, or your authentication token. These are treated the same way as cookies under this policy and are listed above when they affect privacy."),

  H1("5. Your Choices and How to Manage Cookies"),
  H2("5.1 Cookie banner"),
  P("The first time you visit the Platform from a new browser, our cookie banner asks you to accept all cookies, reject non-essential cookies, or choose your settings by category. You can change your choices at any time by clicking the \u201CCookie Settings\u201D link in the footer of every page."),
  H2("5.2 Browser controls"),
  P("Most browsers let you block or delete cookies. Look in the \u201CSettings,\u201D \u201CPreferences,\u201D or \u201CPrivacy\u201D section of your browser. Blocking strictly necessary cookies will break the Platform; you will not be able to sign in."),
  H2("5.3 Global Privacy Control (GPC) and Do Not Track"),
  P("If your browser sends a Global Privacy Control (GPC) signal, we treat that as a valid opt-out of \u201Csale\u201D and \u201Csharing\u201D for that browser, where U.S. state laws apply. We do not respond to \u201CDo Not Track\u201D signals at this time because there is no common standard."),
  H2("5.4 Industry opt-out tools"),
  B("Digital Advertising Alliance (USA): https://optout.aboutads.info"),
  B("Network Advertising Initiative (USA): https://optout.networkadvertising.org"),
  B("European Interactive Digital Advertising Alliance (EU/UK): https://www.youronlinechoices.eu"),
  B("Digital Advertising Alliance of Canada: https://youradchoices.ca"),
  B("Google Analytics opt-out: https://tools.google.com/dlpage/gaoptout"),
  B("Microsoft Clarity opt-out: https://privacy.microsoft.com/en-us/privacystatement"),

  H1("6. Legal Basis for Cookies"),
  P("In the EEA, UK, and Switzerland, we set strictly necessary cookies on the basis that they are required to provide the service you have requested. We set all other cookies only with your prior, freely given, specific, informed, and unambiguous consent. You can withdraw consent at any time using the \u201CCookie Settings\u201D link."),
  P("In the United States and other jurisdictions, we use cookies in line with applicable laws (such as the CCPA/CPRA, VCDPA, CPA, CTDPA, UCPA, and other state privacy laws). You can opt out of \u201Csale\u201D or \u201Csharing\u201D using the cookie banner, the \u201CDo Not Sell or Share My Personal Information\u201D link, or a GPC signal."),
  P("In Brazil (LGPD), Canada (PIPEDA / Quebec Law 25), South Africa (POPIA), Australia (Privacy Act), Japan (APPI), South Korea (PIPA), Singapore (PDPA), India (DPDP Act), Türkiye (KVKK), United Arab Emirates (PDPL), Saudi Arabia (PDPL), China (PIPL), and other regions, we apply the cookie consent and notice requirements that apply to you. Where local law requires explicit prior consent for analytics or marketing cookies, we obtain it."),

  H1("7. Children\u2019s Privacy"),
  P("We do not knowingly use cookies to collect information from children under 13 (or the higher minimum age set by your country). If you are a parent or guardian and believe a child has accepted cookies on the Platform without proper consent, contact us at info@techfleet.network."),

  H1("8. Security and Data Transfers"),
  P("Some cookies are set by service providers based outside your country (for example, in the United States). When this happens, we use the same lawful international transfer mechanisms described in our Privacy Policy (such as Standard Contractual Clauses or the EU\u2013U.S. Data Privacy Framework where applicable)."),

  H1("9. Changes to This Cookie Policy"),
  P("We may update this Cookie Policy when we add or remove cookies, change service providers, or change the law. When changes are material, we will refresh the cookie banner and ask for new consent where required. The Effective Date at the top shows when the most recent version was posted."),

  H1("10. Contact Us"),
  Mix([new TextRun("Email: "), new TextRun({ text: EMAIL, bold: true })]),
  P("Mailing address: Tech Fleet, Privacy Office, Delaware, USA."),
  P("If you have questions, complaints, or requests about cookies, contact us first. You also have the right to complain to your local data protection authority."),
]);

// ===========================================================================
// 3) TERMS OF USE  (website use)
// ===========================================================================

const termsUse = buildDoc([
  ...titleBlock("Terms of Use"),

  P([new TextRun({ text: "Plain-language summary: ", bold: true }),
    new TextRun("These Terms of Use are the rules for using the techfleet.network website. By using the site, you agree to follow these rules. They cover what you can and cannot do, who owns the content, and what happens if there is a problem.")]),

  H1("1. Acceptance of These Terms"),
  Mix([new TextRun(`These Terms of Use (\u201CTerms\u201D) are a legal agreement between you and ${ENTITY}. By accessing or using `), new TextRun({ text: SITE, bold: true }), new TextRun(" and any related pages, you agree to these Terms and our Privacy Policy and Cookie Policy. If you do not agree, do not use the Platform.")]),

  H1("2. Who May Use the Platform"),
  P("You may use the Platform only if you are at least 18 years old, or at least 13 years old with the consent of a parent or legal guardian and any other approval required by your country\u2019s law. By using the Platform, you confirm that you meet these requirements and that all information you give us is true and complete."),

  H1("3. Accounts and Security"),
  P("You are responsible for keeping your account information accurate and your password safe. Do not share your account with anyone. Tell us right away if you think your account has been used without your permission. We may suspend or close any account that is used in a way that breaks these Terms or the law."),

  H1("4. Acceptable Use"),
  P("You agree not to:"),
  B("Break any law or regulation, or violate the rights of others."),
  B("Try to gain unauthorized access to the Platform, other accounts, or our systems."),
  B("Upload, post, or share content that is illegal, harmful, harassing, hateful, defamatory, sexually explicit, violent, or that infringes intellectual property or privacy rights."),
  B("Use the Platform to send spam, phishing messages, or chain letters."),
  B("Introduce viruses, worms, ransomware, or any other malicious code."),
  B("Scrape, copy, or republish large parts of the Platform without our written permission."),
  B("Use bots, automated tools, or AI agents to abuse, overwhelm, or reverse-engineer the Platform."),
  B("Misrepresent your identity or affiliation, including impersonating Tech Fleet staff or other users."),
  B("Interfere with security features, rate limits, or access controls."),
  B("Use the Platform in any way that violates U.S. or international export, sanctions, or anti-corruption laws."),

  H1("5. Intellectual Property"),
  P("All Platform content \u2014 software, designs, text, graphics, logos, videos, and curriculum materials \u2014 is owned by Tech Fleet or its licensors and is protected by copyright, trademark, and other laws. We grant you a limited, personal, non-exclusive, non-transferable, revocable license to access and use the Platform for its intended purpose. You do not get any other rights."),
  P("\u201CTech Fleet\u201D and the Tech Fleet logo are trademarks of Tech Fleet. You may not use them without our written permission."),

  H1("6. Your Content"),
  P("If you upload, submit, or post content (\u201CYour Content\u201D), you keep ownership of it. You grant Tech Fleet a worldwide, non-exclusive, royalty-free license to host, store, copy, display, and use Your Content as needed to operate, improve, and promote the Platform and our nonprofit mission, and to comply with the law. You confirm that you have the right to grant this license."),

  H1("7. Feedback"),
  P("If you send us ideas or suggestions, you agree that we may use them without any obligation to you and without payment."),

  H1("8. Third-Party Services and Links"),
  P("The Platform may link to or integrate with third-party services (such as Google, Discord, YouTube, Calendly, Stripe, and others). We are not responsible for those services. Your use of them is governed by their own terms and privacy policies."),

  H1("9. Beta Features and AI Tools"),
  P("Some features may be marked as \u201Cbeta,\u201D \u201Cpreview,\u201D or \u201Cexperimental,\u201D including AI-assisted tools such as our chatbot \u201CFleety.\u201D These features are provided as-is, may change without notice, and may produce inaccurate or incomplete results. Do not rely on AI outputs for legal, financial, medical, or other professional advice."),

  H1("10. Service Changes and Availability"),
  P("We may add, change, suspend, or remove parts of the Platform at any time, with or without notice. We aim for high availability but do not promise that the Platform will always be available, on time, secure, or error-free."),

  H1("11. Termination"),
  P("You may stop using the Platform at any time and delete your account from your account settings. We may suspend or end your access if you break these Terms, if we are required by law, or if continued access creates a risk to other users or our systems. Sections that by their nature should survive termination (such as Intellectual Property, Disclaimers, Limitation of Liability, Indemnification, and Governing Law) will continue to apply."),

  H1("12. Disclaimers"),
  P("THE PLATFORM IS PROVIDED \u201CAS IS\u201D AND \u201CAS AVAILABLE,\u201D WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. TO THE FULLEST EXTENT PERMITTED BY LAW, TECH FLEET DISCLAIMS ALL WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, AND QUIET ENJOYMENT. SOME COUNTRIES AND U.S. STATES DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES, SO SOME OF THESE EXCLUSIONS MAY NOT APPLY TO YOU."),

  H1("13. Limitation of Liability"),
  P("TO THE FULLEST EXTENT PERMITTED BY LAW, TECH FLEET, ITS DIRECTORS, OFFICERS, EMPLOYEES, VOLUNTEERS, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO YOUR USE OF THE PLATFORM. OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE PLATFORM IS LIMITED TO ONE HUNDRED U.S. DOLLARS (USD $100). NOTHING IN THESE TERMS LIMITS LIABILITY THAT CANNOT BE LIMITED BY LAW (INCLUDING LIABILITY FOR FRAUD, GROSS NEGLIGENCE, OR DEATH OR PERSONAL INJURY CAUSED BY OUR NEGLIGENCE)."),

  H1("14. Indemnification"),
  P("To the extent permitted by law, you agree to defend, indemnify, and hold harmless Tech Fleet and its team from any claims, losses, liabilities, damages, costs, and expenses (including reasonable legal fees) arising from your use of the Platform, your content, or your violation of these Terms or the law."),

  H1("15. Governing Law and Dispute Resolution"),
  P("These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-laws rules. Any dispute arising from or relating to these Terms or the Platform will be brought exclusively in the state or federal courts located in Delaware, and you and Tech Fleet consent to the personal jurisdiction of those courts."),
  P("If you live in the European Economic Area, the United Kingdom, Switzerland, Brazil, or another country with mandatory consumer protections, nothing in this section removes your right to bring a case in your local courts or to benefit from mandatory local consumer rights."),

  H1("16. Accessibility"),
  P("We design the Platform to meet WCAG 2.0 Level AA and progress toward WCAG 3.0 standards. If you have trouble using the Platform because of a disability, contact info@techfleet.network and we will do our best to help."),

  H1("17. Export Controls and Sanctions"),
  P("You may not use the Platform if you are in a country or are a person subject to U.S. or other applicable embargoes or sanctions, or if you appear on a U.S. or international restricted-party list. You agree to follow all applicable export control and sanctions laws."),

  H1("18. Notices and Electronic Communications"),
  P("We may send notices to you by email, by posting on the Platform, or by any other reasonable method. You agree to receive electronic communications from us and that they meet any legal requirement for written notice."),

  H1("19. Changes to These Terms"),
  P("We may change these Terms from time to time. When we make material changes, we will post the new version on the Platform and update the Effective Date. If the law requires, we will notify you and ask for consent before the change takes effect. Your continued use of the Platform after the change means you accept the new Terms."),

  H1("20. Miscellaneous"),
  P("These Terms, together with the Privacy Policy and Cookie Policy, are the entire agreement between you and Tech Fleet about the Platform. If any part of these Terms is found unenforceable, the rest stays in effect. Our failure to enforce any right is not a waiver of that right. You may not assign these Terms without our written consent; we may assign them as part of a merger, acquisition, or reorganization."),

  H1("21. Contact"),
  Mix([new TextRun("Email: "), new TextRun({ text: EMAIL, bold: true })]),
  P("Mailing address: Tech Fleet, Legal Department, Delaware, USA."),
]);

// ===========================================================================
// 4) TERMS AND CONDITIONS (programs/services)
// ===========================================================================

const termsCond = buildDoc([
  ...titleBlock("Terms and Conditions"),

  P([new TextRun({ text: "Plain-language summary: ", bold: true }),
    new TextRun("These Terms and Conditions are the rules for taking part in Tech Fleet programs, projects, classes, cohorts, mentoring, and any paid or donation-based services. They cover sign-ups, expectations, payments, refunds, and how disputes are handled.")]),

  H1("1. About These Terms"),
  Mix([new TextRun(`These Terms and Conditions (\u201CT&Cs\u201D) apply to your participation in any Tech Fleet program or service offered through `), new TextRun({ text: SITE, bold: true }), new TextRun(", including project teams, learning labs, masterclasses, cohorts, observerships, mentoring, certifications, events, and donations. They are in addition to our Terms of Use, Privacy Policy, and Cookie Policy.")]),

  H1("2. Eligibility"),
  P("You must be at least 18 years old, or at least 13 years old with verifiable parent or guardian consent and any other approval required by your country. Some programs have additional requirements (for example, professional background, time commitment, or country availability). We will tell you the requirements before you join."),

  H1("3. Application and Selection"),
  P("Participation in many of our programs is based on an application. We may ask you for information about your background, goals, time availability, and skills. Acceptance is not guaranteed. We may run interviews, reference checks, or skill assessments. We make selection decisions based on program needs and our nonprofit mission, and we do not discriminate on the basis of race, color, religion, national origin, sex, gender identity, sexual orientation, age, disability, veteran status, or any other characteristic protected by law."),

  H1("4. Code of Conduct"),
  P("All participants agree to follow our Code of Conduct, which requires respect, honesty, safety, and inclusion. Behavior that is harassing, discriminatory, threatening, dishonest, or that puts other participants or clients at risk is grounds for removal from the program without refund and may be reported to authorities."),

  H1("5. Your Commitments"),
  B("Take part actively in your assigned program for the time and tasks shown when you sign up."),
  B("Communicate openly with mentors, teammates, and Tech Fleet staff."),
  B("Protect confidential information you receive from Tech Fleet, clients, or teammates."),
  B("Complete required learning, surveys, and feedback when asked."),
  B("Follow client requirements, deadlines, and intellectual property rules for your project."),

  H1("6. Intellectual Property in Projects"),
  P("Unless we tell you otherwise in writing, work created during a Tech Fleet client project is owned by the client (or by Tech Fleet on behalf of the client). You give Tech Fleet and the client a worldwide, royalty-free license to use the work for their lawful purposes, and you waive any moral rights to the extent allowed by law. You may keep a copy of your contributions for your portfolio if the client allows it. Tech Fleet may also use your work to demonstrate program outcomes, with credit where reasonable."),

  H1("7. Confidentiality"),
  P("During programs you may receive confidential information about Tech Fleet, clients, or other participants. You agree to keep this information confidential and to use it only for the program. This duty continues after the program ends, for as long as the information stays non-public."),

  H1("8. Donations and Payments"),
  P("Tech Fleet is a nonprofit organization. Most programs are free for participants and supported by donations. If we ever offer paid programs, services, certifications, or merchandise:"),
  B("Prices, taxes, and applicable VAT, GST, sales tax, or similar charges will be shown before payment."),
  B("Payment is processed by a third-party payment processor (such as Stripe). We do not store full card numbers."),
  B("Donations are non-refundable except where required by law. Tech Fleet may issue tax receipts where eligible under U.S. and other applicable laws."),
  B("Subscriptions, if offered, will renew automatically until canceled. You can cancel any subscription at any time from your account; cancellation stops future charges but does not provide refunds for past charges, unless required by law."),

  H1("9. Refunds and Cancellations"),
  P("If you live in a jurisdiction with a statutory right to cancel a paid digital service (for example, the EU\u2019s 14-day right of withdrawal under the Consumer Rights Directive), you may cancel within the legal time limit by emailing info@techfleet.network. By starting a digital service before the cancellation period ends, you agree that you may lose your right of withdrawal once the service has been fully provided. We will refund eligible charges using the original payment method within the legally required time."),

  H1("10. Certifications and Outcomes"),
  P("Certificates of completion confirm that you have finished the listed program. They are not professional licenses or guarantees of employment, salary, or any specific outcome. We may revoke a certificate if it was issued in error or based on dishonest information."),

  H1("11. Recordings and Use of Likeness"),
  P("Some sessions, meetings, or events may be recorded. We will tell you in advance and you may choose not to appear on camera. By taking part in a session you know is being recorded, you grant Tech Fleet a worldwide, royalty-free license to use the recording for educational and promotional purposes. You may withdraw consent for future use of new recordings by emailing info@techfleet.network."),

  H1("12. Third-Party Tools"),
  P("Programs use third-party tools such as Discord, Google Workspace, Slack (where applicable), Miro, Notion, Zoom, Google Meet, and similar services. You must follow their terms of service. We are not responsible for those services or their availability."),

  H1("13. Suspension, Removal, and Termination"),
  P("We may suspend or remove you from a program if you break these T&Cs, the Code of Conduct, our Terms of Use, or the law, if you stop participating, or if we are required to by law or by a client. We will try to give notice when reasonable. Refunds for paid programs are at our discretion and as required by law."),

  H1("14. Volunteers and Independent Contractors"),
  P("Participation in Tech Fleet programs does not create an employment relationship between you and Tech Fleet or any client. Volunteers and contractors are responsible for their own taxes and insurance, except where Tech Fleet expressly agrees otherwise in writing."),

  H1("15. Disclaimers"),
  P("Programs and services are provided \u201Cas is\u201D and \u201Cas available.\u201D To the fullest extent permitted by law, Tech Fleet disclaims all warranties of any kind, including merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee any particular career, employment, certification, or learning outcome."),

  H1("16. Limitation of Liability"),
  P("To the fullest extent permitted by law, Tech Fleet, its directors, officers, employees, volunteers, and agents will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, revenue, data, goodwill, or other intangible losses, arising out of or relating to a program or service. Our total liability is limited to the amount you paid Tech Fleet for the program or service in the 12 months before the claim, or USD $100 if you paid less. Mandatory consumer protections under your local law are not affected."),

  H1("17. Indemnification"),
  P("To the extent permitted by law, you agree to defend, indemnify, and hold harmless Tech Fleet and its team from any claims, losses, liabilities, damages, costs, and expenses (including reasonable legal fees) arising from your participation, your work product, your breach of these T&Cs, or your violation of any law or third-party right."),

  H1("18. Force Majeure"),
  P("Neither party is responsible for delays or failures caused by events beyond reasonable control, such as natural disasters, war, civil unrest, government action, labor disputes, internet or utility outages, or pandemics."),

  H1("19. Anti-Bribery, Anti-Corruption, and Sanctions"),
  P("You agree to comply with the U.S. Foreign Corrupt Practices Act, the UK Bribery Act, and similar laws. You will not offer or accept bribes or kickbacks. You confirm you are not subject to economic or trade sanctions and are not on a U.S. or international restricted-party list. You will follow all applicable export-control laws."),

  H1("20. Governing Law and Dispute Resolution"),
  P("These T&Cs are governed by the laws of the State of Delaware, USA, without regard to conflict-of-laws rules. Any dispute will be brought exclusively in the state or federal courts located in Delaware, and you and Tech Fleet consent to personal jurisdiction there. If you live in the European Economic Area, the United Kingdom, Switzerland, Brazil, or another country with mandatory consumer protections, nothing in this section removes your right to bring a case in your local courts or to benefit from mandatory local rights."),
  P("Before filing a lawsuit, the parties agree to try to resolve the dispute informally by emailing info@techfleet.network and discussing it in good faith for at least 30 days."),

  H1("21. Privacy and Data Protection"),
  P("Personal information collected through programs is handled as described in our Privacy Policy. Where we act as a processor for a client (for example, when handling personal data on the client\u2019s behalf), the controller-processor terms required by GDPR Article 28, UK GDPR, and similar laws are part of our written agreement with that client."),

  H1("22. Accessibility and Reasonable Accommodation"),
  P("We aim to make our programs accessible and inclusive. If you need a reasonable accommodation to take part, contact info@techfleet.network and we will work with you in good faith."),

  H1("23. Changes to These T&Cs"),
  P("We may update these T&Cs from time to time. When we make material changes, we will post the new version and update the Effective Date. For active program participants, we will give reasonable notice and, where the law requires, ask for consent before the change applies to you."),

  H1("24. Contact"),
  Mix([new TextRun("Email: "), new TextRun({ text: EMAIL, bold: true })]),
  P("Mailing address: Tech Fleet, Programs Office, Delaware, USA."),
]);

// ===========================================================================
// 5) ACCESSIBILITY POLICY
// ===========================================================================

const accessibility = buildDoc([
  ...titleBlock("Accessibility Policy"),

  P([new TextRun({ text: "Plain-language summary: ", bold: true }),
    new TextRun("Tech Fleet is committed to digital accessibility for people with disabilities, seniors, and anyone who relies on assistive technology. We design, build, test, and maintain techfleet.network to meet or exceed WCAG 2.1 AA today and WCAG 2.2 AA / WCAG 3.0 \u201CSilver\u201D as those standards mature. This policy explains our standards, what we do, your legal rights in your country, and how to ask for help or file a complaint.")]),

  H1("1. Commitment Statement"),
  Mix([new TextRun(`${ENTITY} is committed to ensuring digital accessibility for people with disabilities and seniors across every country we operate in. We are continually improving the user experience for everyone by adhering to the current and upcoming versions of the Web Content Accessibility Guidelines (WCAG) published by the W3C Web Accessibility Initiative.`)]),
  P("Accessibility is a civil right. Our nonprofit mission \u2014 training the next generation of tech professionals \u2014 cannot succeed unless every learner, volunteer, mentor, client, and visitor can use this Platform on equal terms, regardless of disability, age, device, network, or assistive technology."),

  H1("2. Scope"),
  P("This policy applies to:"),
  B("All web content, applications, learning materials, emails, PDFs, videos, audio recordings, presentations, and downloadable documents we publish on or through techfleet.network."),
  B("Mobile and responsive views of the Platform on phones, tablets, laptops, and large displays."),
  B("Internal tools used by Tech Fleet staff, mentors, and volunteers when those tools are part of the program experience."),
  B("Procurement: any third-party software, vendor, or service we adopt going forward must meet our accessibility requirements (see Section 9)."),
  P("Some legacy third-party content embedded from external sites (for example, partner videos, donor portals, or external recordings) may not yet meet our standard. We mark those known limitations in Section 12 and work continuously to remediate or replace them."),

  H1("3. Standards We Conform To"),
  P("We design, build, and audit the Platform against the following technical standards. Where standards differ, we apply the strictest requirement."),
  B("W3C Web Content Accessibility Guidelines (WCAG) 2.1 Level AA \u2014 baseline conformance target."),
  B("W3C WCAG 2.2 Level AA \u2014 we meet all 2.2 success criteria, including 2.4.11 Focus Not Obscured (Minimum), 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum), 3.2.6 Consistent Help, 3.3.7 Redundant Entry, and 3.3.8 Accessible Authentication (Minimum)."),
  B("W3C WCAG 3.0 \u201CSilver\u201D \u2014 we track the working draft and adopt outcome-based testing (e.g., Bronze/Silver/Gold ratings) where it improves on 2.x."),
  B("W3C WAI-ARIA 1.2 Authoring Practices for custom interactive components."),
  B("EN 301 549 v3.2.1 \u2014 the harmonised European standard for ICT accessibility, which incorporates WCAG 2.1 AA and additional requirements for documents, software, hardware, and support services."),
  B("U.S. Section 508 of the Rehabilitation Act, as updated by the 2018 ICT Refresh, which incorporates WCAG 2.0 AA at minimum (we meet 2.1 AA)."),
  B("ISO/IEC 40500:2012 (international adoption of WCAG 2.0)."),
  B("ISO/IEC 30071-1:2019 \u2014 development of user interfaces that are accessible to people with disabilities."),
  B("CAN/ASC EN 301 549:2024 (Canada\u2019s adoption of EN 301 549)."),
  B("Web accessibility recommendations issued by national authorities in jurisdictions where we operate, where they exceed WCAG."),

  H1("4. Legal Framework We Comply With"),
  P("This policy is designed to meet or exceed accessibility obligations everywhere on Earth where users can reach the Platform. The list below is illustrative, not exhaustive; we monitor changes and update this policy as laws evolve."),

  H2("4.1 North America"),
  B("United States \u2014 Americans with Disabilities Act (ADA) Titles II and III, including DOJ guidance treating commercial websites as places of public accommodation; Section 504 of the Rehabilitation Act; Section 508 of the Rehabilitation Act; the 21st Century Communications and Video Accessibility Act (CVAA); the Air Carrier Access Act for any travel-adjacent content; California Unruh Civil Rights Act; New York State and New York City Human Rights Laws; Colorado HB21-1110; Minnesota State accessibility standards."),
  B("Canada \u2014 Accessible Canada Act (ACA, 2019) and its regulations; Accessibility for Ontarians with Disabilities Act (AODA), including the Integrated Accessibility Standards Regulation (IASR) and WCAG 2.0 AA web standard; Accessibility for Manitobans Act; Nova Scotia Accessibility Act; Quebec\u2019s Standard sur l\u2019accessibilit\u00E9 du Web (SGQRI 008); British Columbia Accessible BC Act."),
  B("Mexico \u2014 Ley General para la Inclusi\u00F3n de las Personas con Discapacidad and NOM-008-SSA3 where applicable."),

  H2("4.2 European Union, EEA, and United Kingdom"),
  B("European Accessibility Act (Directive (EU) 2019/882), enforceable from 28 June 2025, covering e-commerce, e-books, banking, transport, and consumer ICT services."),
  B("Web Accessibility Directive (Directive (EU) 2016/2102) for public-sector bodies, applying EN 301 549."),
  B("EU Charter of Fundamental Rights (Article 21 \u2014 non-discrimination; Article 26 \u2014 integration of persons with disabilities)."),
  B("United Kingdom Equality Act 2010 (including the duty to make reasonable adjustments) and the Public Sector Bodies (Websites and Mobile Applications) Accessibility Regulations 2018."),
  B("Ireland Disability Act 2005 and Equal Status Acts."),
  B("Germany BITV 2.0 and Behindertengleichstellungsgesetz (BGG); Barrierefreiheitsst\u00E4rkungsgesetz (BFSG, in force June 2025)."),
  B("France Loi n\u00B0 2005-102 and RGAA 4.1."),
  B("Italy Stanca Act (Law 4/2004) and AgID guidelines."),
  B("Spain Royal Decree 1112/2018."),
  B("Netherlands Tijdelijk besluit digitale toegankelijkheid overheid."),
  B("Nordic accessibility laws in Denmark, Sweden, Norway, Finland, and Iceland implementing EU directives."),
  B("Switzerland Federal Act on the Elimination of Discrimination against People with Disabilities (BehiG) and P028 web accessibility standard."),

  H2("4.3 Latin America and the Caribbean"),
  B("Brazil Lei Brasileira de Inclus\u00E3o (Law 13.146/2015) and ABNT NBR 17225 / e-MAG accessibility model."),
  B("Argentina Ley 26.653 \u2014 Acceso de la Informaci\u00F3n P\u00FAblica."),
  B("Chile Ley 20.422 and Decreto Supremo 1/2015."),
  B("Colombia Ley 1618/2013 and NTC 5854."),
  B("Mexico, Peru, Uruguay, Costa Rica, Panama, and Ecuador laws implementing the UN CRPD."),

  H2("4.4 United Nations and International"),
  B("UN Convention on the Rights of Persons with Disabilities (CRPD), Articles 9 (Accessibility) and 21 (Freedom of expression and access to information)."),
  B("UN Sustainable Development Goals 4, 10, and 11 \u2014 inclusive education, reduced inequality, and inclusive cities."),
  B("Marrakesh Treaty for accessible-format works."),

  H2("4.5 Asia-Pacific"),
  B("Australia Disability Discrimination Act 1992 and Disability (Access to Premises \u2013 Buildings) Standards; Australian Government Digital Service Standard requiring WCAG 2.1 AA."),
  B("New Zealand Human Rights Act 1993 and NZ Government Web Accessibility Standard 1.1."),
  B("Japan JIS X 8341-3:2016, aligned with WCAG 2.0."),
  B("South Korea Act on Welfare of Persons with Disabilities and KS X OT0003."),
  B("China GB/T 37668-2019 and the Law on the Protection of Persons with Disabilities."),
  B("India Rights of Persons with Disabilities Act 2016 and GIGW 3.0 / IS 17802."),
  B("Singapore Enabling Masterplan and IMDA accessibility guidelines."),
  B("Hong Kong Disability Discrimination Ordinance and OGCIO web accessibility recognition scheme."),
  B("Taiwan Web Accessibility Guidelines 2.0."),
  B("Thailand, Malaysia, Indonesia, Philippines, Vietnam laws implementing the UN CRPD."),

  H2("4.6 Middle East and Africa"),
  B("Israel Equal Rights for Persons with Disabilities Law and IS 5568 (WCAG 2.0 AA)."),
  B("United Arab Emirates Federal Law No. 29 of 2006 and TDRA Web Accessibility Policy v2."),
  B("Saudi Arabia Digital Government Authority accessibility standards."),
  B("South Africa Promotion of Equality and Prevention of Unfair Discrimination Act and SANS standards."),
  B("Kenya, Nigeria, Ghana, Egypt, Morocco \u2014 national disability and ICT laws aligned with the UN CRPD."),

  H1("5. What \u201CAccessibility\u201D Means Here"),
  P("Accessibility means designing the Platform so that people of all abilities \u2014 including people who are blind, have low vision, are color-blind, are Deaf or hard of hearing, are deaf-blind, have motor or dexterity differences, have cognitive, learning, or neurodivergent profiles (such as autism, ADHD, dyslexia, dyscalculia), or have temporary or situational impairments \u2014 can perceive, understand, navigate, contribute to, and complete every meaningful task. We also account for older adults and users on slow networks, small screens, or low-end devices."),

  H1("6. Conformance Approach (POUR)"),
  H2("6.1 Perceivable"),
  B("Text alternatives (alt text) for all non-decorative images, charts, and icons."),
  B("Captions for all pre-recorded video; live captions for live events; audio descriptions for video where meaning depends on visuals; transcripts for podcasts and audio-only content."),
  B("Sufficient color contrast (\u22654.5:1 for body text, \u22653:1 for large text and UI components and graphical objects), independently verified by automated and manual checks."),
  B("Information is never conveyed by color alone; we pair color with text, icons, or patterns."),
  B("Content reflows on screens as narrow as 320 CSS pixels without horizontal scrolling and supports user-controlled text spacing per WCAG 1.4.12."),
  B("No autoplaying audio; media has accessible controls."),

  H2("6.2 Operable"),
  B("Full keyboard support \u2014 every interactive element is reachable and usable with Tab/Shift+Tab/Enter/Space/Arrow keys with a visible focus ring, no keyboard traps, and no positive tabindex values."),
  B("Skip-to-content links and consistent landmark structure (header, nav, main, footer, complementary)."),
  B("Touch targets are at least 24\u00D724 CSS pixels (WCAG 2.2 Minimum) and we aim for 44\u00D744 (WCAG 2.5.5 Enhanced) on primary controls."),
  B("Sessions warn before time-out and let users extend, save, or restart per WCAG 2.2.1; we do not silently log users out and lose their work."),
  B("No content flashes more than three times per second."),
  B("Animation, parallax, and motion respect prefers-reduced-motion at the OS level."),
  B("Drag operations have a single-pointer alternative (WCAG 2.5.7)."),

  H2("6.3 Understandable"),
  B("Plain-language content at roughly a 9th-grade reading level wherever feasible; jargon is defined or linked."),
  B("HTML lang attribute is set on every page; mid-content language switches are marked."),
  B("Form labels, instructions, and error messages are programmatically associated with the right field, are descriptive, and suggest a fix."),
  B("Consistent navigation, consistent component naming, and a consistent help mechanism (Fleety chatbot + email contact + this policy) on every page (WCAG 3.2.6)."),
  B("Forms do not re-ask for information we already have on file (WCAG 3.3.7)."),
  B("Authentication never depends on a cognitive function test that has no alternative; password managers, copy/paste, and TOTP via a standard authenticator app are supported (WCAG 3.3.8)."),

  H2("6.4 Robust"),
  B("Semantic HTML5 with valid ARIA roles, states, and properties only when native elements are insufficient."),
  B("Live regions announce status messages (loading, success, error) without forcing focus changes (WCAG 4.1.3)."),
  B("Compatibility with current and recent versions of NVDA, JAWS, VoiceOver (macOS and iOS), TalkBack, Narrator, and Dragon NaturallySpeaking on supported browsers (current and prior major version of Chrome, Edge, Firefox, and Safari)."),
  B("Progressive enhancement \u2014 the Platform remains usable when JavaScript is partially blocked or slow to load."),

  H1("7. Platform Features That Back This Up"),
  P("This policy is enforced by code, not just by intent. The Platform ships the following accessibility features today:"),
  B("Skip links and a single semantic <main> landmark on every route."),
  B("Visible 2-px focus ring on every interactive element, never removed by stylesheets."),
  B("Light and dark themes that both meet WCAG 1.4.3 and 1.4.11 contrast requirements; the user\u2019s OS preference is respected by default and a manual toggle is always available."),
  B("Reduced-motion support \u2014 animations, transitions, and parallax are removed or replaced with instant transitions when prefers-reduced-motion: reduce is set."),
  B("Resizable text to 200% without loss of content or function; layouts reflow on screens \u2265320 CSS pixels."),
  B("ARIA live regions for toast notifications, form errors, and asynchronous loading states."),
  B("All form fields have programmatic labels, descriptions for complex inputs, and inline error messages with suggestions."),
  B("Idle session warnings 30 minutes after the last interaction with a one-click extend option."),
  B("TOTP-based two-factor authentication compatible with Google Authenticator, 1Password, Bitwarden, and other standard authenticators \u2014 no SMS-only or biometric-only paths that could exclude users."),
  B("Keyboard shortcuts include a modifier or can be disabled, per WCAG 2.1.4."),
  B("All third-party embeds (videos, recordings, knowledge base) are tested for accessibility before launch and remediated or replaced if they fail."),
  B("A continuous accessibility test suite runs in CI on every pull request, including axe-core checks and a custom WCAG 2.1 AA + 2.2 AA checklist (see e2e/a11y/) covering all Level A and AA success criteria."),
  B("Lighthouse and Web Vitals (LCP, INP, CLS) budgets are enforced so the Platform stays usable on low-bandwidth and low-power devices."),
  B("Behavior-driven (BDD) accessibility scenarios are stored in the database and gate releases."),

  H1("8. Testing and Auditing"),
  P("We combine automated, manual, and lived-experience testing:"),
  B("Automated \u2014 axe-core, Lighthouse, Pa11y, ESLint jsx-a11y, and color-contrast linters run in CI on every change."),
  B("Manual \u2014 keyboard-only walkthroughs of every release; screen-reader walkthroughs with NVDA, JAWS, VoiceOver, and TalkBack at least quarterly; mobile and zoom testing on iOS and Android."),
  B("Independent audits \u2014 a third-party accessibility audit is commissioned at least annually and after any major redesign; results inform a public remediation plan."),
  B("User testing \u2014 we recruit testers with disabilities for usability sessions on major new features."),
  B("Document accessibility \u2014 PDFs are tagged, have a logical reading order, language metadata, and bookmarks; DOCX files use real heading styles, alt text, and table headers; presentations follow accessible-slide guidance."),

  H1("9. Procurement and Vendor Accountability"),
  P("Before adopting a new tool, plug-in, or service we:"),
  B("Request an Accessibility Conformance Report (ACR) using the Voluntary Product Accessibility Template (VPAT 2.5) covering WCAG 2.1 AA, Section 508, and EN 301 549."),
  B("Test the tool with keyboard-only navigation and at least one screen reader."),
  B("Document any gaps and either require remediation in the contract, supply an accessible alternative path inside the Platform, or do not adopt the tool."),
  B("Re-evaluate vendors annually."),

  H1("10. Training and Culture"),
  P("Every engineer, designer, content writer, and program manager at Tech Fleet completes accessibility onboarding within 30 days of joining and refresher training annually. Training covers WCAG 2.1/2.2/3.0, ARIA Authoring Practices, inclusive language, disability etiquette, and how to test with assistive technology. Accessibility is a release-blocking criterion in code review, design review, and content review."),

  H1("11. Reasonable Accommodations"),
  P("If you need a reasonable accommodation to apply for, participate in, or complete any Tech Fleet program \u2014 for example, extended time on a quiz, an alternative format for a document, a different communication channel, captioning for a live event that does not yet have it, or assistive equipment loan \u2014 contact info@techfleet.network. We will work with you in good faith and at no cost to you, in line with the ADA, the UK Equality Act 2010, the EU Accessibility Act, the UN CRPD, and any other applicable law in your country. We will not refuse an accommodation unless granting it would impose an undue hardship as defined by your local law, and even then we will offer the closest available alternative."),

  H1("12. Known Limitations"),
  P("We are transparent about gaps and we keep this list current."),
  B("A small number of legacy training videos do not yet have audio descriptions; transcripts and captions are available, and we are remediating on a published schedule."),
  B("Some third-party embeds (for example, donor portals or partner recordings) may not fully meet WCAG 2.1 AA. We provide accessible alternatives or contact info on request."),
  B("Beta features may be released for limited testing before final accessibility verification; they are clearly labeled \u201Cbeta\u201D and excluded from required workflows."),
  P("If you find a barrier that is not on this list, please tell us using Section 13. We treat accessibility defects as priority bugs."),

  H1("13. Feedback, Complaints, and Enforcement"),
  P("We welcome your feedback. To report an accessibility barrier, request an alternative format, or ask a question:"),
  Mix([new TextRun("Email: "), new TextRun({ text: EMAIL, bold: true })]),
  P("Mailing address: Tech Fleet, Accessibility Office, 8 The Grn, Suite 6369, Dover, Delaware 19901, USA."),
  P("In your message, please tell us: the page or feature involved (with a URL if possible), the barrier you experienced, the assistive technology, browser, and operating system you were using, and the best way to reach you."),
  P("We will acknowledge your message within 2 business days and provide a substantive response within 10 business days. If we cannot fix the issue immediately, we will give you a target date and an interim alternative way to complete your task."),
  P("If you are not satisfied with our response, you may escalate to:"),
  B("United States \u2014 the U.S. Department of Justice (ADA.gov), the U.S. Access Board, or your State Attorney General."),
  B("European Union / EEA \u2014 the national enforcement body designated under the European Accessibility Act in your country."),
  B("United Kingdom \u2014 the Equality and Human Rights Commission (EHRC)."),
  B("Canada \u2014 the Accessibility Commissioner under the Accessible Canada Act, or your provincial body (e.g., Ontario AODA Office)."),
  B("Australia \u2014 the Australian Human Rights Commission."),
  B("Other jurisdictions \u2014 your national disability rights authority or ombudsperson."),
  P("We will not retaliate against anyone who files an accessibility complaint in good faith."),

  H1("14. Governance and Accountability"),
  P("Tech Fleet\u2019s Executive Director is the executive sponsor for accessibility. The Director of Engineering is the responsible owner. The Accessibility Working Group meets at least monthly, reviews audit results, prioritises remediation, and reports to the Board of Directors at least quarterly. This policy is reviewed at least annually and whenever a referenced standard or law changes materially."),

  H1("15. Continuous Improvement"),
  P("Accessibility is never \u201Cdone.\u201D We commit to:"),
  B("Publishing an updated Accessibility Statement at least once per year, including audit results and a remediation roadmap."),
  B("Tracking accessibility defects in the same backlog as security and reliability defects, with the same severity scale."),
  B("Sharing what we learn with the wider nonprofit and EdTech community."),

  H1("16. Effective Date and Changes"),
  Mix([new TextRun("Effective Date: "), new TextRun({ text: EFFECTIVE, bold: true }), new TextRun("    |    Last Updated: "), new TextRun({ text: EFFECTIVE, bold: true })]),
  P("We may update this policy as standards, laws, and our Platform evolve. Material changes will be posted here with a revised Effective Date and, where required, communicated directly to affected users."),

  H1("17. Contact"),
  Mix([new TextRun("Email: "), new TextRun({ text: EMAIL, bold: true })]),
  P("Mailing address: Tech Fleet, Accessibility Office, 8 The Grn, Suite 6369, Dover, Delaware 19901, USA."),
]);

// ----- write all -----------------------------------------------------------

(async () => {
  await save("Privacy-Policy.docx", privacy);
  await save("Cookie-Policy.docx", cookies);
  await save("Terms-of-Use.docx", termsUse);
  await save("Terms-and-Conditions.docx", termsCond);
  await save("Accessibility-Policy.docx", accessibility);
})();
