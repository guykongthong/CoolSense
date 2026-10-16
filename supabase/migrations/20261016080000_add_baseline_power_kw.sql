-- Live baseline: what a static unit sized for full occupancy would draw in
-- the same weather. Filled by runCalculation; null for older rows.
alter table ac_calculations add column baseline_power_kw numeric;
