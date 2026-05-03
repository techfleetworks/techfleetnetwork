CREATE OR REPLACE FUNCTION public.fw_label(p_entity text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_entity
    WHEN 'deliverable' THEN 'Deliverable'
    WHEN 'deliverables' THEN 'Deliverable'
    WHEN 'workshop' THEN 'Workshop'
    WHEN 'workshops' THEN 'Workshop'
    WHEN 'milestone' THEN 'Milestone'
    WHEN 'project_milestone' THEN 'Milestone'
    WHEN 'project_milestones' THEN 'Milestone'
    WHEN 'duty' THEN 'Duty'
    WHEN 'duties' THEN 'Duty'
    WHEN 'role' THEN 'Role'
    WHEN 'practice' THEN 'Practice'
    WHEN 'practices' THEN 'Practice'
    WHEN 'skill' THEN 'Skill'
    WHEN 'skills' THEN 'Skill'
    WHEN 'tool' THEN 'Tool'
    WHEN 'tools' THEN 'Tool'
    WHEN 'activity' THEN 'Activity'
    WHEN 'activities' THEN 'Activity'
    WHEN 'job_function' THEN 'Job Function'
    WHEN 'job_functions' THEN 'Job Function'
    WHEN 'job_title' THEN 'Job Title'
    WHEN 'job_titles' THEN 'Job Title'
    WHEN 'stakeholder' THEN 'Stakeholder'
    WHEN 'stakeholders' THEN 'Stakeholder'
    WHEN 'agile_method' THEN 'Agile Method'
    WHEN 'agile_methods' THEN 'Agile Method'
    WHEN 'project' THEN 'Project'
    WHEN 'projects' THEN 'Project'
    WHEN 'resource' THEN 'Resource'
    WHEN 'resources' THEN 'Resource'
    WHEN 'relationship' THEN 'Relationship'
    WHEN 'relationships' THEN 'Relationship'
    ELSE initcap(replace(p_entity, '_', ' '))
  END;
$$;