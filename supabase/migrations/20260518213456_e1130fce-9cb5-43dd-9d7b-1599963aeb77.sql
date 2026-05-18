
-- Community Contributor Agreement workflow
CREATE TABLE IF NOT EXISTS public.community_agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  title text NOT NULL,
  body_html text NOT NULL,
  source_url text NOT NULL DEFAULT 'https://techfleet.org/community-contributor-terms-and-conditions',
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_agreement_version
  ON public.community_agreement_versions ((true)) WHERE is_current = true;
ALTER TABLE public.community_agreement_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view current agreement" ON public.community_agreement_versions;
CREATE POLICY "Authenticated can view current agreement"
  ON public.community_agreement_versions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage agreement versions" ON public.community_agreement_versions;
CREATE POLICY "Admins manage agreement versions"
  ON public.community_agreement_versions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS set_community_agreement_versions_updated_at ON public.community_agreement_versions;
CREATE TRIGGER set_community_agreement_versions_updated_at
  BEFORE UPDATE ON public.community_agreement_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.community_agreement_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.project_applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  version_id uuid NOT NULL REFERENCES public.community_agreement_versions(id),
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text
);
CREATE INDEX IF NOT EXISTS idx_cas_user ON public.community_agreement_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_cas_project ON public.community_agreement_signatures(project_id);
ALTER TABLE public.community_agreement_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own signatures" ON public.community_agreement_signatures;
CREATE POLICY "Users view own signatures"
  ON public.community_agreement_signatures FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all signatures" ON public.community_agreement_signatures;
CREATE POLICY "Admins view all signatures"
  ON public.community_agreement_signatures FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.project_applications
  ADD COLUMN IF NOT EXISTS community_agreement_required_at timestamptz,
  ADD COLUMN IF NOT EXISTS community_agreement_signed_at timestamptz;

CREATE OR REPLACE FUNCTION public.mirror_community_agreement_signed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.project_applications
     SET community_agreement_signed_at = NEW.signed_at
   WHERE id = NEW.application_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mirror_cas_signed_at ON public.community_agreement_signatures;
CREATE TRIGGER trg_mirror_cas_signed_at
  AFTER INSERT ON public.community_agreement_signatures
  FOR EACH ROW EXECUTE FUNCTION public.mirror_community_agreement_signed_at();

CREATE OR REPLACE FUNCTION public.sign_community_agreement(
  p_application_id uuid,
  p_user_agent text DEFAULT NULL
) RETURNS public.community_agreement_signatures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app record;
  v_version_id uuid;
  v_sig public.community_agreement_signatures;
  v_existing public.community_agreement_signatures;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT id, user_id, project_id, applicant_status, community_agreement_required_at
    INTO v_app FROM public.project_applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.user_id <> auth.uid() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'; END IF;
  IF v_app.community_agreement_required_at IS NULL THEN
    RAISE EXCEPTION 'Agreement not required for this application';
  END IF;
  SELECT * INTO v_existing FROM public.community_agreement_signatures WHERE application_id = p_application_id;
  IF FOUND THEN RETURN v_existing; END IF;
  SELECT id INTO v_version_id FROM public.community_agreement_versions WHERE is_current = true LIMIT 1;
  IF v_version_id IS NULL THEN RAISE EXCEPTION 'No current agreement version configured'; END IF;
  INSERT INTO public.community_agreement_signatures
    (application_id, user_id, project_id, version_id, ip_address, user_agent)
  VALUES (p_application_id, v_app.user_id, v_app.project_id, v_version_id,
          inet_client_addr(), left(coalesce(p_user_agent, ''), 1024))
  RETURNING * INTO v_sig;
  RETURN v_sig;
