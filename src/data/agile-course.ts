export interface AgileLesson {
  id: string;
  title: string;
  youtubeId: string | null;
  sourceUrl: string;
  content: string;
}

export interface AgileCourseSection {
  title: string;
  lessons: AgileLesson[];
}

export const AGILE_COURSE_SECTIONS: AgileCourseSection[] = [
  {
    title: "Introduction",
    lessons: [
      {
        id: "agile-intro-1",
        title: "What You Read About Agile May Be Different From What You See in the World",
        youtubeId: "iOHQRwqSvyE",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/start-the-agile-handbook-here/what-you-read-about-agile-may-be-different-from-what-you-see-in-the-world",
        content: `**The Gap Between Agile Theory and Practice**

Many organizations claim to be "agile" but often practice something very different from the original principles. This lesson explores the gap between what agile is supposed to be and what it often looks like in the real world.

**Key Points:**

• Agile in textbooks emphasizes collaboration, adaptability, and delivering value iteratively
• In practice, many companies adopt agile terminology without truly changing how they work
• "Agile theater" refers to teams that go through the motions of agile ceremonies without embracing the mindset
• True agile transformation requires a cultural shift, not just process changes

**Why This Matters for Tech Fleet:**

1. Understanding this gap helps you recognize genuine agile practices
2. You'll learn to distinguish between agile as a mindset vs. agile as a set of rituals
3. This awareness prepares you to practice authentic agile teamwork in our community
4. You'll be better equipped to bring real agile values to future workplaces`,
      },
      {
        id: "agile-intro-2",
        title: "Introduction to the Agile Handbook",
        youtubeId: "GMZRdXYCqzw",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/start-the-agile-handbook-here/introduction-to-the-agile-handbook",
        content: `**Welcome to the Agile Handbook**

This handbook is your guide to understanding and practicing agile philosophies, teamwork, and methods. It covers everything from the core principles of agile to the day-to-day practices of working on an agile team.

**What You'll Learn:**

• The foundational philosophies behind agile ways of working
• How agile teams collaborate and make decisions together
• The five team practices that make agile teams successful
• How cross-functional teamwork operates in practice
• Scrum methods and common agile deliverables

**How to Use This Handbook:**

1. Work through each section in order — the concepts build on each other
2. Watch the videos for visual explanations of key concepts
3. Read the text versions for deeper understanding
4. Reflect on how each concept applies to your own growth
5. Mark lessons complete as you work through them

**Important Context:**

This is not just theoretical material. Everything you learn here will be applied in real team settings at Tech Fleet. The agile philosophies and practices described in this handbook are the foundation of how all teams in our community operate.`,
      },
      {
        id: "agile-intro-3",
        title: "Can AI Replace Agile Teams?",
        youtubeId: "Ou0_QSuZwso",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/start-the-agile-handbook-here/can-ai-replace-agile-teams",
        content: `**AI and the Future of Teamwork**

With the rise of AI tools, a common question emerges: can AI replace the need for agile teams? This lesson explores why human collaboration remains essential even in an AI-powered world.

**Key Arguments:**

• AI can automate tasks but cannot replace human judgment, creativity, and empathy
• Agile teams solve complex, ambiguous problems that require diverse perspectives
• The value of agile is in the human dynamics — trust, communication, shared ownership
• AI is a powerful tool that enhances team capabilities, not a replacement for teamwork

**What AI Can Do:**

1. Automate repetitive tasks and data analysis
2. Generate code, content, and design suggestions
3. Speed up research and information gathering
4. Assist with project management and tracking

**What AI Cannot Replace:**

1. Building trust and psychological safety within a team
2. Navigating interpersonal conflicts and team dynamics
3. Making value-based decisions that require ethical judgment
4. Creating a sense of shared purpose and ownership
5. Adapting to changing human needs and organizational culture

**The Bottom Line:**

The future belongs to people who can work effectively in teams AND leverage AI tools. Learning agile teamwork makes you more valuable, not less, in an AI-powered world.`,
      },
    ],
  },
  {
    title: "Agile Philosophies",
    lessons: [
      {
        id: "agile-phil-1",
        title: "Waterfall Ways of Work",
        youtubeId: "M7Eo7YTu08Q",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-philosophies/waterfall-ways-of-work",
        content: `**Understanding the Waterfall Approach**

Before understanding agile, it helps to understand the traditional approach it evolved from: waterfall project management.

**What Is Waterfall?**

Waterfall is a sequential, linear approach to project management where each phase must be completed before the next begins. It follows a strict order:

1. **Requirements** — Gather all requirements upfront
2. **Design** — Create the complete design based on requirements
3. **Implementation** — Build everything according to the design
4. **Testing** — Test the finished product
5. **Deployment** — Release the final product
6. **Maintenance** — Fix issues after release

**Problems with Waterfall:**

• Requirements change, but the process doesn't accommodate change easily
• Customers don't see the product until the very end
• Problems discovered late are expensive and difficult to fix
• Teams work in silos — handoffs between phases create bottlenecks
• There's no opportunity for learning and iteration during the process

**Why This Matters:**

Understanding waterfall helps you appreciate why agile emerged as an alternative. Many organizations still operate with waterfall thinking even when they claim to be agile.`,
      },
      {
        id: "agile-phil-2",
        title: "Agile Ways of Work",
        youtubeId: "X6bjIIVaWVI",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-philosophies/agile-ways-of-work",
        content: `**The Agile Alternative**

Agile is a fundamentally different approach to work that embraces change, collaboration, and iterative delivery of value.

**Core Agile Values (from the Agile Manifesto):**

• **Individuals and interactions** over processes and tools
• **Working software** over comprehensive documentation
• **Customer collaboration** over contract negotiation
• **Responding to change** over following a plan

**How Agile Differs from Waterfall:**

| Waterfall | Agile |
|---|---|
| Linear, sequential | Iterative, incremental |
| Big upfront planning | Continuous planning |
| Delivered at the end | Delivered frequently |
| Change is costly | Change is expected |
| Siloed teams | Cross-functional teams |

**Key Agile Principles:**

1. Deliver working value frequently in small increments
2. Welcome changing requirements, even late in development
3. Build projects around motivated, empowered individuals
4. The best results emerge from self-organizing teams
5. Reflect regularly on how to become more effective

**At Tech Fleet:**

We practice these values in everything we do. Our teams are self-organizing, cross-functional, and focused on continuous improvement.`,
      },
      {
        id: "agile-phil-3",
        title: "Applying Agile Philosophies to Work",
        youtubeId: "MPpy7kAuxCU",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-philosophies/applying-agile-philosophies-to-work",
        content: `**Putting Agile Into Practice**

Understanding agile philosophy is one thing — applying it to real work is another. This lesson bridges the gap between theory and practice.

**Practical Application of Agile Values:**

• **Start small** — Don't try to plan everything upfront. Start with what you know and iterate
• **Embrace feedback** — Seek input from teammates and stakeholders frequently
• **Be transparent** — Share progress, blockers, and concerns openly with your team
• **Focus on value** — Always ask "what delivers the most value to the user right now?"

**Common Pitfalls When Applying Agile:**

1. Over-planning instead of starting and iterating
2. Treating agile ceremonies as bureaucratic checkboxes
3. Avoiding difficult conversations about progress or problems
4. Working in isolation instead of collaborating across functions
5. Perfectionism that delays delivery of working value

**How to Think Agile:**

• Break large problems into smaller, manageable pieces
• Deliver something usable, then improve it based on feedback
• Communicate constantly with your team
• Reflect on what's working and what isn't — then adapt
• Trust your teammates and share responsibility for outcomes`,
      },
      {
        id: "agile-phil-4",
        title: "Building MVPs and MMPs with Agile",
        youtubeId: "5N3OqDBCMDo",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-philosophies/building-mvps-and-mmps-with-agile",
        content: `**Minimum Viable Products and Minimum Marketable Products**

Two fundamental concepts in agile delivery are the MVP (Minimum Viable Product) and MMP (Minimum Marketable Product).

**MVP — Minimum Viable Product:**

• The simplest version of a product that can be used to test an idea
• Focused on learning: "What do users actually need?"
• Not a finished product — it's an experiment
• Helps teams avoid building things nobody wants

**MMP — Minimum Marketable Product:**

• The smallest set of features that provides value to users
• Ready for real use, not just experimentation
• Focused on delivery: "What's the least we can build that's genuinely useful?"
• The first real release to users

**The Relationship Between MVP and MMP:**

1. Start with an MVP to validate your assumptions
2. Learn from user feedback on the MVP
3. Iterate toward an MMP that delivers real value
4. Continue iterating based on ongoing feedback

**Why This Matters:**

• Prevents wasted effort on features users don't need
• Gets value into users' hands faster
• Creates a feedback loop for continuous improvement
• Teaches teams to prioritize ruthlessly

**At Tech Fleet:**

Our project training teams practice building MVPs and iterating toward MMPs with real nonprofit clients. This is one of the most valuable skills you'll develop.`,
      },
    ],
  },
  {
    title: "Agile Teamwork",
    lessons: [
      {
        id: "agile-team-1",
        title: "Prioritizing Growth Over Skills",
        youtubeId: "MDI_GFTK6qY",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/prioritizing-growth-over-skills",
        content: `**Growth Mindset in Agile Teams**

In traditional work environments, people are hired for specific skills. In agile teams, growth potential matters more than current skill level.

**Why Growth Over Skills?**

• Skills can be learned, but a growth mindset is a fundamental orientation
• People who prioritize growth are more adaptable to change
• Teams of learners outperform teams of experts who resist change
• A growth-oriented culture creates psychological safety for experimentation

**What a Growth Mindset Looks Like:**

1. Willingness to try things outside your comfort zone
2. Openness to feedback — even when it's uncomfortable
3. Curiosity about how others work and what they know
4. Resilience when things don't go as planned
5. Commitment to continuous learning and improvement

**What a Fixed Mindset Looks Like:**

• "That's not my job" — rigid role boundaries
• Avoiding challenges to protect your reputation
• Seeing feedback as criticism rather than growth opportunity
• Competing with teammates instead of collaborating
• Blaming others when things go wrong

**At Tech Fleet:**

We value your commitment to growth above your current experience level. Everyone starts somewhere, and the willingness to learn and contribute is what makes our teams strong.`,
      },
      {
        id: "agile-team-2",
        title: "The Four Stages of Team Growth",
        youtubeId: "5Vs5PFCL7mw",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/the-four-stages-of-team-growth",
        content: `**Tuckman's Model of Team Development**

Every team goes through predictable stages of development. Understanding these stages helps you navigate team dynamics with patience and purpose.

**The Four Stages:**

1. **Forming** — Team members are polite and cautious. Everyone is learning about each other and the work. There's excitement but also uncertainty.

2. **Storming** — Disagreements surface. Team members push back on ideas, roles become unclear, and conflict emerges. This is normal and necessary.

3. **Norming** — The team establishes working agreements. Trust builds. People find their rhythm and start collaborating effectively.

4. **Performing** — The team operates at high efficiency. Members trust each other, share leadership naturally, and deliver consistent value.

**Important Truths About These Stages:**

• Every team goes through storming — it's not a sign of failure
• Teams can regress to earlier stages when membership changes
• The goal is not to skip stages but to move through them with awareness
• Storming is where the most growth happens for individuals and teams

**How to Support Your Team at Each Stage:**

• **Forming:** Be open, share about yourself, ask questions
• **Storming:** Stay engaged, communicate directly, seek to understand
• **Norming:** Reinforce what's working, establish shared practices
• **Performing:** Challenge the team to keep improving, mentor others`,
      },
      {
        id: "agile-team-3",
        title: "Building Agile Mindsets",
        youtubeId: "_9yjJJKrrDs",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/building-agile-mindsets",
        content: `**What Makes an Agile Mindset?**

An agile mindset goes beyond knowing agile methods — it's a way of thinking about work, collaboration, and problem-solving.

**Core Elements of an Agile Mindset:**

• **Adaptability** — Embracing change rather than resisting it
• **Collaboration** — Believing that teams produce better results than individuals
• **Transparency** — Being open about progress, problems, and concerns
• **Empowerment** — Taking initiative without waiting to be told what to do
• **Reflection** — Regularly examining and improving how you work

**Building Your Agile Mindset:**

1. Practice being comfortable with ambiguity
2. Seek diverse perspectives before making decisions
3. Share your work early and often — don't wait for perfection
4. Take ownership of team outcomes, not just your individual tasks
5. Celebrate learning from failures as much as successes

**The Self-Actualized Agile Team:**

A self-actualized agile team is one where every member has internalized the agile mindset. These teams:

• Make decisions collectively and quickly
• Adapt to change without disruption
• Hold each other accountable with compassion
• Continuously improve their processes and relationships
• Deliver consistent value to their stakeholders`,
      },
    ],
  },
  {
    title: "The Team Practices",
    lessons: [
      {
        id: "agile-prac-1",
        title: "Psychological Safety",
        youtubeId: "E_d01Me8GgU",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/psychological-safety",
        content: `**The Foundation of High-Performing Teams**

Psychological safety is the single most important factor in team performance. It means team members feel safe to take risks, speak up, and be vulnerable without fear of punishment or embarrassment.

**What Psychological Safety Looks Like:**

• Team members admit mistakes openly
• People ask questions without fear of looking "stupid"
• Disagreement is welcomed as a path to better solutions
• Everyone's voice is heard and valued equally
• Experimentation is encouraged, even when results are uncertain

**What Psychological Safety Does NOT Mean:**

• It doesn't mean everyone always agrees
• It doesn't mean avoiding difficult conversations
• It doesn't mean lowering standards or expectations
• It doesn't mean being "nice" at the expense of honesty

**How to Build Psychological Safety:**

1. **Model vulnerability** — Share your own mistakes and what you learned
2. **Respond constructively** — When someone shares a concern, thank them
3. **Invite participation** — Actively ask quieter team members for input
4. **Frame failures as learning** — Ask "what did we learn?" not "who messed up?"
5. **Address disrespect immediately** — Protect the team's safe space

**Google's Project Aristotle** found that psychological safety was the #1 predictor of team effectiveness — above everything else including skills, experience, and resources.`,
      },
      {
        id: "agile-prac-2",
        title: "Service Leadership",
        youtubeId: "jqWtW7NyAk0",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/service-leadership",
        content: `**Leading by Serving Others**

Service leadership (also called servant leadership) flips the traditional leadership model. Instead of the team serving the leader, the leader serves the team.

**Traditional Leadership vs. Service Leadership:**

| Traditional | Service Leadership |
|---|---|
| Leader directs | Leader facilitates |
| Power flows down | Power is shared |
| Leader has answers | Team finds answers |
| Focus on control | Focus on enablement |
| Status-based authority | Trust-based influence |

**Principles of Service Leadership:**

1. **Listen first** — Understand before prescribing solutions
2. **Remove obstacles** — Help teammates do their best work
3. **Develop others** — Invest in your teammates' growth
4. **Share credit** — Celebrate team achievements, not personal wins
5. **Lead by example** — Model the behavior you want to see

**Service Leadership at Tech Fleet:**

• Every team member practices service leadership, not just designated leaders
• Leadership is a behavior, not a title or position
• You serve your teammates by being reliable, communicative, and supportive
• The best way to lead is to help others succeed

**How to Practice Service Leadership Today:**

• Ask a teammate "how can I help you?"
• Share knowledge or resources proactively
• Give credit to others in team discussions
• Take on unglamorous tasks that help the team succeed
• Mentor someone who is newer to the team`,
      },
      {
        id: "agile-prac-3",
        title: "Self-Organization",
        youtubeId: "PLRHGENreC4",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/self-organization",
        content: `**Teams That Manage Themselves**

Self-organization means the team decides how to do the work, rather than being told by a manager. It's a core principle of agile that empowers teams to be more effective and engaged.

**What Self-Organization Means:**

• The team collectively decides how to approach the work
• Team members volunteer for tasks based on interest and ability
• Decisions are made by the people closest to the work
• No single person assigns tasks or dictates the process
• The team adapts its approach based on what they learn

**What Self-Organization Does NOT Mean:**

• It doesn't mean chaos or lack of structure
• It doesn't mean no leadership or accountability
• It doesn't mean everyone does whatever they want
• It doesn't mean decisions are made without discussion

**How Self-Organized Teams Work:**

1. The team agrees on goals and priorities together
2. Individuals volunteer for work that aligns with their skills and growth goals
3. The team establishes working agreements and norms
4. When problems arise, the team solves them collectively
5. Regular retrospectives help the team improve its processes

**Benefits of Self-Organization:**

• Higher engagement — people are more committed to decisions they help make
• Better solutions — diverse perspectives lead to more creative approaches
• Faster adaptation — the team can pivot without waiting for approval
• Stronger ownership — everyone feels responsible for the team's success`,
      },
      {
        id: "agile-prac-4",
        title: "Continuous Improvement",
        youtubeId: "fA9sm68xyz8",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/continuous-improvement",
        content: `**Always Getting Better**

Continuous improvement (also known as Kaizen) is the practice of regularly reflecting on how work is done and making small, incremental improvements.

**The Continuous Improvement Cycle:**

1. **Reflect** — What went well? What didn't?
2. **Identify** — What's one thing we could improve?
3. **Experiment** — Try a small change
4. **Evaluate** — Did the change help?
5. **Repeat** — Keep the cycle going

**Key Principles:**

• Small, frequent improvements compound over time
• Every team member is responsible for suggesting improvements
• Focus on the process, not blame for individuals
• Experimentation is valued — not every improvement will work
• Celebrate progress, even small wins

**Practical Ways to Practice Continuous Improvement:**

• Participate actively in retrospectives
• Share what you've learned with your teammates
• Suggest process changes when you see inefficiencies
• Be willing to try new approaches, even if they feel uncomfortable
• Track improvements to see progress over time

**At Tech Fleet:**

Our teams hold regular retrospectives where everyone reflects on what's working and what could be better. This isn't just a ceremony — it's how we build a culture of growth and excellence.`,
      },
      {
        id: "agile-prac-5",
        title: "Iterative Value Delivery",
        youtubeId: "eFRl0F6PQ9c",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/iterative-value-delivery",
        content: `**Delivering Value in Small Increments**

Iterative value delivery is the practice of breaking work into small chunks and delivering usable value frequently, rather than waiting until everything is "done."

**Why Iterate?**

• Get feedback early before investing too much in the wrong direction
• Reduce risk by validating assumptions continuously
• Build momentum — small wins keep the team motivated
• Learn faster — each iteration teaches you something new
• Adapt to changing needs and priorities

**How Iterative Delivery Works:**

1. Break the work into the smallest pieces that deliver value
2. Prioritize the most valuable pieces first
3. Deliver and get feedback on each piece
4. Use feedback to inform the next iteration
5. Continuously refine and improve what you've built

**Iteration vs. Incremental:**

• **Iterative** — Improving the same thing through multiple passes (like painting layers)
• **Incremental** — Adding new pieces one at a time (like building rooms in a house)
• The best agile teams do both — deliver incrementally while iterating on quality

**Common Mistakes:**

• Trying to deliver everything at once ("big bang" delivery)
• Not getting feedback between iterations
• Making iterations too large — aim for days, not weeks
• Confusing "done" with "perfect" — deliver value, then improve

**At Tech Fleet:**

Our project training teams deliver work to nonprofit clients in small iterations, getting real feedback and adapting their approach. This mirrors how professional agile teams operate.`,
      },
    ],
  },
  {
    title: "Cross-Functional Team Dynamics",
    lessons: [
      {
        id: "agile-cross-1",
        title: "Cross-Functional Agile Teamwork",
        youtubeId: "VvUi6MJNeTU",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/cross-functional-agile-teamwork",
        content: `**Working Across Functions**

Cross-functional teamwork means that team members work across traditional role boundaries. Instead of siloed specialists, everyone contributes to all aspects of the work.

**What Cross-Functional Means:**

• Team members contribute beyond their primary skill area
• No strict boundaries between "design," "development," "research," etc.
• Everyone participates in planning, execution, and review
• Skills are shared and learned across the team
• The team collectively owns all aspects of the deliverable

**Why Cross-Functional Teams Work Better:**

1. **Fewer bottlenecks** — Work doesn't stall waiting for a specialist
2. **Better understanding** — Everyone knows the full picture
3. **More innovation** — Diverse perspectives spark creative solutions
4. **Shared ownership** — The whole team is invested in every outcome
5. **Faster delivery** — Parallel work across functions speeds delivery

**How to Be a Cross-Functional Teammate:**

• Volunteer for tasks outside your comfort zone
• Ask questions about work that's unfamiliar to you
• Pair with teammates from different backgrounds on tasks
• Share your knowledge openly so others can learn
• Be curious about how different functions approach problems

**At Tech Fleet:**

Every team is cross-functional by design. Whether you're in project training or volunteering, you'll work alongside people from different backgrounds and skill sets. This is how you grow the fastest.`,
      },
      {
        id: "agile-cross-2",
        title: "Leadership on Agile Teams",
        youtubeId: "Bccz4aSuUpQ",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/leadership-on-agile-teams",
        content: `**Shared Leadership in Action**

On agile teams, leadership is not a position — it's a behavior that every team member practices. There are no bosses, only teammates who lead in different ways at different times.

**How Leadership Works on Agile Teams:**

• Leadership rotates based on context and expertise
• The person closest to the problem often leads the solution
• Everyone is empowered to make decisions within their area
• Formal hierarchies are replaced by trust and competence
• Leading means facilitating, not directing

**Types of Leadership on Agile Teams:**

1. **Facilitative** — Guiding discussions and helping the team reach decisions
2. **Technical** — Sharing expertise to help the team solve specific problems
3. **Emotional** — Supporting teammates through challenges and celebrating wins
4. **Strategic** — Helping the team see the bigger picture and prioritize
5. **Mentoring** — Helping less experienced teammates grow

**What Shared Leadership Requires:**

• Trust that your teammates will follow through
• Willingness to step up AND step back as needed
• Clear communication about who is leading what
• Accountability without blame
• Respect for different leadership styles

**At Tech Fleet:**

We don't have managers, team leads, or bosses. Every person on a team shares leadership responsibility. This might feel unfamiliar at first, but it's one of the most powerful skills you'll develop here.`,
      },
      {
        id: "agile-cross-3",
        title: "Daily Life on Agile Teams",
        youtubeId: "RjqUTMCPRLg",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/daily-life-on-agile-teams",
        content: `**A Day in the Life of an Agile Teammate**

What does it actually look like to work on an agile team day-to-day? This lesson gives you a practical picture of the rhythms and routines of agile teamwork.

**Daily Practices:**

• **Stand-ups** — Brief daily check-ins where team members share what they're working on, what's blocking them, and where they need help
• **Async updates** — For distributed teams, written updates that keep everyone informed
• **Pair work** — Working together on tasks for shared learning and quality
• **Documentation** — Keeping team knowledge accessible and up-to-date

**Weekly Rhythms:**

1. Sprint planning — Deciding what to work on this cycle
2. Team collaboration sessions — Working together on shared tasks
3. Check-ins with stakeholders — Sharing progress and gathering feedback
4. Knowledge sharing — Teaching each other what you've learned

**Sprint Ceremonies:**

• **Sprint Planning** — Set goals for the upcoming sprint
• **Daily Stand-up** — Quick sync on progress and blockers
• **Sprint Review** — Demo work to stakeholders and get feedback
• **Sprint Retrospective** — Reflect on what to improve

**Tips for Success:**

• Be prepared for meetings — come with updates and questions ready
• Communicate proactively — don't wait for someone to ask
• Ask for help early — waiting too long wastes time
• Celebrate small wins with your team
• Stay curious and engaged, even when the work is challenging`,
      },
    ],
  },
  {
    title: "Conflict Resolution",
    lessons: [
      {
        id: "agile-conflict-1",
        title: "Resolving Team Conflict as Service Leaders",
        youtubeId: "A8UPOsGDxCw",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/resolving-team-conflict-as-service-leaders",
        content: `**Conflict Is Normal — How You Handle It Matters**

Conflict is a natural and necessary part of teamwork. In agile teams, where shared leadership and self-organization are the norm, knowing how to resolve conflict constructively is essential.

**Why Conflict Happens on Teams:**

• Different perspectives and communication styles
• Unclear expectations or misunderstandings
• Disagreements about priorities or approaches
• Stress from workload or external pressures
• The storming phase of team development

**The Service Leadership Approach to Conflict:**

1. **Assume positive intent** — Most conflicts arise from miscommunication, not malice
2. **Address it directly** — Don't let issues fester or talk behind someone's back
3. **Listen to understand** — Seek to understand the other person's perspective before responding
4. **Focus on the problem, not the person** — Separate the behavior from the individual
5. **Seek a solution together** — Involve all parties in finding a resolution

**Healthy vs. Unhealthy Conflict:**

| Healthy | Unhealthy |
|---|---|
| About ideas and approaches | About people and blame |
| Open and direct | Passive-aggressive or avoidant |
| Leads to better solutions | Leads to resentment |
| Both parties feel heard | One party dominates |
| Strengthens relationships | Damages trust |

**At Tech Fleet:**

We expect all team members to handle conflict as service leaders. This means being direct, compassionate, and focused on solutions rather than blame.`,
      },
      {
        id: "agile-conflict-2",
        title: "The Process for Resolving Conflicts",
        youtubeId: "vKWOHRijDmI",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/the-process-for-resolving-conflicts",
        content: `**A Step-by-Step Approach to Conflict Resolution**

Having a clear process for resolving conflicts helps teams address issues quickly and fairly.

**The Conflict Resolution Process:**

1. **Identify the issue** — Be specific about what the conflict is about
2. **Have a direct conversation** — Talk to the person involved, not about them
3. **Listen actively** — Let them share their perspective fully
4. **Find common ground** — Identify what you both agree on
5. **Agree on next steps** — Decide together what will change going forward
6. **Follow up** — Check in to make sure the resolution is working

**Communication Tips for Difficult Conversations:**

• Use "I" statements: "I felt frustrated when..." instead of "You always..."
• Be specific about behaviors, not character: "When the deadline was missed..." not "You're unreliable"
• Ask questions: "Can you help me understand why...?"
• Acknowledge emotions: "I can see this is frustrating for you too"
• Focus on the future: "How can we prevent this going forward?"

**When to Escalate:**

• If direct conversation doesn't resolve the issue after genuine effort
• If the conflict involves harassment or safety concerns
• If the conflict is affecting the entire team's ability to work
• If both parties agree they need outside support

**Remember:** Most conflicts can be resolved through direct, honest conversation. The key is addressing issues early before they grow.`,
      },
      {
        id: "agile-conflict-3",
        title: "Collective Agreement Violations",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/collective-agreement-violations",
        content: `**When Team Agreements Are Broken**

Every team creates collective agreements — shared commitments about how the team will work together. When these agreements are violated, the team needs a fair and constructive way to address it.

**What Are Collective Agreements?**

• Shared commitments the team creates together
• Cover areas like communication, attendance, quality standards, and behavior
• Everyone has a voice in creating and modifying them
• They are living documents that evolve with the team

**Examples of Collective Agreements:**

1. "We will communicate blockers within 24 hours"
2. "We will come to meetings prepared"
3. "We will give and receive feedback respectfully"
4. "We will share work evenly across functions"
5. "We will update our task board daily"

**When Agreements Are Violated:**

• Address it promptly — don't let violations accumulate
• Approach the person with curiosity, not accusation
• Ask what prevented them from following the agreement
• Discuss whether the agreement needs to be modified
• If the pattern continues, involve the broader team in discussion

**Modifying Agreements:**

• Agreements should be revisited regularly during retrospectives
• If an agreement isn't working, change it — don't just ignore it
• New team members should be included in agreement discussions
• Agreements should reflect the team's current needs and context

**At Tech Fleet:**

Our community collective agreement sets the foundation for all team interactions. Every team can create additional agreements specific to their context, but the community agreement applies to everyone.`,
      },
    ],
  },
  {
    title: "Agile Methods",
    lessons: [
      {
        id: "agile-method-1",
        title: "What is Scrum?",
        youtubeId: "ikxnRq8tscs",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-methods/scrum-method/what-is-scrum",
        content: `**The Most Popular Agile Framework**

Scrum is a lightweight framework for developing, delivering, and sustaining complex products. It's the most widely used agile method in the world.

**Scrum in a Nutshell:**

• Work is organized into **sprints** — fixed time periods (usually 1-4 weeks)
• Each sprint produces a potentially shippable increment of work
• The team inspects and adapts at regular intervals
• Transparency, inspection, and adaptation are the three pillars

**The Scrum Framework:**

1. **Product Backlog** — A prioritized list of everything the team might work on
2. **Sprint Planning** — The team selects work from the backlog for the sprint
3. **Sprint Backlog** — The work selected for the current sprint
4. **Daily Scrum** — A brief daily meeting to synchronize the team
5. **Sprint Review** — The team demonstrates completed work to stakeholders
6. **Sprint Retrospective** — The team reflects on how to improve

**Key Scrum Values:**

• **Commitment** — to achieving the sprint goals
• **Courage** — to do the right thing and work on tough problems
• **Focus** — on the work of the sprint
• **Openness** — about all the work and challenges
• **Respect** — for each other as capable, independent people

**Why Scrum Works:**

Scrum creates a rhythm of planning, doing, reviewing, and improving. This rhythm keeps teams focused, accountable, and continuously improving.`,
      },
      {
        id: "agile-method-2",
        title: "Scrum Team Functions",
        youtubeId: "xAXU4lAd0L8",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-methods/scrum-method/scrum-team-functions",
        content: `**Roles and Responsibilities in Scrum**

Scrum defines specific functions (not job titles) that team members fulfill. Understanding these functions helps you contribute effectively to any scrum team.

**The Three Scrum Functions:**

1. **Product Owner**
   • Manages the product backlog and prioritizes work
   • Represents the voice of the customer/stakeholder
   • Makes decisions about what the team builds next
   • Ensures the team is working on the most valuable items

2. **Scrum Master**
   • Facilitates scrum ceremonies and removes obstacles
   • Coaches the team on agile practices
   • Protects the team from external distractions
   • Helps the team improve their processes

3. **Development Team**
   • The people who do the work of creating the product
   • Self-organizing — they decide how to accomplish the work
   • Cross-functional — collectively have all skills needed
   • Typically 3-9 people for optimal collaboration

**Important Notes:**

• These are functions, not job titles — one person can serve multiple functions
• At Tech Fleet, these functions are shared across the team
• The "development team" includes everyone who builds — designers, researchers, developers, strategists
• No function is more important than another — they all work together

**At Tech Fleet:**

Our teams practice shared scrum functions. Everyone learns to facilitate, prioritize, and build. This gives you a well-rounded understanding of how agile teams operate.`,
      },
      {
        id: "agile-method-3",
        title: "Scrum Meetings",
        youtubeId: "MoFbcsMPnt4",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-methods/scrum-method/scrum-meetings",
        content: `**The Ceremonies That Drive Scrum**

Scrum meetings (also called ceremonies or events) create the rhythm of inspect-and-adapt that makes scrum effective.

**The Four Scrum Meetings:**

1. **Sprint Planning**
   • When: Start of each sprint
   • Duration: Up to 2 hours per sprint week
   • Purpose: Decide what to work on and how
   • Outcome: Sprint backlog with clear goals

2. **Daily Stand-up (Daily Scrum)**
   • When: Every day during the sprint
   • Duration: 15 minutes max
   • Purpose: Synchronize the team
   • Each person answers: What did I do? What will I do? Any blockers?

3. **Sprint Review**
   • When: End of each sprint
   • Duration: Up to 1 hour per sprint week
   • Purpose: Demonstrate completed work to stakeholders
   • Outcome: Feedback that informs next sprint planning

4. **Sprint Retrospective**
   • When: After the sprint review
   • Duration: Up to 45 minutes per sprint week
   • Purpose: Reflect on how the team worked together
   • Outcome: Action items for improvement

**Best Practices for Scrum Meetings:**

• Come prepared — have your updates and questions ready
• Stay focused — respect the time box
• Be honest — share blockers and concerns openly
• Follow through — act on commitments made in meetings
• Participate actively — every voice matters`,
      },
      {
        id: "agile-method-4",
        title: "Common Agile Deliverables",
        youtubeId: "U-aZol4ybzc",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-methods/scrum-method/common-agile-deliverables",
        content: `**What Agile Teams Produce**

Agile teams create a variety of deliverables (also called artifacts) that help organize work, communicate progress, and deliver value.

**Key Agile Deliverables:**

1. **User Stories**
   • Short descriptions of a feature from the user's perspective
   • Format: "As a [user], I want [feature] so that [benefit]"
   • Include acceptance criteria that define "done"
   • Sized small enough to complete in one sprint

2. **Product Backlog**
   • A living, prioritized list of all desired work
   • Continuously refined and reprioritized
   • Owned by the product owner
   • Items at the top are more detailed and ready to work on

3. **Sprint Backlog**
   • The subset of backlog items selected for the current sprint
   • Includes tasks broken down by the development team
   • Visible to the whole team via a task board
   • Updated daily as work progresses

4. **Increment**
   • The sum of all completed work at the end of a sprint
   • Must be in a usable condition
   • Represents tangible progress toward the product goal
   • Demonstrated to stakeholders during sprint review

5. **Definition of Done**
   • A shared understanding of what "complete" means
   • Applies to every piece of work the team delivers
   • Ensures consistent quality across all deliverables
   • Reviewed and updated by the team as needed

**At Tech Fleet:**

Our project training teams create all of these deliverables as part of their real-world projects with nonprofit clients. This hands-on experience is invaluable for your career.`,
      },
    ],
  },
];

/** Flat list of all lesson IDs for validation */
export const ALL_AGILE_LESSON_IDS = AGILE_COURSE_SECTIONS.flatMap((s) =>
  s.lessons.map((l) => l.id)
);

/** Flat list of all lessons in order */
export const ALL_AGILE_LESSONS = AGILE_COURSE_SECTIONS.flatMap((s) => s.lessons);

/** Total lesson count */
export const TOTAL_AGILE_LESSONS = ALL_AGILE_LESSON_IDS.length;
