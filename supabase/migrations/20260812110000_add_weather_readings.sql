-- Outside weather fetched from weatherapi.com for room_config.location, used
-- to factor outdoor heat/humidity load into the AC calculation. Written by
-- supabase/functions/weather, read by supabase/functions/calculation.
create table weather_readings (
  id uuid primary key default gen_random_uuid(),
  location text not null,
  temp_c numeric not null,
  humidity_pct numeric not null check (humidity_pct >= 0 and humidity_pct <= 100),
  condition text,
  condition_icon_url text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index weather_readings_fetched_at_idx on weather_readings (fetched_at desc);

alter table ac_calculations add column outside_temp_c numeric;
alter table ac_calculations add column humidity_pct numeric;
alter table ac_calculations add column weather_reading_id uuid references weather_readings (id);
alter table ac_calculations add column weather_condition_icon_url text;

grant select, insert, update, delete on weather_readings to service_role;
grant select on weather_readings to anon, authenticated;