END;
$$;
REVOKE ALL ON FUNCTION public.sign_community_agreement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_community_agreement(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_community_agreement_required(p_application_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.project_applications
     SET community_agreement_required_at = COALESCE(community_agreement_required_at, now())
   WHERE id = p_application_id;
$$;
REVOKE ALL ON FUNCTION public.mark_community_agreement_required(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_community_agreement_required(uuid) TO service_role;

INSERT INTO public.community_agreement_versions (version, title, body_html, is_current)
VALUES (
  '2026-05-18',
  'Community Contributor Terms and Conditions',
  $body$<h1>Community Contributor Terms and Conditions</h1>
<p>The following terms and conditions ("Agreement") govern the contributor relationship between Tech Fleet ("Company") and you ("Contributor"). Please read the following terms and conditions carefully and contact us with any questions, comments or concerns: <a href="mailto:info@techfleet.org" target="_blank" rel="noopener">info@techfleet.org</a></p>
<h2>1. Services; Purpose; No Violation of Rights or Obligations.</h2>
<p>Contributors will receive access to Tech Fleet services should they choose. The Services are provided for a civic, charitable, mission-driven, or humanitarian purpose without expectation of compensation. Contributor agrees that they will not use or disclose at any time Contributor's own or any third party's confidential information or intellectual property in connection with the Services or otherwise for or on behalf of Company.</p>
<p>Contributor will receive access to the following services:</p>
<ul>
<li>Option to participate in cross-functional Agile team training with projects:
  <ul>
    <li>Project training does not cost anything for Contributors;</li>
    <li>Project training is not considered volunteering, but considered training;</li>
    <li>During the project, contributors work under the guidance of mentors and clients;</li>
    <li>There is no requirement for specific schedules or hours worked each week for trainees, although there are expectations for teammates to spend time on teams in order to get the most out of training;</li>
    <li>Contributor must apply and be selected by the team, and agree to join the project based on Tech Fleet's guidelines described in <a href="https://guide.techfleet.org/" target="_blank" rel="noopener">https://guide.techfleet.org</a>;</li>
    <li>Contributor can collaborate with clients, peers, and mentors;</li>
    <li>The training in projects, even though it includes actual operation of Tech Fleet or its clients, is similar to that which would be given in a vocational school;</li>
    <li>The training is for the sole benefit of Contributors; it involves clients from nonprofits or open source efforts so that the trainees can get this crucial part of their experience building;</li>
    <li>The trainees do not displace regular employees, but they do work with Tech Fleet leads, Tech Fleet mentors, and client employees with supervision;</li>
    <li>The trainees are not necessarily entitled to a job at the conclusion of the training period;</li>
    <li>Tech Fleet, clients, and the trainees understand that the trainees are not entitled to wages for the time spent training;</li>
  </ul>
</li>
<li>Option to attend advanced masterclasses for a small registration fee;</li>
<li>Option to receive peer-to-peer support from other Contributors in the Tech Fleet community over online forums.</li>
</ul>
<h2>2. Ownership; Rights; Proprietary Information.</h2>
<p>Company will own all right, title and interest (including patent rights, copyrights, trade secret rights, trademark rights, sui generis database rights and all other intellectual property rights of any sort throughout the world) relating to any and all inventions (whether or not patentable), ideas and information made or conceived or reduced to practice, in whole or in part, by or for or on behalf of Contributor during the term of this Agreement that relate to the subject matter of or arise out of or in connection with the Services or any Proprietary Information (as defined below) (collectively, "Inventions") and Contributor will promptly disclose and provide all Inventions to Company. Contributor hereby makes all assignments necessary to accomplish the foregoing ownership. Contributor will assist Company, at Company's expense, to further evidence, record and perfect such assignments, and to perfect, obtain, maintain, enforce and defend any rights assigned. Contributor hereby irrevocably appoints Company as its attorneys-in-fact, coupled with an interest, to act for and on Contributor's behalf to execute and file any document and take all other actions to further the foregoing.</p>
<p>Contributor agrees that all Inventions and all other information developed, learned or obtained by or for or on behalf of Contributor in connection with the Services or that are received by or for Company in confidence, constitute "Proprietary Information." Contributor will hold in confidence and not disclose or, except in performing the Services, use any Proprietary Information. However, Contributor will not be obligated under this paragraph with respect to information Contributor can document is or becomes readily publicly available without restriction through no fault of Contributor. Upon termination or as otherwise requested by Company, Contributor will promptly provide to Company all items and copies containing or embodying Proprietary Information.</p>
<p>To the extent allowed by law, Section 2.a and any license granted Company hereunder includes all moral rights. Furthermore, Contributor agrees that notwithstanding any rights of publicity, privacy or otherwise (whether or not statutory) anywhere in the world, and without any further compensation, Company may and is hereby authorized to (and to allow others to) use Contributor's name in connection with promotion of its services. To the extent any of the foregoing is ineffective under applicable law, Contributor hereby provides any and all ratifications and consents necessary to accomplish the purposes of the foregoing to the extent possible. Contributor will confirm any such ratifications and consents from time to time as requested by Company.</p>
<p>If any part of the Services or Inventions or information provided hereunder is based on, incorporates, or is an improvement or derivative of, or cannot be reasonably and fully made, used, reproduced, distributed and otherwise exploited without using or violating technology or intellectual property rights owned by or licensed to Contributor (or any person involved in the Services) and not assigned hereunder, Contributor hereby grants Company and its successors a perpetual, irrevocable, worldwide royalty-free, non-exclusive, sublicensable right and license to exploit and exercise all such technology and intellectual property rights in support of Company's exercise or exploitation of the Services, Inventions, other work or information performed or provided hereunder, or any assigned rights (including any modifications, improvements and derivatives of any of them).</p>
<h2>3. Warranties and Other Obligations.</h2>
<p>Contributor represents, warrants and covenants that: (i) all work under this Agreement shall be Contributor's original work and none of the Services or Inventions will infringe, misappropriate or violate any intellectual property or other right of any person or entity (including, without limitation, Contributor); and (ii) Contributor has the full right to allow him or her to provide Company with the assignments and rights provided for herein.</p>
<h2>4. Term; Termination.</h2>
<p>The term of this Agreement is set forth until the Contributor leaves the community. If Contributor breaches a material provision of this Agreement or any Tech Fleet policies described on <a href="https://guide.techfleet.org/" target="_blank" rel="noopener">https://guide.techfleet.org</a>, the Company may terminate this Agreement immediately. Sections 2 through 8 of this Agreement shall survive any termination or expiration.</p>
<h2>5. Relationship of the Parties; No Employee Benefits.</h2>
<p>Contributor is not an employee, agent or independent contractor of Company. Contributor is not entitled to participate in any employee benefit plans, fringe benefit programs, group insurance arrangements or similar programs of Company.</p>
<h2>6. Assignment.</h2>
<p>This Agreement and the services contemplated hereunder are personal to Contributor and Contributor will not have the right or ability to assign, transfer or subcontract any rights or obligations under this Agreement without the written consent of Company. Any attempt to do so shall be void. Company may fully assign and transfer this Agreement in whole or part.</p>
<h2>7. Notice.</h2>
<p>All notices under this Agreement shall be in writing and shall be deemed given (a) when personally delivered, (b) when sent by electronic mail to the address set forth below on Contributor's signature page hereto, as updated from time to time by notice to the Company, or facsimile if sent during normal business hours of the recipient; if not, then on the next business day or (c) three days after being sent by prepaid certified or registered U.S. mail to the address of the party to be noticed as set forth herein or to such other address as such party last provided to the other by written notice.</p>
<h2>8. Miscellaneous.</h2>
<p>Any breach of Section 2 or 3 will cause irreparable harm to Company for which damages would not be an adequate remedy, and therefore, Company will be entitled to injunctive relief with respect thereto in addition to any other remedies. This Agreement represents the entire understanding between the parties with respect to the subject matter hereof to the exclusion of all other terms and conditions, and no modifications or waivers to this Agreement will be effective unless in writing and signed by both parties. In the event that any provision of this Agreement shall be determined to be illegal or unenforceable, that provision will be limited or eliminated to the minimum extent necessary so that this Agreement shall otherwise remain in full force and effect and enforceable. This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware without regard to the conflicts of laws provisions thereof.</p>$body$,
  true
) ON CONFLICT (version) DO NOTHING;
