
-- Seed missing workshops
INSERT INTO public.reference_workshops (slug, name, description, category, source)
VALUES
  ('agile-coaching-residency','Agile Coaching Residency','Agile Coaching Residency (placeholder description; to be filled in by content team).','Residency','csv'),
  ('agile-ux-masterclass','Agile UX Masterclass','Agile UX Masterclass (placeholder).','Masterclass','csv'),
  ('ai-enabled-product-requirements-masterclass','AI-Enabled Product Requirements Masterclass','Placeholder.','Masterclass','csv'),
  ('ai-enabled-systems-design-masterclass','AI-Enabled Systems Design Masterclass','Placeholder.','Masterclass','csv'),
  ('ai-enabled-ux-research-masterclass','AI-Enabled UX Research Masterclass','Placeholder.','Masterclass','csv'),
  ('articulation-and-buy-in-generation-masterclass','Articulation and Buy In Generation Masterclass','Placeholder.','Masterclass','csv'),
  ('brain-psychology-and-ui-design-masterclass','Brain Psychology and UI Design Masterclass','Placeholder.','Masterclass','csv'),
  ('product-operations-masterclass','Product Operations Masterclass','Placeholder.','Masterclass','csv'),
  ('service-leadership-masterclass','Service Leadership Masterclass','Placeholder.','Masterclass','csv'),
  ('service-leadership-residency','Service Leadership Residency','Placeholder.','Residency','csv'),
  ('storytelling-with-ux-data-masterclass','Storytelling with UX Data Masterclass','Placeholder.','Masterclass','csv'),
  ('website-design-masterclass','Website Design Masterclass','Placeholder.','Masterclass','csv'),
  ('workshopping-and-facilitation-masterclass','Workshopping and Facilitation Masterclass','Placeholder.','Masterclass','csv')
ON CONFLICT (slug) DO NOTHING;

-- Seed missing stakeholder
INSERT INTO public.reference_stakeholders (slug, name, description, category, source)
VALUES ('internal-teammate','Internal Teammate','Internal Teammate stakeholder (placeholder).','Internal','csv')
ON CONFLICT (slug) DO NOTHING;

-- Replay staging to resolve any rows whose entities now exist
SELECT public.fw_replay_staging();

-- Refresh neighbors MV
REFRESH MATERIALIZED VIEW CONCURRENTLY public.framework_node_neighbors_mv;
