INSERT INTO bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin, status, test_type) VALUES
('project_blast', 21, 'PB-021','Admin sender receives self-copy of every blast',
$g$Feature: Project Blast self-copy
  Scenario: Admin sender receives a copy
    Given an admin user with a valid profile email
    And a project with at least one completed applicant
    When the admin sends a blast
    Then [Code] queueTransactionalEmail is invoked once with recipientEmail = sender email and idempotencyKey = "blast-{blastId}-sender-{userId}"
    And [DB] project_blast_recipients contains a row where user_id = sender userId
    And [DB] notifications has NO row inserted for the sender self-copy
    And [UI] recipient_count equals applicant count (sender copy excluded)$g$,
'not_built','e2e'),
('project_blast', 22, 'PB-022','Recipient privacy: 1:1 sends, no Cc/To leakage',
$g$Feature: Project Blast privacy
  Scenario: Recipients never see other recipients
    Given a project with N completed applicants
    When the admin sends a blast
    Then [Code] each queueTransactionalEmail call has exactly one recipientEmail and no Cc/Bcc
    And [DB] project_blast_recipients has N applicant rows plus 1 sender-copy row
    And [UI] no recipient sees another recipient address$g$,
'not_built','e2e'),
('project_blast', 23, 'PB-023','Sender already in applicant list is not double-sent',
$g$Feature: Project Blast dedupe
  Scenario: Sender applied to their own project
    Given an admin who is also a completed applicant on the project
    When the admin sends a blast
    Then [Code] queueTransactionalEmail is invoked exactly once for the sender email
    And [DB] project_blast_recipients contains exactly one row for the sender
    And [UI] recipient_count equals applicant count$g$,
'not_built','e2e')
ON CONFLICT (scenario_id) DO UPDATE SET gherkin=EXCLUDED.gherkin, title=EXCLUDED.title, feature_area_number=EXCLUDED.feature_area_number, updated_at=now();