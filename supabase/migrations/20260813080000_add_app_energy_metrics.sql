-- App infrastructure energy footprint (Vercel + Supabase + weatherapi.com)
-- and net savings after subtracting it from the CoolSense V3 comparison.
-- See docs/superpowers/specs/2026-08-13-app-energy-integration-design.md.
alter table simulation_runs add column app_energy_kwh numeric not null default 0;
alter table simulation_runs add column net_energy_saved_kwh numeric not null default 0;
alter table simulation_runs add column net_co2_saved_kg numeric not null default 0;
alter table simulation_runs add column net_cost_saved_baht numeric not null default 0;
