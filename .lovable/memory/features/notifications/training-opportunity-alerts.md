---
name: Training Opportunity Alerts
description: Automated in-app and email alerts notify users of new training opportunities and project status changes
type: feature
---

Automated in-app and email alerts notify users of new training opportunities and project status changes. The `notify_project_opening` PostgreSQL trigger fires on:
- INSERT with `project_status = 'apply_now'` (new opening), and
- UPDATE whenever `project_status` changes (any status transition).

Qualified users are those with `notify_training_opportunities = true` AND `'Train on project teams' = ANY(interests)`. They receive an in-app notification (Rocket icon) titled either "ALERT! New Project Training Opportunity" (for `apply_now` events) or "Project Status Update: [Client] — [Friendly Name]" (for other transitions). Email alerts are sent only if the user has also enabled `notify_announcements`. The email idempotency key is scoped per-status (`project-status-{projectId}-{status}-{userId}`) so each transition can send once. Notifications include client + friendly name, project type, phase, and direct CTA to the project opening page.
