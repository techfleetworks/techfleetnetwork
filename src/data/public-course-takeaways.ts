// Public course-preview takeaways (public-access B12). One plain-English sentence
// per Core-course lesson, summarizing the single key point a logged-out visitor
// would take from that lesson, authored from the lesson's own text in
// src/data/*-course.ts. Shown on the public course-detail page in place of a video
// length (the YouTube-duration route was dropped — ADR 20261124-public-course-takeaways).
//
// Keyed by the lesson `id` (matching src/data/*-course.ts). A lesson with no entry
// simply shows no takeaway — the page degrades to title + type. A coverage test
// (src/test/data/public-course-registry.test.ts) keeps every Core lesson mapped.
export const LESSON_TAKEAWAYS: Record<string, string> = {
  // agile-course
  "agile-intro-1": "Real teams often fall short of Agile ideals, but you can lead by example and help your team grow.",
  "agile-intro-2": "Agile teams deliver small, usable pieces of value as they go, instead of one big result at the end like Waterfall.",
  "agile-intro-3": "AI is a tool that can speed up Agile work, but it cannot replace the human teamwork at the heart of Agile.",
  "agile-phil-1": "Waterfall does all planning, design, and building in fixed phases, so teams can spend months building something nobody wants.",
  "agile-phil-2": "Agile is a mindset built on four values: people over process, working results over documents, customers over contracts, and change over plans.",
  "agile-phil-3": "Agile teams build fast, fail fast, work on top priorities, and deliver usable results every week or two.",
  "agile-phil-4": "Agile teams set a long-term vision, then build and test small MVP releases, changing plans as they learn.",
  "agile-team-1": "Strong Agile teams succeed by helping each other grow and handling uncertainty, not by having the most skills or experience.",
  "agile-team-2": "Every team moves through forming, storming, norming, and performing, and the conflict in storming is needed to reach strong teamwork.",
  "agile-team-3": "Agile teams stay strong by keeping up five foundations, starting with psychological safety and service leadership, because agility needs steady upkeep.",
  "agile-prac-1": "Psychological safety means teammates know they will not be punished for speaking up, taking risks, or failing.",
  "agile-prac-2": "In service leadership, every teammate helps others grow and own their work instead of giving orders or doing the work for them.",
  "agile-prac-3": "Self-organization means the people doing the work decide together how to do it, including juniors and interns.",
  "agile-prac-4": "Continuous improvement means treating failure as a chance to learn, using retrospectives and quick feedback to keep adjusting.",
  "agile-prac-5": "When teams have safety, service leadership, self-organization, and improvement in place, they deliver value in small chunks and adjust as they learn.",
  "agile-cross-1": "Cross-functional teams share work across roles toward one shared outcome, so work does not stop when one person is busy or gone.",
  "agile-cross-2": "Agile teams have no boss, and co-leads and apprentices are equals who make decisions together by consensus.",
  "agile-cross-3": "Agile teams work across functions and ship small usable pieces often, while Waterfall teams work alone in silos and ship at the end.",
  "agile-conflict-1": "Conflict is natural, and every teammate shares responsibility for resolving it with respect and a service mindset.",
  "agile-conflict-2": "Resolve conflict by owning your experience, sticking to facts, avoiding blame, using voice or video, and asking for help when needed.",
  "agile-conflict-3": "Serious violations of the Collective Agreement must be reported, while ordinary disagreements are handled one-on-one or within the team.",
  "agile-method-1": "Agile is a mindset, and Scrum is one common method that organizes work into fixed time boxes called sprints.",
  "agile-method-2": "Scrum has three functions, Product Owner, Scrum Master, and Do'er, and these are responsibilities people take on, not job titles.",
  "agile-method-3": "Scrum runs on a regular rhythm of meetings: refinement, planning, daily standups, a sprint demo, and a retrospective.",
  "agile-method-4": "Common Agile deliverables include roadmaps, velocity, Kanban boards, retro boards, RACI charts, and working agreements that help teams stay aligned.",

  // observer-course
  "obs-1": "Read the Agile Handbook before the Observer Handbook so you understand the philosophies behind what teams do.",
  "obs-2": "Anyone can watch Tech Fleet project team meetings as an observer, with no big commitment, to see real Agile work.",
  "obs-3": "Observing prepares you for project training by showing real Agile teamwork, building your confidence, and helping you get noticed.",
  "obs-4": "Observing is optional but recommended, and you can join any meeting on the Web Calendar without asking permission.",
  "obs-5": "Observing follows six steps, from reading the handbooks and joining Discord to watching teams and sharing your reflections.",
  "obs-6": "Observers must follow the Code of Conduct and can report concerns safely to the Safe Space team.",
  "obs-7": "Once you finish the handbook, join Discord, get the Observer role, find meetings, and start observing.",
  "obs-8": "You need the Projects and Observers roles in Discord to unlock the observer channels and daily meeting alerts.",

  // project-training-course
  "pt-intro-1": "Project training lets people practice real cross-functional teamwork with nonprofit clients, who agree to no NDA so trainees can publish case studies.",
  "pt-intro-2": "You do not need prior experience to join a project team, since teammates are chosen for their service leadership and agile mindset.",
  "pt-intro-3": "Project teams are cross-functional with no boss, and teammates pick their own duties each week using RACI charts and sprint goals.",
  "pt-intro-4": "Project training supports five team functions, and teammates choose which ones to work in each sprint based on team goals and their own interests.",
  "pt-apply-1": "You fill out the General Application once and reuse it in each Project Phase Application, which co-leads use to see where you are, not to reject you.",
  "pt-apply-2": "To apply, join Discord, prepare by reading the handbooks and observing projects, then fill out the General and Project Phase Applications.",
  "pt-apply-3": "You do not need a degree, resume, portfolio, or experience, but you should be ready to commit 15 to 20 hours a week.",
  "pt-apply-4": "A project phase runs from client intake and applications, through pre-kickoff and 8 weeks of sprints, to a one-week hand-off.",
  "pt-apply-5": "The General Application asks about your background, availability, skills, service leadership, and agile knowledge, and you can update your answers later.",
  "pt-apply-6": "Update your General Application answers as you observe teams and take masterclasses, so teams see your latest knowledge when you apply.",
  "pt-apply-7": "The Project Phase Application asks which role and position you want, what you know about the client, and how you will help the project succeed.",
  "pt-tips-1": "Teams look for people with an agile and service leader mindset, no ego, and a wish to grow together and give back.",
  "pt-tips-2": "Project coordinators interview candidates without recording, explain that training is about learning over output, and ask how they would act as service leaders.",
  "pt-tips-3": "Strong applications come from watching for openings, shadowing a team for a week, learning agile and service leadership, and writing detailed, honest answers.",

  // volunteer-teams-course
  "vt-intro-1": "Volunteer teams support Tech Fleet through short-term projects or ongoing operations, and volunteers should learn as much as they give.",
  "vt-intro-2": "Tech Fleet is run by a board of directors and unpaid volunteers, with trainees joining programs to practice agile teamwork.",
  "vt-work-1": "Volunteers can help with operations, programs, community support, or board-level work, so you can choose the kind of work that fits you.",
  "vt-work-2": "Volunteer teams are cross-functional agile teams where teammates have no titles and agree each sprint on shared outcomes and who does what.",
  "vt-work-3": "To volunteer, you need no experience, but you should join the community, take the Service Leadership Masterclass, read the handbooks, and sign the volunteer agreement.",
  "vt-work-4": "Volunteers set their own schedule within 1 to 10 hours a week, communicate on Discord or email, and end their term by emailing the project coordinator.",

  // discord-course
  "discord-intro-1": "Discord gives Tech Fleet roles, private team channels, live streams, support tickets, and bots that keep the community safer than Slack did.",
  "discord-start-1": "Every member must sign up with a unique, verified mobile phone number, which keeps scammers and spammers out of the community.",
  "discord-start-2": "To join the Discord, fill out the sign-up form on techfleet.org, agree to the policies, then use the invite link emailed to you.",
  "discord-start-3": "Discord onboarding asks a few questions about your interests so you only see the channels and alerts you care about.",
  "discord-security-1": "Turn off direct messages and age-restricted access in your Discord privacy settings before you start interacting with the community.",
  "discord-security-2": "Treat any random friend request or direct message as a scam, and use public threads or support tickets for private talks.",
  "discord-security-3": "Links are only allowed in link sharing channels, and bots delete other links and may mute you for two minutes.",
  "discord-interact-1": "Use the Channels and Roles section to pick roles and mark the channels you want to see by default.",
  "discord-interact-2": "Click the verification button to unlock typing, tag people with the at symbol, and reply by creating threads from messages.",
  "discord-interact-3": "Anyone can join the open Hangout live stream channel, and you must undeafen and unmute yourself before you can talk.",
  "discord-interact-4": "Get the Buddy Up role, post a request in the Buddy Up channel, and help other buddies in return.",
  "discord-interact-5": "Discord events sync with the Tech Fleet web calendar, and only people with the right roles can create or edit them.",
  "discord-roles-1": "Roles work like hats that give you access to channels and alerts, and you can pick many of them yourself.",
  "discord-roles-2": "Click the emoji for a role in the Career Path Roles or Job Help Roles channels to unlock that guidance channel.",
  "discord-training-1": "Get the Projects role and then the Observers role to watch project teams work, which is the recommended first step.",
  "discord-training-2": "The Apprentices role shows you project opening alerts, but you still need to apply and be selected for a team.",
  "discord-training-3": "The Mentors role lets you see mentor openings, but you still need to respond to a project's request and be selected.",
  "discord-training-4": "Get the Masterclasses role to see openings and the dashboard for industry-focused classes that are free or cost about $50.",
  "discord-support-1": "Open a ticket in the Create a Ticket channel to chat privately with a Tech Fleet moderator about any problem.",

  // teamwork-course
  "tw-intro-1": "Tech Fleet wants to change work culture by building empowered teams, and this handbook teaches the teamwork behind project training, volunteering, and classes.",
  "tw-intro-2": "Every community member who wants to join team problem solving of any kind should read the Teammate Handbook.",
  "tw-intro-3": "Tech Fleet dropped the titles co-lead and apprentice in 2025 because they acted like bosses and employees, and everyone is now just a teammate.",
  "tw-intro-4": "You can join project training, volunteer work, or classes, and teams are peer-led, unpaid, and focus on team dynamics over skills.",
  "tw-learn-1": "Strong Agile teams are good at handling uncertainty and helping each other grow, so progress matters more than perfection or experience.",
  "tw-learn-2": "Teammates work together across functions in three ways: project training with nonprofits, volunteering for Tech Fleet, and class-based training.",
  "tw-expect-1": "Project training is an educational apprenticeship with no required hours or wages, and it is different from volunteering for Tech Fleet.",
  "tw-expect-2": "Cross-functional teams have no silos, and teammates choose their own responsibilities using a RACI chart.",
  "tw-expect-3": "A role is a set of duties and a job is a title, and Agile teammates should work across functions.",
  "tw-expect-4": "Everyone on an Agile team shares leadership, including people with no experience, so no single leader tells others what to do.",
  "tw-expect-5": "A great case study tells the story of your team's problems, decisions, and measurable outcomes, including the why and the conflicts.",
  "tw-expect-6": "Teams should respect each other's different backgrounds and talk openly about how much to work together live or on their own time.",
};
