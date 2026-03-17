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
    title: "Introduction",
    lessons: [
      {
        id: "vt-intro-1",
        title: "Life as a Volunteer Teammate",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/volunteering-teams/life-as-a-volunteer-teammate",
        content: `**Life as a Volunteer Teammate**

As a community-driven nonprofit, our members work together to make change that we want to see in the working world. This community has iterated on its own training programs and operations through collaboration with community members since the beginning.

You can join our mission to create the change the working world needs for the future. Beyond apprenticeship training, you can volunteer with Tech Fleet and become part of project-based teams supporting our organization. These teams focus on either short-term projects or ongoing operations that help our community run.

Volunteer work should be mutually beneficial. Volunteers should learn as much as they give back to our organization. We prioritize opportunities for people to lead and own outcomes so they gain rich experiences making change and growing professionally. The teams of volunteers use the same cross-functional agile methods that apprenticeship training teams use, because we all live the agile ways of work.

When joining volunteer teams you are a teammate without a title who's working toward a shared outcome. Read more about this in our Agile Handbook section about Cross-Functional Agile teams.`,
      },
      {
        id: "vt-intro-2",
        title: "Understanding the Organizational Structure of Our Nonprofit",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/volunteering-teams/understanding-the-organizational-structure-of-our-nonprofit",
        content: `**Understanding the Organizational Structure of Our Nonprofit**

**The Board of Directors**

Every nonprofit public charity has a board of directors that governs it. Unlike other organizations, we aspire to distribute the ownership of our organization between the board of directors and the members we serve. The board of directors are accountable for the future of our nonprofit. They set and guide the mission and vision of the organization.

**Employees**

While we don't have any employees (people who are paid) in 2026, we do plan to move toward this as we build a budget. Employees will operate the day-to-day running of the organization.

**Volunteers**

Everyone who works on the Tech Fleet organization is a volunteer today. Volunteers are voluntary workers of our nonprofit public charity. They have different responsibilities based on what they want to do in the organization. Volunteers can either participate in short-term projects or ongoing operations. They are not paid and are not employees.

**Trainees**

Trainees participate in our programs for teamwork and agile practice. They join training teams, lab-based classes, or advanced residencies to receive educational services in the real-world of agile teamwork.`,
      },
    ],
  },
  {
    title: "Volunteer Work",
    lessons: [
      {
        id: "vt-work-1",
        title: "Types of Volunteer Project Work for Our Community",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/volunteering-teams/types-of-volunteer-project-work-for-our-community",
        content: `**Types of Volunteer Project Work for Our Community**

Volunteering with Tech Fleet can take many forms, allowing individuals to choose the level of commitment that best suits them. As a volunteer, you'll join a team focused on short-term or ongoing projects. This makes it easy to find manageable ways to give back to our ecosystem and be a part of the mission.

**Types of Work for Community Volunteers**

Here are the types of volunteer work that members can get involved in within our community.

**Operations Volunteering**

This type of volunteering contributes to running Tech Fleet's community or programs. Teams get together to work with the board of directors and operate as an agile team. We have different types of teams for operations volunteering: research, technical infrastructure, client management, and project management. We plan to build more into the future as we grow.

**Program Volunteering**

This type of community volunteering is focused on contributing to our nonprofit programs. We currently have two nonprofit programs that volunteers can contribute to: one for client-based team training experience and one for classes and resources helping people grow. Volunteers involved in program work help identify change, measure impact, and implement strategy that's set by the board of directors.

**Community Volunteering**

This type of community volunteering focuses on the social aspects of the organization, such as helping with technical support, helping members on Discord, running events, posting recordings, or other things that benefit our community members.

**Board-Level Volunteering**

Volunteers who want to participate in organizational development can work with the Board of Directors. We have committee teams who handle different aspects of the governance, and you can join these as a volunteer whenever there are openings. The Board of Directors may also host agile team projects that you can join as a volunteer too.`,
      },
      {
        id: "vt-work-2",
        title: "Team Structure on Volunteer Teams",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/volunteering-teams/team-structure-on-volunteer-teams",
        content: `**Team Structure on Volunteer Teams**

Volunteer teams are just like any other agile team that's cross-functional. We provide consistent ways for people in this community to practice the mindsets and behaviors of agile and service leadership. Teammates do not have titles. They define shared outcomes each sprint, and agree to how people get involved based on the outcomes. This is the same way that any other project operates in the community, whether it be an internal project or training project.`,
      },
      {
        id: "vt-work-3",
        title: "Apply to Volunteer Teams",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/volunteering-teams/apply-to-volunteer-teams",
        content: `**Apply to Volunteer Teams**

We welcome people from all different kinds of backgrounds to join us in community volunteer work. Our projects don't require you to have experience, because that's why you're here! We do ask that you build an agile mindset and service leadership mindset, as well as onboard to the Tech Fleet ethos before you join volunteer work in our community.

**Steps to Start Volunteering:**

1. Join the community
2. Attend community onboarding
3. Attend the Service Leadership Masterclass
4. Read the Agile Handbook
5. Read the Project Success Handbook
6. Read the Teammate Handbook
7. Review the volunteer openings for our community
8. Fill out the form to apply to a volunteer community project
9. Sign the Tech Fleet Volunteer Agreement that we send you
10. Onboard as a volunteer with a volunteer coordinator`,
      },
      {
        id: "vt-work-4",
        title: "Being On Volunteer Teams",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/team-portal/new-teammate-handbook/volunteering-teams/being-on-volunteer-teams",
        content: `**Being On Volunteer Teams**

**Time Commitment for Volunteers**

As a volunteer we cannot force you to work certain hours or schedule. Weekly time expectations range anywhere from 1 to 10 hours a week depending on the volunteer role you want to join. Typically, we provide a way for volunteers to commit to a 3 month timeframe, but this is flexible. We accommodate your schedule and time restrictions outside of our community.

When you sign up for volunteering, you can see the information about the general expectations of time commitment, and you can make your own schedule around the expected time commitment. You choose what level of time commitment you can take on. It's important as a volunteer to be responsive, consistent, and detail-oriented.

**Onboarding for Volunteer Work**

When volunteers onboard, they should read all three of our handbooks for community members: the Agile Handbook, the Project Success Handbook, and the Teammate Handbook. After signing up for a volunteer role, you will join a volunteer onboarding call together with other volunteers. Each volunteer role may have its own training for you to receive after this onboarding as a volunteer. We highly recommend all volunteers also attend the Service Leadership Masterclass, a free class that offers the basic training about being a Service Leader. All Volunteers are expected to practice service leadership in their volunteer work, so this class is beneficial for your expectation setting.

**Attending Meetings as a Volunteer Teammate**

Meetings on volunteer teams are determined by the teams who operate the volunteer work. As self-organized teams, they make the call about how often they meet and when.

**Using Tools as a Volunteer Teammate**

Volunteers use the same kinds of tools that trainees do. Check out the Common Tools Used in Tech Fleet to learn more about the tools we use on teams.

**Communication with Other Volunteers and Leadership**

All communication is via Discord or email. You can have voice calls on Discord or video calls on Google Meet. We ask that you don't communicate outside of these channels (e.g. text).

**Generating Case Studies and Reports After Volunteer Teamwork**

Volunteers contribute to great teamwork and change that's made just like trainees. You, too, can generate story-driven case studies that showcase the impact you've made in your teamwork.

**Ending your Volunteer Term with the Community**

To end your volunteer experience, please email your project coordinator. A response must come from them to be captured in our tracking system.`,
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
