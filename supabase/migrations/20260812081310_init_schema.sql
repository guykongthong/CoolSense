-- Single-row config for the one test room. room_size is changeable by an admin.
create table room_config (
  id int primary key default 1,
  building_name text not null default '',
  room_size text not null default 'medium' check (room_size in ('small', 'medium', 'large')),
  updated_at timestamptz not null default now(),
  constraint room_config_singleton check (id = 1)
);

insert into room_config (id) values (1);

-- People count for the room, written by the ML pipeline roughly once a minute.
-- TODO: ML JSON shape — columns/`source` values will change once the teammate's
-- Google Cloud service output format is known.
create table occupancy_readings (
  id uuid primary key default gen_random_uuid(),
  people_count int not null check (people_count >= 0),
  source text not null default 'ml_video',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index occupancy_readings_captured_at_idx on occupancy_readings (captured_at desc);

-- Result of running the AC mode algorithm against an occupancy reading + weather input.
create table ac_calculations (
  id uuid primary key default gen_random_uuid(),
  occupancy_reading_id uuid references occupancy_readings (id),
  weather text not null check (weather in ('hot', 'warm', 'cool')),
  ac_mode text not null check (ac_mode in ('eco', 'moderate', 'full')),
  temperature_c numeric not null,
  fan_speed int not null,
  power_kw numeric not null,
  calculated_at timestamptz not null default now()
);

-- Summary of a current-vs-smart comparison run, for dashboard headline metrics.
create table simulation_runs (
  id uuid primary key default gen_random_uuid(),
  duration_hours int not null,
  current_energy_kwh numeric not null,
  smart_energy_kwh numeric not null,
  current_co2_kg numeric not null,
  smart_co2_kg numeric not null,
  current_cost_baht numeric not null,
  smart_cost_baht numeric not null,
  pct_reduction numeric not null,
  created_at timestamptz not null default now()
);

-- Per-hour series backing the dashboard graphs (line: power over time; area: cumulative energy/CO2).
create table simulation_hourly_data (
  id uuid primary key default gen_random_uuid(),
  simulation_run_id uuid not null references simulation_runs (id) on delete cascade,
  hour_index int not null,
  current_power_kw numeric not null,
  smart_power_kw numeric not null,
  current_cumulative_kwh numeric not null,
  smart_cumulative_kwh numeric not null,
  current_cumulative_co2 numeric not null,
  smart_cumulative_co2 numeric not null
);

create index simulation_hourly_data_run_idx on simulation_hourly_data (simulation_run_id, hour_index);
