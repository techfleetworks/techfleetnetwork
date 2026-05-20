import { ALL_AGILE_LESSON_IDS } from '../src/data/agile-course.ts';
import { ALL_OBSERVER_LESSON_IDS } from '../src/data/observer-course.ts';
import { ALL_TEAMWORK_LESSON_IDS } from '../src/data/teamwork-course.ts';
import { ALL_PROJECT_TRAINING_LESSON_IDS } from '../src/data/project-training-course.ts';
import { ALL_VOLUNTEER_LESSON_IDS } from '../src/data/volunteer-teams-course.ts';
import { ALL_DISCORD_LESSON_IDS } from '../src/data/discord-course.ts';
import { FIRST_STEPS_TASK_IDS } from '../src/pages/FirstStepsPage.tsx';
import { CONNECT_DISCORD_TASK_IDS } from '../src/pages/ConnectDiscordPage.tsx';
console.log(JSON.stringify({
  'connect-discord': { phase: 'first_steps', tier: 'onboarding', label: 'Connect Discord', lessons: [...CONNECT_DISCORD_TASK_IDS] },
  'onboarding': { phase: 'first_steps', tier: 'onboarding', label: 'First Steps Onboarding', lessons: [...FIRST_STEPS_TASK_IDS] },
  'agile-mindset': { phase: 'second_steps', tier: 'core', label: 'Agile Mindset', lessons: ALL_AGILE_LESSON_IDS },
  'observer-course': { phase: 'observer', tier: 'core', label: 'Observer Course', lessons: ALL_OBSERVER_LESSON_IDS },
  'agile-teamwork': { phase: 'third_steps', tier: 'core', label: 'Agile Teamwork', lessons: ALL_TEAMWORK_LESSON_IDS },
  'project-training': { phase: 'project_training', tier: 'core', label: 'Project Training', lessons: ALL_PROJECT_TRAINING_LESSON_IDS },
  'volunteer-teams': { phase: 'volunteer', tier: 'core', label: 'Volunteer Teams', lessons: ALL_VOLUNTEER_LESSON_IDS },
  'discord-learning': { phase: 'discord_learning', tier: 'core', label: 'Discord Learning', lessons: ALL_DISCORD_LESSON_IDS },
}, null, 2));
