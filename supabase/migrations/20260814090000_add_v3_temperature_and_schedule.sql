-- Per-hour setpoint values, for the Simulation page's temperature-over-time
-- graph. Default 0 for existing historical rows, which predate this column
-- (matches add_coolsense_v3.sql's convention for the same reason).
alter table simulation_hourly_data add column static_v3_temperature_c numeric not null default 0;
alter table simulation_hourly_data add column coolsense_v3_temperature_c numeric not null default 0;

-- Optional operating-hours schedule (simulation-only — not wired into the
-- live /calculation endpoint, see CLAUDE.md). Nullable: unset means "always
-- on," today's behavior. Stored on simulation_runs for traceability of what
-- schedule (if any) a given run used, same pattern as static_temp_c /
-- comfort_preference.
alter table simulation_runs add column schedule_start_hour smallint;
alter table simulation_runs add column schedule_end_hour smallint;
