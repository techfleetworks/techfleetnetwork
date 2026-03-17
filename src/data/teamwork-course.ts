export interface TeamworkLesson {
  id: string;
  title: string;
  youtubeId: string | null;
  sourceUrl: string;
  /** Markdown-ish content displayed in the lesson panel */
  content: string;
}

export interface TeamworkCourseSection {
  title: string;
  lessons: TeamworkLesson[];
}

export const TEAMWORK_COURSE_SECTIONS: TeamworkCourseSection[] = [
  {
    title: "Introduction",
    lessons: [
      {
        id: "tw-intro-1",
        title: "Introduction to the Teammate Handbook",
        youtubeId: "xkX9Mxt_688",
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/start-the-teammate-handbook-here/introduction-to-the-teammate-handbook",
        content: `This community is here to make change in the world. We are the change that the work world needs for the future. In order to be the change, we need to lead the change. We seek to make different kinds of work cultures. We seek to change who gets to be in leadership. We seek to build teams that are empowered to solve problems together.

We are building a culture of empowered teams all over this community. This doesn't just happen through project training, but in every team-based interaction we have. Every kind of team should follow the same principles and live the same philosophies to empower each other to succeed.

This handbook teaches you the rigors of all kinds of empowered teamwork that happens in this community: project training, volunteer work, and class work. By the end of the handbook you will know how to get involved in the different kinds of empowered teams that our community offers on your way to your own growth.`,
      },
      {
        id: "tw-intro-2",
        title: "Who Should Read the Teammate Handbook?",
        youtubeId: null,
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/start-the-teammate-handbook-here/who-should-read-the-teammate-handbook",
        content: `**All Community Members Should Read This Handbook!**

If you want to get involved in team-based problem solving of any kind, this handbook is for you. It will provide valuable information about the different kinds of teamwork we do in this community and how to get involved. It's essential reading for all kinds of teammates: project trainees, volunteers, and classmates.`,
      },
      {
        id: "tw-intro-3",
        title: 'What Happened to "Co-Leads" and "Apprentices"?',
        youtubeId: "Y5jvKzFAkp4",
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/start-the-teammate-handbook-here/what-happened-to-co-leads-and-apprentices",
        content: `**Building an Agile Culture**

Our community doesn't just teach agile and cross-functional teamwork. We live it. Everything members do should be cross-functional and should follow the agile philosophies.

We started building an agile cross-functional team culture in 2024. Our training programs built ways for people to model behavior of agile teammates.

**What Changed in 2025**

We measured impact in our project training, and found the dynamic between "co-leads" and "apprentices" to be hindering. They behaved as bosses and employees no matter how much agile materials they read.

We changed our project training so that there are only "teammates" instead of "co-leads and apprentices." Cross-functional teamwork improved a whopping 20% on project training teams.

This means any time you join a team, whether it be as a volunteer, a board member, a contributor, or a project trainee, you are a "teammate." Your title is not as important as the activities you commit to as a part of a group.`,
      },
      {
        id: "tw-intro-4",
        title: "Teammate FAQ",
        youtubeId: null,
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/teammate-faq",
        content: `**Frequently Asked Questions**

**What kinds of teams can I join?**
There are three different kinds of teams: (1) Project training — apprenticeship training working alongside people in different functions to solve problems for a nonprofit. (2) Volunteering for our organization — signing up to volunteer for the nonprofit. (3) Class training — joining cohort-based classes to train in different topics.

**Why does Tech Fleet focus on teamwork dynamics over skills?**
We believe that empowered team success has nothing to do with your skills. It has everything to do with your team's dynamics of collective decision making, growth support, and healthy risk taking. No one single person makes or breaks the success of an empowered team.

**How many project-based teams can I join?**
We encourage you to commit to only what you can handle. We ask that you commit to one single project training at a time.

**What's the weekly time commitment as a teammate?**
• As a project trainee — 15 to 20 hours weekly (flexible).
• As a nonprofit volunteer — As little as 1 hour a week.
• As a classmate — Live classes plus recordings for async learning.

**What kinds of clients do you work with?**
For project training we partner with other nonprofits who have already obtained 501(c)(3) public charity status.

**Are teams led by experts?**
Not at all! We are a peer-to-peer training ecosystem. No one is providing answers. No one is preventing failure.

**Do I get paid as a teammate?**
Right now we don't offer paid roles for any project training. The nonprofit volunteer roles are unpaid.

**Do I have to pay to be a teammate?**
Project training and volunteering are free. Class training requires a registration fee (typically $50).`,
      },
    ],
  },
  {
    title: "Learning in Tech Fleet",
    lessons: [
      {
        id: "tw-learn-1",
        title: "Our Approach to Learning",
        youtubeId: "ea4dSBDcot8",
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/start-the-teammate-handbook-here/our-approach-to-learning",
        content: `**Leveling Up in Agile is Not About Your Skills or Experience**

You may think expert Agile teams are very experienced in what they do. This is a false perception. Expert Agile teams are experts in navigating uncertainty, pivoting, and supporting growth of others. They are not necessarily experts in hard skills.

Agile teamwork is not really about producing work itself. Any one person with skills can perform work. Not all teams can perform work efficiently. To work as a unified Agile team, teams must look past skills and tight deadlines, providing environments for experimentation, risk taking, learning, and personal growth.

**Agile Teams Help Each Other Grow**

Teams that are Agile have foundations of active listening, empathy, understanding, learning, and support. They make their own calls about how to prioritize work. Expert Agile teams provide space for others to disagree, fail "fast" together, and look in reflection.

**Tech Fleet's Learning Environment**

Peers learn from other peers. No one is the "expert" or "boss," and everybody is learning together. You don't need any experience to get into project training or volunteer work.

**Service Leadership**

Being a Service leader means you're not telling people what to do. You are their guide, empowering them to find the answer on their own. Everyone shares leadership on agile teams.

**Learning by Doing**

In school you're taught how to deliver a perfect, finished end result. In practice, product teams achieve things through quick, continuous delivery. In Tech Fleet it's about progress over perfection.

**Team Structure**

We have a fully cross-functional structure. People who are teammates have no titles, but they agree to whatever work they want to do across functions.`,
      },
      {
        id: "tw-learn-2",
        title: "Types of Teamwork in the Community",
        youtubeId: null,
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/start-the-teammate-handbook-here/types-of-teamwork-in-the-community",
        content: `**Project Training Teammates**

Teammates who are part of apprenticeship trainings work together across functions to solve problems with nonprofits. Our training programs are built around cross-functional teamwork.

**Volunteer Teammates**

Community members can get involved in our organization (a nonprofit with 501(c)(3) public charity status) as nonprofit volunteers. People can serve as nonprofit volunteers to work on teams and contribute to change. Volunteers operate off of the central roadmap that the Tech Fleet board of directors puts together.

**Class-based Teammates**

People in our community can join class-based training, also built around cross-functional teamwork. Classes are practical and lab-based, offering chances to build real experience while also learning the theory of teamwork and agile.`,
      },
    ],
  },
  {
    title: "Teammate Expectations",
    lessons: [
      {
        id: "tw-expect-1",
        title: "Training Versus Volunteering",
        youtubeId: "9bEj3Ts0ci8",
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/training-versus-volunteering",
        content: `**Definition of Apprenticeship Training**

When you are participating in Tech Fleet project training, you are a trainee learning how to work in an Agile cross-functional team environment. You are NOT a volunteer!

Project training is meant to be a safe environment to learn how to do something for the first time. People training on teams should not expect to carry out perfect work. This is not a job — it's an apprenticeship training.

**Project Trainees**
• Project training is an educational service, not volunteer work
• No requirement for specific schedules or hours each week
• The training is for the sole benefit of community members, not clients
• Trainees are not entitled to wages

**Volunteers**
• Volunteers are volunteer workers for Tech Fleet Professional Association, a nonprofit with 501(c)(3) status
• Volunteers do not hold specific schedules or required hourly commitments
• Volunteers may be expected to hold higher levels of experience

**How to Put Tech Fleet Training on Resumes**
List Tech Fleet as the organization under which you trained. Showcase the kinds of team functions you did and the nonprofit clients you partnered with in your training.`,
      },
      {
        id: "tw-expect-2",
        title: "What Does It Mean to Be a Cross-Functional Teammate?",
        youtubeId: "m447hV1IPBY",
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/what-does-it-mean-to-be-a-cross-functional-teammate",
        content: `**Defining "Cross-Functional Teammate"**

A "Cross-functional" team means:
1. Teammates perform work across different functions
2. The team has no "departments" or "silos" of isolated work; they all work together
3. Teammates get involved in work according to their agreed upon RACI responsibilities

**Benefits of Cross-Functional Teamwork**

1. **It fosters deeper ownership** — Giving teammates a voice and abilities to decide how they want to proceed is powerful.
2. **It allows people to grow** — You don't need to be experienced to try new kinds of work if your team provides opportunities.
3. **It prevents "silos" and is less risky** — When teammates share responsibility, they can always progress even if someone leaves the team.

**How Cross-Functional Teams Function Without Titles or Departments**

Cross-functional teams float across responsibilities. When prioritizing work, the team gets together and each teammate decides how they want to be responsible, accountable, consulted, or informed in the work.

**Cross-functional Outputs**
1. RACI Chart
2. Team Process Map
3. Project Plan
4. Sprint Goals`,
      },
      {
        id: "tw-expect-3",
        title: "Commitment vs. Job Function vs. People on Teams",
        youtubeId: "jgPqof6ao4Y",
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/commitment-vs.-job-function-vs.-people-on-teams",
        content: `**Roles and Jobs and Teams...Oh My!**

What's a role? Isn't that a job position? NO!

1. A role is a set of duties.
2. A job is a person's title.
3. A duty is a "commitment" of activities that a person carries out.
4. A job function is your title, what you call yourself.

This means:
• One person has one function on a team.
• One function has many duties on a team.
• One person has many duties on a team.

**How Agile Team Duties Work**

Agile teams self-organize and agree to their process. Each sprint, they build agreement of what duties people will play through a RACI chart.

**Everyone Operates Across Functions on Tech Fleet Projects**

You should not stick to only your job responsibilities on an Agile team. The more collaborative a team is across functions, the more decision-making prowess it has. No one should tell them what to do or how to work. They make their own collective decisions.`,
      },
      {
        id: "tw-expect-4",
        title: "Sharing Leadership with Teammates",
        youtubeId: "FtalPt8qrc4",
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/sharing-leadership-with-teammates",
        content: `**Everyone Shares Leadership on Agile Teams**

Everyone leads on an agile cross-functional team. Yes, even the interns. Even the people who have 0 experience. This is very intentional! Everyone is in service to everyone else's growth.

A self-organized team who is empowered to take the reins of ownership should not have a single leader. When there's a dynamic of "leader" and "follower," it creates an imbalance of power and ownership. People wait to be told what to do. People may not speak up about important concerns because they fear punishment.

Decision making should be shared together in the entire group. Ownership should be handed to the people considered the least experienced so that they can grow. Cross-functional agile teams create environments where everyone shares leadership: everyone makes decisions together, everyone owns work, everyone shares responsibility, everyone supports each other's growth.

On a shared leadership team, no team should have single leaders telling everyone what to do. People transfer ownership to their teammates. Teammates decide what work to lead and how to get involved using the RACI Chart.`,
      },
      {
        id: "tw-expect-5",
        title: "Case Study Creation for Teammates",
        youtubeId: "Lic8ADgSv-g",
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/case-study-creation-for-teammates",
        content: `**Telling the Story of Your Experience**

Teammates involved in project training, volunteer work, and class training should tell the story of their experience through case studies. Everyone tells the same kind of case study: the story of the problems, decisions made as a team, and outcomes of progress.

**Great Case Studies Have:**

1. **A Story Arc** — Start with some kind of problem and show how it progressed. Take the readers there. Relive the story through the case study.

2. **Measurable Concrete Outcomes** — Show how you measured success, or how you would measure success. This highlights the potential impact of your decisions as a team.

3. **A Focus on the Why** — Articulating the "why" behind your decisions demonstrates your problem-solving mindset and critical thinking skills.

4. **User/Audience Perspectives** — UX is an applied science field. We follow the scientific method to test hypotheses.

5. **Conflict to Resolve** — Discuss how you grew through conflict, and how your team and outcomes grew through it.

6. **Cross-Functional Collaboration** — Showcase how you worked together as a unified team across all work functions to accomplish an outcome.

**Case Study Outcomes:**
Your case study should help readers make informed decisions about your ability to work with others, showcase your collaboration and team skills, your approach to problem-solving, and your ability to condense information.`,
      },
      {
        id: "tw-expect-6",
        title: "Working with Different Working Styles",
        youtubeId: "2x_b0pIGzrM",
        sourceUrl:
          "https://guide.techfleet.org/team-portal/new-teammate-handbook/expectations-for-teammates/working-with-different-working-styles",
        content: `**Overview**

We live our mission and values everyday, and you should too. We are a community of learning and growing individuals working towards access to quality leadership development and teamwork development.

**Being You and Respecting Others**

Tech Fleet team members come from all over the globe. They bring different lived experiences and perspectives. It is important that we recognize and respect everyone's way of life. Every member should feel a sense of belonging and feel free to challenge decisions, speak out, and communicate their boundaries.

Structure your meetings and tasks so every team member can play to their strengths and lean on the team for help with things they want to improve. Communicate directly and clearly, avoiding innuendos, sarcasm, and implied statements.

Everyone excels in different kinds of working environments. Some enjoy synchronous collaboration; some feel more productive sharing thoughts asynchronously. It is up to the collective team to discuss needs, make compromises, and determine what a working environment looks like for them.

**Asynchronous Working**

Async working requires planning and delegation, but is a great way to maximize time and attention on tasks. Teams should decide what level of async working they're comfortable with.

**Synchronous Working**

Some discussion can't be hashed out over Slack and need to be addressed synchronously. Sync sessions can manifest as sprint planning, weekly team sessions, and client demos.`,
      },
    ],
  },
];

/** Flat list of all lesson IDs for validation */
export const ALL_TEAMWORK_LESSON_IDS = TEAMWORK_COURSE_SECTIONS.flatMap((s) =>
  s.lessons.map((l) => l.id)
);

/** Flat list of all lessons in order */
export const ALL_TEAMWORK_LESSONS = TEAMWORK_COURSE_SECTIONS.flatMap(
  (s) => s.lessons
);

/** Total lesson count */
export const TOTAL_TEAMWORK_LESSONS = ALL_TEAMWORK_LESSON_IDS.length;
