-- Publish occupancy_readings changes to Supabase Realtime so the dashboard
-- can subscribe to new ML people-count inserts instead of polling.
alter publication supabase_realtime add table occupancy_readings;
