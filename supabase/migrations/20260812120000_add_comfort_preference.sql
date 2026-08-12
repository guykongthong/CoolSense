-- Occupant comfort preference — used by CoolSense V2 (coolSenseV2Calculation.ts)
-- to shift the setpoint ±2°C on top of the weather-driven ease, still
-- clamped to each mode's temperature range.
alter table room_config add column comfort_preference text not null default 'neutral'
  check (comfort_preference in ('cold', 'neutral', 'warm'));

-- /calculation now runs CoolSense V2 (calculateCoolSenseV2Settings) instead
-- of the base model directly. temperature_c continues to hold the actual
-- setpoint (adjusted_temp_c); these record what it was adjusted FROM/BY.
alter table ac_calculations add column base_temp_c numeric;
alter table ac_calculations add column comfort_preference text;
