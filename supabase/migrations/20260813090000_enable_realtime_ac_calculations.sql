-- Publish ac_calculations changes to Supabase Realtime so the People page's
-- current-AC-setting card updates live as /calculation runs, mirroring
-- occupancy_readings' realtime setup (20260812081725_enable_realtime_occupancy.sql).
alter publication supabase_realtime add table ac_calculations;
