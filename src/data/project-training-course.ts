export interface CourseLesson {
  id: string;
  title: string;
  youtubeId: string | null;
  sourceUrl: string;
  content: string;
}

export interface CourseSection {
  title: string;
  lessons: CourseLesson[];
}

export const PROJECT_TRAINING_SECTIONS: CourseSection[] = [
  {
    title: "Getting Started with Project Training",
    lessons: [
      {
        id: "pt-start-1",
        title: "What Is Project Training?",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook",
        content: `**Understanding Project Training at Tech Fleet**

Project training is an apprenticeship-style learning experience where you work alongside teammates from different functions to solve real problems for nonprofit organizations.

**Key Points:**

• Project training is an educational service — you are a trainee, not an employee
• Teams are fully cross-functional: everyone works across all functions
• You partner with real nonprofit clients who have 501(c)(3) public charity status
• There are no "bosses" — teammates share leadership and decision-making
• The focus is on learning teamwork dynamics, not delivering perfect work

**What You'll Experience:**

1. Working in a self-organized agile team
2. Collaborating across functions (design, development, research, strategy)
3. Making collective decisions as a team
4. Building a case study to showcase your experience
5. Practicing service leadership with your teammates`,
      },
      {
        id: "pt-start-2",
        title: "Time Commitment and Expectations",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/training-versus-volunteering",
        content: `**What to Expect as a Project Trainee**

**Weekly Time Commitment:**
• 15 to 20 hours per week (flexible scheduling)
• You set your own hours — there are no rigid schedules
• Commit to one project training at a time

**Your Responsibilities:**
1. Participate actively in team ceremonies (sprint planning, standups, retrospectives)
2. Agree to duties using the RACI chart with your teammates
3. Communicate openly and transparently with your team
4. Support your teammates' growth and learning
5. Share leadership — don't wait to be told what to do

**What This Is NOT:**
• Not a job — you won't be paid
• Not volunteering — this is training for your benefit
• Not school — there are no grades or "right answers"
• Not a solo endeavor — everything is team-based

**How to List on Your Resume:**
List Tech Fleet as the organization under which you trained. Showcase the team functions you performed and the nonprofit clients you partnered with.`,
      },
      {
        id: "pt-start-3",
        title: "The RACI Chart and Team Agreements",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/what-does-it-mean-to-be-a-cross-functional-teammate",
        content: `**How Teams Organize Work**

Agile teams at Tech Fleet use RACI charts to organize how work gets done. RACI stands for:

**R — Responsible:** The person(s) doing the work
**A — Accountable:** The person who ensures it gets done (not a "boss" — just the point person)
**C — Consulted:** People whose input is sought before a decision
**I — Informed:** People who are kept updated on progress

**How It Works on Tech Fleet Teams:**

1. During sprint planning, the team reviews upcoming work together
2. Each teammate volunteers for responsibilities based on what they want to learn
3. The team fills out the RACI chart collaboratively — no one assigns work to others
4. Teammates can change their RACI commitments each sprint as they grow

**Cross-Functional Outputs:**
• RACI Chart — who does what
• Team Process Map — how work flows
• Project Plan — what the team aims to achieve
• Sprint Goals — what the team commits to each sprint

**Remember:** The more collaborative a team is across functions, the more decision-making power it has. No single person should dictate how the team works.`,
      },
    ],
  },
  {
    title: "Working with Nonprofit Clients",
    lessons: [
      {
        id: "pt-client-1",
        title: "Understanding Nonprofit Partners",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/teammate-faq",
        content: `**Our Nonprofit Partners**

Tech Fleet partners with other nonprofits who have already obtained 501(c)(3) public charity status. These organizations need help solving real problems, and your training team provides that support.

**What to Know About Working with Clients:**

1. **They are partners, not employers** — Your relationship is collaborative, not hierarchical
2. **They have real needs** — The problems you solve create genuine impact
3. **Communication is key** — Teams hold client demos to share progress and gather feedback
4. **You represent Tech Fleet** — Be professional, respectful, and empathetic

**Typical Client Engagement:**
• Initial discovery to understand their challenges
• Sprint-based work cycles with regular check-ins
• Deliverables presented through team demos
• Retrospectives to reflect on what went well and what to improve

**Remember:** The training is for YOUR benefit as a learner. The client benefits from your team's work, but the primary goal is your growth as a cross-functional teammate.`,
      },
      {
        id: "pt-client-2",
        title: "Building Your Case Study",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/case-study-creation-for-teammates",
        content: `**Telling the Story of Your Experience**

Every project trainee should create a case study that tells the story of their training experience. This is one of the most valuable outputs of your time at Tech Fleet.

**Great Case Studies Include:**

1. **A Story Arc** — Start with the problem and show how your team progressed through it
2. **Measurable Outcomes** — Show how you measured or would measure success
3. **Focus on the "Why"** — Explain the reasoning behind your team's decisions
4. **User/Audience Perspectives** — Show how you considered real people in your work
5. **Conflict and Resolution** — Discuss challenges and how your team grew through them
6. **Cross-Functional Collaboration** — Highlight how you worked as a unified team

**Tips for a Strong Case Study:**
• Use visuals — screenshots, diagrams, before/after comparisons
• Be specific — use numbers, dates, and concrete examples
• Show your personal growth — what did YOU learn?
• Highlight team dynamics — how did shared leadership work?
• Keep it concise — quality over quantity`,
      },
    ],
  },
];

export const ALL_PROJECT_TRAINING_LESSONS = PROJECT_TRAINING_SECTIONS.flatMap(
  (s) => s.lessons
);

export const ALL_PROJECT_TRAINING_LESSON_IDS = ALL_PROJECT_TRAINING_LESSONS.map(
  (l) => l.id
);

export const TOTAL_PROJECT_TRAINING_LESSONS = ALL_PROJECT_TRAINING_LESSON_IDS.length;
