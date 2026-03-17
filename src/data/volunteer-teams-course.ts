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

export const VOLUNTEER_TEAMS_SECTIONS: CourseSection[] = [
  {
    title: "Getting Started as a Volunteer",
    lessons: [
      {
        id: "vt-start-1",
        title: "What Is Volunteer Work at Tech Fleet?",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/start-the-teammate-handbook-here/types-of-teamwork-in-the-community",
        content: `**Volunteering for Tech Fleet Professional Association**

Community members can get involved in our organization — a nonprofit with 501(c)(3) public charity status — as nonprofit volunteers. Volunteers contribute to the mission and operations of Tech Fleet itself.

**Key Differences from Project Training:**

| | Project Training | Volunteering |
|---|---|---|
| **Purpose** | Learning & growth | Contributing to Tech Fleet's mission |
| **Time** | 15-20 hrs/week | As little as 1 hour/week |
| **Experience** | No experience needed | May require higher experience levels |
| **Focus** | Your development | Organizational impact |

**What Volunteers Do:**
• Work on teams that support Tech Fleet's operations and growth
• Contribute to the central roadmap set by the Tech Fleet board of directors
• Apply cross-functional teamwork principles in real organizational work
• Help build and improve community programs and services

**Who Can Volunteer:**
Anyone in the community can explore volunteer opportunities. Some roles may expect higher levels of experience, but the culture remains collaborative and growth-oriented.`,
      },
      {
        id: "vt-start-2",
        title: "Volunteer Time Commitment",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/training-versus-volunteering",
        content: `**Flexible Commitment for Real Impact**

Volunteering at Tech Fleet is designed to be accessible and flexible.

**Time Expectations:**
• As little as 1 hour per week
• No rigid schedules or required hourly commitments
• You choose how much time you can dedicate
• Flexible async and sync working options

**Volunteer Responsibilities:**
1. Communicate your availability honestly with your team
2. Follow through on commitments you make
3. Apply the same agile teamwork principles as project training
4. Support your fellow volunteers' growth
5. Contribute to the goals set in the organizational roadmap

**Important Notes:**
• Volunteer roles are unpaid — this is service to the community
• You are a volunteer worker for Tech Fleet Professional Association
• Your contributions directly impact the community's mission
• Volunteering and project training can happen at different times`,
      },
    ],
  },
  {
    title: "Volunteer Team Dynamics",
    lessons: [
      {
        id: "vt-dynamics-1",
        title: "How Volunteer Teams Operate",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/sharing-leadership-with-teammates",
        content: `**Shared Leadership in Volunteer Teams**

Just like project training teams, volunteer teams operate with shared leadership. No single person is "in charge" — everyone contributes their strengths and supports each other.

**How Volunteer Teams Work:**

1. **Roadmap-Driven:** Volunteer teams work from the central roadmap created by the Tech Fleet board of directors
2. **Self-Organized:** Teams decide together how to approach their work
3. **Cross-Functional:** Volunteers contribute across different types of work, not just their specialty
4. **Agile Principles:** Sprint-based work with regular check-ins and retrospectives

**Shared Leadership Means:**
• Everyone makes decisions together
• Ownership is distributed across the team
• No one waits to be told what to do
• Everyone supports each other's growth
• Teammates use RACI charts to clarify responsibilities

**Communication Expectations:**
• Be direct and clear in your communication
• Respect different working styles and time zones
• Use async communication when possible
• Come to sync meetings prepared and ready to contribute`,
      },
      {
        id: "vt-dynamics-2",
        title: "Finding Your Volunteer Role",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/commitment-vs.-job-function-vs.-people-on-teams",
        content: `**Choosing How You Contribute**

Volunteering at Tech Fleet isn't about filling a "job position." It's about choosing duties that align with your skills and what you want to contribute.

**Understanding Roles vs. Duties:**
• A **role** is a set of duties — not a job title
• A **duty** is a commitment of activities you carry out
• One person can have many duties across functions
• You choose your level of involvement each cycle

**Available Volunteer Areas:**
1. **Community Operations** — Help run programs, events, and member support
2. **Content & Communications** — Create educational materials, newsletters, social media
3. **Technology** — Build and maintain community platforms and tools
4. **Strategy & Growth** — Research, partnerships, and organizational development
5. **Education & Training** — Help design and facilitate learning programs

**Getting Started:**
• Review current volunteer opportunities
• Talk to existing volunteers about their experience
• Start with a small commitment and grow from there
• Attend volunteer team meetings to see what resonates

**Remember:** You're not locked into one area. Cross-functional contribution is encouraged and celebrated.`,
      },
    ],
  },
];

export const ALL_VOLUNTEER_LESSONS = VOLUNTEER_TEAMS_SECTIONS.flatMap(
  (s) => s.lessons
);

export const ALL_VOLUNTEER_LESSON_IDS = ALL_VOLUNTEER_LESSONS.map(
  (l) => l.id
);

export const TOTAL_VOLUNTEER_LESSONS = ALL_VOLUNTEER_LESSON_IDS.length;
