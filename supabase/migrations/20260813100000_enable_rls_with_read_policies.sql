-- RLS was enabled directly on prod (outside migrations) with zero policies
-- defined, which silently blocks ALL anon/authenticated access — including
-- reads — regardless of the SELECT grants from
-- 20260812095500_grant_app_table_privileges.sql. This makes that
-- enable-RLS change explicit and adds the read policies it was missing, so
-- the app's anon-key reads work again while keeping RLS itself enabled
-- (the actually-correct fix for the earlier "RLS disabled" security
-- advisory, rather than reverting to grants-only access control).
--
-- Writes remain locked down: all inserts/updates go through edge functions
-- using the service_role key, which bypasses RLS entirely regardless of
-- policies defined here — these policies only ever grant SELECT.
alter table room_config enable row level security;
alter table occupancy_readings enable row level security;
alter table ac_calculations enable row level security;
alter table simulation_runs enable row level security;
alter table simulation_hourly_data enable row level security;
alter table weather_readings enable row level security;

create policy "Allow read access to room_config" on room_config
  for select to anon, authenticated using (true);

create policy "Allow read access to occupancy_readings" on occupancy_readings
  for select to anon, authenticated using (true);

create policy "Allow read access to ac_calculations" on ac_calculations
  for select to anon, authenticated using (true);

create policy "Allow read access to simulation_runs" on simulation_runs
  for select to anon, authenticated using (true);

create policy "Allow read access to simulation_hourly_data" on simulation_hourly_data
  for select to anon, authenticated using (true);

create policy "Allow read access to weather_readings" on weather_readings
  for select to anon, authenticated using (true);
