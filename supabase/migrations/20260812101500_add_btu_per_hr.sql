-- Required cooling capacity in BTU/hr, the industry-standard unit AC units
-- are rated in. power_kw is now derived from this via power = btu_per_hr ÷
-- (seer × 1000) — see supabase/functions/_shared/acCalculation.ts.
alter table ac_calculations add column btu_per_hr numeric not null default 0;
