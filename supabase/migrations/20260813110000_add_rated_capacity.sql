-- The AC unit's actual rated cooling capacity (BTU/hr), as entered on the
-- Information page — distinct from the *computed* required BTU/hr, which
-- is derived from room area + occupancy + weather (see acCalculation.ts).
-- Nullable: most rooms won't set this, and omitting it preserves today's
-- behavior exactly (no capacity ceiling applied).
alter table room_config add column rated_capacity_btu_per_hr numeric;

-- True when the room's rated_capacity_btu_per_hr was lower than the
-- computed required BTU/hr for that calculation — the unit was run at its
-- own max and still couldn't fully meet demand. See runCalculation.ts.
alter table ac_calculations add column capacity_constrained boolean not null default false;
