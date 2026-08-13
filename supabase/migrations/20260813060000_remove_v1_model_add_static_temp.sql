-- simulation/run now compares a configurable static baseline (default 25°C,
-- previously a hardcoded constant) against CoolSense V2 directly — the old
-- V1 model (calculateAcSettings) is no longer exposed as a separate
-- comparison point, only used internally by CoolSense V2's own calc. These
-- columns record what the static baseline was set to for each run.
alter table simulation_runs add column static_temp_c numeric not null default 25;
alter table simulation_runs add column comfort_preference text not null default 'neutral'
  check (comfort_preference in ('cold', 'neutral', 'warm'));
