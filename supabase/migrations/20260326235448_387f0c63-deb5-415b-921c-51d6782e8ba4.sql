INSERT INTO public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, test_type, status)
VALUES
  ('DISC-SLASH-001', 'Discord Slash Command', 18, 'Fleety responds to /fleety slash command',
   E'Feature: /fleety Discord Slash Command\n\n  Scenario: User asks a question via /fleety\n    Given the Discord bot is configured with the Interactions Endpoint\n    And the /fleety slash command is registered\n    When a user types "/fleety question: What is Tech Fleet?"\n    Then Discord sends an interaction to the edge function\n    And the function returns a deferred response within 3 seconds\n    And the function queries the knowledge base\n    And the function sends the AI response as a followup message',
   'manual', 'implemented'),

  ('DISC-SLASH-002', 'Discord Slash Command', 18, 'Discord signature verification rejects invalid requests',
   E'Feature: /fleety Discord Slash Command\n\n  Scenario: Invalid signature is rejected\n    Given a request is sent to the discord-interactions endpoint\n    When the x-signature-ed25519 header is missing or invalid\n    Then the function returns a 401 Unauthorized response',
   'manual', 'implemented'),

  ('DISC-SLASH-003', 'Discord Slash Command', 18, 'Discord PING verification succeeds',
   E'Feature: /fleety Discord Slash Command\n\n  Scenario: Discord PING handshake\n    Given Discord sends a PING interaction (type 1)\n    When the signature is valid\n    Then the function responds with PONG (type 1)\n    And the Interactions Endpoint is verified',
   'manual', 'implemented'),

  ('DISC-SLASH-004', 'Discord Slash Command', 18, 'AI response is truncated for Discord message limit',
   E'Feature: /fleety Discord Slash Command\n\n  Scenario: Long AI response is truncated\n    Given the AI generates a response longer than 1950 characters\n    When the followup is posted to Discord\n    Then the message is truncated to 1950 characters\n    And a truncated notice is appended',
   'none', 'implemented'),

  ('DISC-SLASH-005', 'Discord Slash Command', 18, 'Slash command registration via edge function',
   E'Feature: /fleety Discord Slash Command\n\n  Scenario: Register /fleety command\n    Given the DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID are configured\n    When the register-fleety-command function is invoked\n    Then the /fleety slash command is registered globally with Discord\n    And it accepts a required question string option',
   'manual', 'implemented')
ON CONFLICT (scenario_id) DO NOTHING;