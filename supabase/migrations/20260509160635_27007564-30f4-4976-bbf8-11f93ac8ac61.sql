
CREATE TYPE public.ticket_inbox_type AS ENUM ('support', 'bug', 'internal');
CREATE TYPE public.ticket_status AS ENUM ('open', 'pending', 'snoozed', 'resolved');

CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatwoot_conversation_id BIGINT NOT NULL UNIQUE,
  chatwoot_account_id BIGINT NOT NULL,
  chatwoot_inbox_id BIGINT NOT NULL,
  inbox_type public.ticket_inbox_type NOT NULL,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_identifier TEXT,
  subject TEXT NOT NULL DEFAULT '',
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority TEXT,
  assignee_email TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_admin_count INT NOT NULL DEFAULT 0,
  unread_owner_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_owner ON public.tickets (owner_user_id, last_message_at DESC);
CREATE INDEX idx_tickets_inbox_status ON public.tickets (inbox_type, status, last_message_at DESC);

CREATE TRIGGER trg_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "Admins view all tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role writes tickets"
  ON public.tickets FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  chatwoot_conversation_id BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_events_ticket ON public.ticket_events (ticket_id, created_at DESC);
CREATE INDEX idx_ticket_events_conv ON public.ticket_events (chatwoot_conversation_id, created_at DESC);

ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view ticket events"
  ON public.ticket_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role writes ticket events"
  ON public.ticket_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "No updates ticket events"
  ON public.ticket_events FOR UPDATE USING (false);
CREATE POLICY "No deletes ticket events"
  ON public.ticket_events FOR DELETE USING (false);

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin) VALUES
('Chatwoot Ticketing', 1122, 'T-CHATWOOT-001', 'Trainee creates a support ticket via embedded widget',
$$Feature: Chatwoot ticketing - widget create
  Scenario: Trainee creates a support ticket via embedded widget
    Given a signed-in trainee on any page in Tech Fleet Network
    When they open the support widget and send a message
    Then [UI] the widget shows their message and a "We'll reply soon" status
    And  [DB] a row is inserted into public.tickets with inbox_type='support' and owner_user_id=trainee.id
    And  [Code] the chatwoot-webhook edge function fires conversation_created and writes a ticket_events row$$),

('Chatwoot Ticketing', 1122, 'T-CHATWOOT-002', 'Status changes in Chatwoot sync to Tech Fleet mirror',
$$Feature: Chatwoot ticketing - status sync
  Scenario: Admin resolves a ticket in Chatwoot
    Given an open ticket exists in public.tickets
    When an admin marks the conversation as resolved in Chatwoot
    Then [UI] the trainee sees the ticket card move to a "Resolved" group within 30 seconds
    And  [DB] public.tickets.status = 'resolved' and last_message_at updates
    And  [Code] chatwoot-webhook records a conversation_status_changed event$$),

('Chatwoot Ticketing', 1122, 'T-CHATWOOT-003', 'Admin replies trigger an in-app notification',
$$Feature: Chatwoot ticketing - admin reply notification
  Scenario: Admin replies to a trainee ticket
    Given a trainee owns conversation 42 in Chatwoot
    When an admin sends an outgoing message in that conversation
    Then [UI] the trainee's notification bell increments and the ticket shows "New reply"
    And  [DB] a public.notifications row is inserted with notification_type='ticket_reply' and link_url='/support'
    And  [Code] chatwoot-webhook handles message_created with sender.type='User' as admin reply$$),

('Chatwoot Ticketing', 1122, 'T-CHATWOOT-004', 'Bug-inbox tickets flow into the triage queue',
$$Feature: Chatwoot ticketing - bug routing
  Scenario: Trainee submits a bug report
    Given the user clicks "Report a bug" in Tech Fleet Network
    When the resulting Chatwoot conversation lands in the Bug Reports inbox
    Then [UI] the bug appears in the trainee's /support list under "Bug Reports"
    And  [DB] a row is inserted into public.agent_fix_queue with source='chatwoot' and external_ref=conversation_id
    And  [Code] chatwoot-webhook routes inbox_type='bug' into the triage pipeline$$),

('Chatwoot Ticketing', 1122, 'T-CHATWOOT-005', 'RLS prevents trainees from seeing other trainees tickets',
$$Feature: Chatwoot ticketing - RLS isolation
  Scenario: Trainee A queries tickets
    Given trainee A and trainee B each own one ticket
    When trainee A queries public.tickets via PostgREST
    Then [UI] /support shows only trainee A's ticket
    And  [DB] the SELECT returns exactly 1 row (the one with owner_user_id = A.id)
    And  [Code] no service-role bypass occurs in the user-context query$$),

('Chatwoot Ticketing', 1122, 'T-CHATWOOT-006', 'Webhook rejects requests with invalid signatures',
$$Feature: Chatwoot ticketing - webhook signature
  Scenario: Forged webhook request
    Given the chatwoot-webhook edge function is deployed
    When a request arrives with a missing or wrong X-Chatwoot-Signature header
    Then [UI] no UI change occurs anywhere
    And  [DB] no rows are written to public.tickets or public.ticket_events
    And  [Code] the edge function returns HTTP 401 and audit-wrapper logs an unauthorized_webhook event$$);
