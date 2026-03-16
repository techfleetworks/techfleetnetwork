export interface AgileLesson {
  id: string;
  title: string;
  youtubeId: string | null;
  sourceUrl: string;
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
      },
      {
        id: "agile-intro-2",
        title: "Introduction to the Agile Handbook",
        youtubeId: "GMZRdXYCqzw",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/start-the-agile-handbook-here/introduction-to-the-agile-handbook",
      },
      {
        id: "agile-intro-3",
        title: "Can AI Replace Agile Teams?",
        youtubeId: "Ou0_QSuZwso",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/start-the-agile-handbook-here/can-ai-replace-agile-teams",
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
      },
      {
        id: "agile-phil-2",
        title: "Agile Ways of Work",
        youtubeId: "X6bjIIVaWVI",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-philosophies/agile-ways-of-work",
      },
      {
        id: "agile-phil-3",
        title: "Applying Agile Philosophies to Work",
        youtubeId: "MPpy7kAuxCU",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-philosophies/applying-agile-philosophies-to-work",
      },
      {
        id: "agile-phil-4",
        title: "Building MVPs and MMPs with Agile",
        youtubeId: "5N3OqDBCMDo",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-philosophies/building-mvps-and-mmps-with-agile",
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
      },
      {
        id: "agile-team-2",
        title: "The Four Stages of Team Growth",
        youtubeId: "5Vs5PFCL7mw",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/the-four-stages-of-team-growth",
      },
      {
        id: "agile-team-3",
        title: "Building Agile Mindsets",
        youtubeId: "_9yjJJKrrDs",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/building-agile-mindsets",
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
      },
      {
        id: "agile-prac-2",
        title: "Service Leadership",
        youtubeId: "jqWtW7NyAk0",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/service-leadership",
      },
      {
        id: "agile-prac-3",
        title: "Self-Organization",
        youtubeId: "PLRHGENreC4",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/self-organization",
      },
      {
        id: "agile-prac-4",
        title: "Continuous Improvement",
        youtubeId: "fA9sm68xyz8",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/continuous-improvement",
      },
      {
        id: "agile-prac-5",
        title: "Iterative Value Delivery",
        youtubeId: "eFRl0F6PQ9c",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/making-strong-agile-teams/self-actualized-agile-teams/iterative-value-delivery",
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
      },
      {
        id: "agile-cross-2",
        title: "Leadership on Agile Teams",
        youtubeId: "Bccz4aSuUpQ",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/leadership-on-agile-teams",
      },
      {
        id: "agile-cross-3",
        title: "Daily Life on Agile Teams",
        youtubeId: "RjqUTMCPRLg",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/daily-life-on-agile-teams",
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
      },
      {
        id: "agile-conflict-2",
        title: "The Process for Resolving Conflicts",
        youtubeId: "vKWOHRijDmI",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/the-process-for-resolving-conflicts",
      },
      {
        id: "agile-conflict-3",
        title: "Collective Agreement Violations",
        youtubeId: null,
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-teamwork/day-to-day-on-an-agile-team/collective-agreement-violations",
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
      },
      {
        id: "agile-method-2",
        title: "Scrum Team Functions",
        youtubeId: "xAXU4lAd0L8",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-methods/scrum-method/scrum-team-functions",
      },
      {
        id: "agile-method-3",
        title: "Scrum Meetings",
        youtubeId: "MoFbcsMPnt4",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-methods/scrum-method/scrum-meetings",
      },
      {
        id: "agile-method-4",
        title: "Common Agile Deliverables",
        youtubeId: "U-aZol4ybzc",
        sourceUrl: "https://guide.techfleet.org/agile-training-portal/agile-handbook/agile-methods/scrum-method/common-agile-deliverables",
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
