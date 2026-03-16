export interface Handbook {
  name: string;
  description: string;
  targetAudience: string;
  category: "Agile" | "Operations" | "Training";
  contents: string[];
  link: string;
}

export const handbooks: Handbook[] = [
  {
    name: "Agile Handbook",
    description:
      "The Agile Handbook is the go-to guide for people to learn about the Agile Ways of Work. Learn about how to think and behave in an Agile way, the difference between Agile and Waterfall, and how to build strong teams that are Agile in nature.",
    targetAudience:
      "This handbook is dedicated to everyone who wants to join or lead teams in the world.",
    category: "Agile",
    contents: [
      "Introduction to the Agile Handbook",
      "Agile Philosophies",
      "Agile Teamwork",
      "Agile Methods",
      "Agile Deliverables",
    ],
    link: "https://guide.techfleet.org/agile-training-portal/agile-handbook",
  },
  {
    name: "Project Success Handbook",
    description:
      "The Project Success handbook provides the guidelines anyone can use to start their own team-based problem solving projects. We use these guidelines in our organization to run training apprenticeships, volunteer projects, board-driven projects, and more.",
    targetAudience:
      "This handbook is dedicated to anyone who wants to learn how agile projects work and succeed.",
    category: "Operations",
    contents: [
      "Introduction",
      "Project lifecycle",
      "Project milestones",
      "Project types",
      "Keys to project success",
    ],
    link: "https://guide.techfleet.org/project-training-portal/project-operations-handbook",
  },
  {
    name: "Coaching Handbook",
    description:
      "The Coaching Handbook is the manual that Agile Coaches in our community use to follow guidelines while agile coaching. They use this to train how to be Agile Coaches and learn the rigors of building empowered teams.",
    targetAudience:
      "This handbook is dedicated to anyone who is learning and training how to be an Agile Coach to lead cross-functional teamwork in any kinds of projects.",
    category: "Agile",
    contents: [
      "Introduction",
      "Agile Coaching Skills",
      "Agile Coaching Practices",
      "Agile Coaching Training Portal",
      "Agile Coaching Resources",
    ],
    link: "https://tech-fleet-community-dao.notion.site/Summer-2025-Agile-Coaching-Residency-2361a3bddce580cd9437d9d7b3c5648c?source=copy_link",
  },
  {
    name: "Observer Handbook",
    description:
      "The Observer Handbook is the manual for people who want to watch agile teams work publicly in our community. Since day 1 of our community, we've left all teamwork open for anyone to watch and learn. This provides a lot of value for people to see how agile teams work who may have never experienced them before.",
    targetAudience:
      "This handbook is dedicated to the people who are going through the first part of Tech Fleet engagement as observers.",
    category: "Training",
    contents: [
      "What's observing?",
      "The benefits of observing",
      "Observer FAQ",
      "Daily life as an observer",
      "Get started",
    ],
    link: "https://guide.techfleet.org/observer-portal/observer-handbook",
  },
  {
    name: "Teammate Handbook",
    description:
      "The Teammate Handbook is the manual for anyone to learn how to approach teamwork in an agile world across different types of projects in the community. Learn everything it takes to be a trainee, a volunteer, or a guild member.",
    targetAudience:
      "This handbook is dedicated to any community member who wants to join teams, whether through our training, volunteer work, guild work, or otherwise.",
    category: "Training",
    contents: [
      "Training as a teammate",
      "Applying for project training",
      "Discord for teammates",
      "Daily life as a teammate in training",
    ],
    link: "https://guide.techfleet.org/apprentice-portal/apprentice-handbook",
  },
  {
    name: "Project Coordinator Handbook",
    description:
      "The Project Coordinator Handbook is the reference that project coordinators in our community use to be able to manage the start and kickoff of projects in Tech Fleet.",
    targetAudience:
      "This handbook is dedicated to anyone in Tech Fleet who would like to coordinate the start of team-based project work across the community.",
    category: "Operations",
    contents: [
      "The project coordinator process",
      "Using tools as a project coordinator",
      "Project intake with clients",
      "Building teams",
      "Pre-kickoff",
      "Kicking off with teams",
    ],
    link: "https://guide.techfleet.org/project-coordinator-portal/project-coordinator-handbook",
  },
];

export const handbookCategoryColors: Record<string, string> = {
  Agile: "bg-primary/10 text-primary border-primary/20",
  Operations: "bg-warning/10 text-warning border-warning/20",
  Training: "bg-success/10 text-success border-success/20",
};
