-- The init migration created these tables without granting Data API roles
-- access (matches the new "don't auto-expose" default). Without this, every
-- edge function using supabaseAdmin, and the frontend's anon-key reads, get
-- "permission denied for table" — silently swallowed by fallback code in
-- calculation/index.ts, so this went unnoticed until testing the endpoints
-- end-to-end. RLS is not enabled on these tables (no auth in this MVP), so
-- grants alone control access.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  room_config,
  occupancy_readings,
  ac_calculations,
  simulation_runs,
  simulation_hourly_data
to service_role;

grant select on
  room_config,
  occupancy_readings,
  ac_calculations,
  simulation_runs,
  simulation_hourly_data
to anon, authenticated;
