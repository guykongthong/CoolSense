-- CoolSense V3: a realistic-HVAC-physics comparison model, added alongside
-- the existing static/CoolSense V2 comparison in simulation_runs and
-- simulation_hourly_data. Additive only — no existing column changes.
-- Default 0 for existing historical rows, which predate V3.
alter table simulation_runs add column static_v3_energy_kwh numeric not null default 0;
alter table simulation_runs add column coolsense_v3_energy_kwh numeric not null default 0;
alter table simulation_runs add column static_v3_co2_kg numeric not null default 0;
alter table simulation_runs add column coolsense_v3_co2_kg numeric not null default 0;
alter table simulation_runs add column static_v3_cost_baht numeric not null default 0;
alter table simulation_runs add column coolsense_v3_cost_baht numeric not null default 0;
alter table simulation_runs add column v3_pct_reduction numeric not null default 0;

alter table simulation_hourly_data add column static_v3_power_kw numeric not null default 0;
alter table simulation_hourly_data add column coolsense_v3_power_kw numeric not null default 0;
alter table simulation_hourly_data add column static_v3_cumulative_kwh numeric not null default 0;
alter table simulation_hourly_data add column coolsense_v3_cumulative_kwh numeric not null default 0;
alter table simulation_hourly_data add column static_v3_cumulative_co2 numeric not null default 0;
alter table simulation_hourly_data add column coolsense_v3_cumulative_co2 numeric not null default 0;
