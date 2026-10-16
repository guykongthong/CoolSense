-- Cleaning alerts. ac_power_readings holds hourly measured AC power next to
-- what CoolSense V3 expects under the same conditions; a dirty filter or coil
-- shows up as measured power drifting above expected. maintenance_alerts holds
-- the alerts raised by supabase/functions/maintenance.

create table ac_power_readings (
  id uuid primary key default gen_random_uuid(),
  measured_at timestamptz not null,
  power_kw numeric not null check (power_kw >= 0),
  expected_power_kw numeric not null check (expected_power_kw >= 0),
  setpoint_c numeric not null,
  outside_temp_c numeric not null,
  humidity_pct numeric,
  people_count int not null default 0,
  capacity_constrained boolean not null default false,
  source text not null default 'mock' check (source in ('mock', 'meter')),
  created_at timestamptz not null default now()
);

create index ac_power_readings_measured_at_idx on ac_power_readings (measured_at desc);

create table maintenance_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  severity text not null check (severity in ('watch', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'dismissed', 'resolved')),
  excess_pct numeric not null,
  baseline_ratio numeric,
  recent_ratio numeric,
  buckets_evaluated int not null default 0,
  worst_bucket jsonb,
  window_start timestamptz,
  window_end timestamptz,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  note text
);

-- At most one live alert at a time; evaluation updates it in place.
create unique index maintenance_alerts_one_active_idx
  on maintenance_alerts ((true))
  where status in ('open', 'acknowledged');

alter table room_config add column last_serviced_at timestamptz;

grant select, insert, update, delete on ac_power_readings, maintenance_alerts to service_role;
grant select on ac_power_readings, maintenance_alerts to anon, authenticated;

alter table ac_power_readings enable row level security;
alter table maintenance_alerts enable row level security;

create policy "Allow read access to ac_power_readings" on ac_power_readings
  for select to anon, authenticated using (true);

create policy "Allow read access to maintenance_alerts" on maintenance_alerts
  for select to anon, authenticated using (true);

alter publication supabase_realtime add table ac_power_readings;
alter publication supabase_realtime add table maintenance_alerts;
