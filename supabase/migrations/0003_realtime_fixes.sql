-- Fix realtime: project_runners inserts must broadcast so the dashboard
-- can flip the pairing card → "Online" without a refresh. Also add
-- pairing_codes for future "code claimed" indicators.
alter publication supabase_realtime add table project_runners;
alter publication supabase_realtime add table pairing_codes;
