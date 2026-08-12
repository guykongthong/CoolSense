-- AC unit efficiency (SEER) — global input used in the power calculation.
-- 4.5 is the "Auto"/standard reference unit; a custom SEER scales power by
-- 4.5 ÷ seer. See supabase/functions/_shared/acCalculation.ts.
alter table room_config add column ac_seer numeric not null default 4.5 check (ac_seer > 0);

-- Manual location input for now (IP geolocation deferred — see CLAUDE.md).
-- Also feeds the later weather-by-location feature.
alter table room_config add column location text not null default '';

-- Thailand EGAT efficiency label — cosmetic only, shown in the UI when
-- location is Thailand, does not affect the power calculation.
alter table room_config add column egat_label text
  check (egat_label is null or egat_label in ('1', '2', '3', '4', '5', 'premium'));
