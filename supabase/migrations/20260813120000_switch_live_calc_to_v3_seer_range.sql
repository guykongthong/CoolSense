-- The live /calculation endpoint now runs CoolSense V3 (STANDARD_SEER_V3 =
-- 15, a real-world manufacturer SEER range of 13-25) instead of V2's
-- placeholder-calibrated STANDARD_SEER = 4.5. The existing room_config row's
-- ac_seer (4.5, or whatever was previously saved) is now outside the valid
-- range enforced by room-config's own MIN_AC_SEER/MAX_AC_SEER — backfill it
-- to the new default so the Information page doesn't load an
-- already-invalid value, and update the column default for future rows.
alter table room_config alter column ac_seer set default 15;
update room_config set ac_seer = 15 where ac_seer < 13 or ac_seer > 25;
