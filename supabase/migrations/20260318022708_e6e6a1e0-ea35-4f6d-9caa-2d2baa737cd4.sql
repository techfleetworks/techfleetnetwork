
INSERT INTO public.bdd_scenarios (scenario_id, feature_area, feature_area_number, title, gherkin, test_type, status) VALUES
('22.5', 'Grid Enhancements', 22, 'Clients tab uses AG Grid in table view', 'Given I am on the Clients admin tab\nWhen I switch to table view\nThen the clients table renders using AG Grid with sort, filter, and resize', 'manual', 'implemented'),
('22.6', 'Grid Enhancements', 22, 'Reset View button on all grids', 'Given any grid with a gridId\nWhen the grid renders\nThen a Reset View button appears above it\nAnd clicking it resets columns, filters, and sort to defaults', 'manual', 'implemented'),
('22.7', 'Grid Enhancements', 22, 'Applications column picker has all fields', 'Given I am viewing the submitted applications table\nWhen I open the Columns picker\nThen I see columns for profile, general app, and project app fields\nAnd toggling them shows/hides the corresponding grid column', 'manual', 'implemented');
