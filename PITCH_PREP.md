# Pitch Prep — Everything About This Project

One-stop reference for pitching: the problem, the math, why the math is defensible, what changed and why, and answers to hard questions judges/professors are likely to ask. Written 2026-08-14, reflects the **live V3 model**.

---

## 1. The Elevator Pitch (30 sec)

> AC systems waste energy cooling empty rooms. We built a smart system that tracks real occupancy — manually or live via webcam + Gemini vision — and continuously recalculates the exact cooling capacity a room needs, instead of running one fixed setpoint 24/7. We validated it with a 168-hour hotel simulation comparing our system against a fairly-sized "always-on" baseline, using cooling-load physics an HVAC engineer would recognize, not made-up constants.

Full 5-minute script version: see the pitch draft from this session (ask to regenerate if needed — not stored as a file since it's a live script you'll rehearse, not a spec).

---

## 2. Problem / Solution / Impact

- **Problem:** AC systems in hotels, offices, malls run full blast in empty/low-occupancy rooms.
- **Solution:** Adjust temperature & fan speed based on real-time occupancy (manual input or live webcam headcount via Gemini vision).
- **Impact:** Measurable energy savings → CO₂ reduction → cost savings, demonstrated on a simulated week of building data.
- **Scope:** Software only, 2-day hackathon, no hardware control — camera is the only sensor input.

---

## 3. How the System Works End-to-End

**Inputs collected:**
- Building name, location (free text — feeds live weather lookup and the Thailand-only EGAT field)
- Room size: small / medium / large (maps to representative m², see §4)
- People count: manual slider/number **or** live webcam monitoring (frame captured every 5s, sent to Gemini vision, headcount inserted automatically)
- AC unit efficiency (SEER): defaults to 15 (the V3 reference unit), or a custom value in [13.0, 25.0]
- Thailand EGAT star label (1-5 or "premium") — cosmetic only, shown only when location = Thailand, never affects the calculation
- Comfort preference: cold / neutral / warm — shifts setpoint ±2°C

**Live weather display** — the Information page shows current outside temperature, humidity, and condition for the saved location (fetched from weatherapi.com, updated each time the location is saved or when the page loads)

**Not manually chosen:** outside temperature & humidity — fetched live from weatherapi.com for the given location. This was a deliberate choice over a hot/warm/cool dropdown, so the demo reflects real current weather.

**Pipeline:**
```
People count + room m² → occupancy density (people ÷ m²)
        ↓
density → AC mode (eco / moderate / full) → base setpoint + fan speed
        ↓
room m² + people count → required cooling load (BTU/hr)   [V3, see §4]
        ↓
outside temp/humidity → weather load multiplier → weather-adjusted BTU/hr
        ↓
weather-adjusted BTU/hr ÷ (SEER × 1000) → power_kw
        ↓
power_kw × time → energy (kWh) → CO₂ (kg) → cost (baht)
```

---

## 4. The Core Formula (CoolSense V3 — live model)

```
occupancy_density = people_count ÷ room_m²

required_btu_per_hr = (150 × room_m²) + (400 × people_count)
                        └── envelope/solar load    └── occupant heat load

weather_load_multiplier = max(0.5, 1 + 0.02×(outside_temp_c − 33) + 0.003×(humidity_pct − 60))

weather_adjusted_btu_per_hr = required_btu_per_hr × weather_load_multiplier

power_kw = weather_adjusted_btu_per_hr ÷ (selected_seer × 1000)
```

**Mode selection (density-driven, sets setpoint/fan only — NOT capacity):**

| Mode | Density (people/m²) | Base temp | Fan |
|---|---|---|---|
| Eco | < 0.05 | 26°C | 1 |
| Moderate | 0.05 ≤ d < 0.15 | 24°C | 2 |
| Full | ≥ 0.15 | 21°C | 3 (+225 BTU/hr per extra person beyond threshold, legacy V1/V2 only — V3 scales continuously instead, see below) |

**Constants:**
- `ENVELOPE_LOAD_BTU_PER_SQM = 150` — tropical-climate baseline envelope/solar heat gain
- `PERSON_LOAD_BTU_PER_HR = 400` — ASHRAE seated/light-activity occupant heat gain, applied to *actual* headcount at every mode (not just beyond a threshold)
- `STANDARD_SEER_V3 = 15` — realistic mid-efficiency reference unit (real units span SEER 13–25)
- Weather baseline: 33°C / 60% RH → multiplier = 1 (unadjusted)

**Room size → representative m² (midpoint used only for density calc):**
| Size | Range | Representative |
|---|---|---|
| Small | 20–40 m² | 30 m² |
| Medium | 40–80 m² | 60 m² |
| Large | 80+ m² | 120 m² |

On top of the base V3 engine, **CoolSense V3's setpoint** (what's actually commanded) gets two further adjustments layered on, identical in shape to V2 (see §6):
1. **Weather easing** — setpoint relaxes warmer when outside conditions are milder than baseline (never tightens further when hot — that's already priced into the BTU multiplier, avoiding double-counting).
2. **Comfort preference** — ±2°C shift from the room's `comfort_preference`, still clamped to the mode's range.

---

## 5. Why V3 Exists (the model's history — shows engineering maturity, not just "it works")

This progression is a strong pitch point: it shows the team responded to real critique rather than shipping a first guess.

**V1 (original):** Each mode had a flat BTU/hr bucket (eco 2,250 / moderate 11,250 / full 20,250 BTU/hr) scaled by a room-size multiplier (×0.7/×1.0/×1.5), power derived via `BTU ÷ (SEER × 1000)` at a reference SEER of **4.5** — reverse-engineered only to reproduce an original hand-picked kW table, not a real unit's efficiency.

**V2:** Same BTU/mode-bucket physics as V1, plus:
- Setpoint **relaxes** (warmer) when weather is milder than baseline — the legitimate way to save energy without double-counting the weather multiplier already applied to BTU.
- Comfort preference ±2°C.
- Explicitly does **not** tighten setpoint when hot — an earlier draft did this and claimed savings, which is thermodynamically backwards (colder setpoint = *more* energy); caught and reversed before implementation.

**V3 (current, live):** External/professor feedback flagged that V1/V2's BTU-per-mode numbers, `SEER = 4.5`, and the 225 BTU/hr-per-extra-person figure didn't hold up as real HVAC numbers, even though the *relative* comparisons (V2 vs static) were internally consistent. V3 replaces the bucket model with:
- An **additive load model** — capacity scales continuously and directly with actual room area and actual occupancy (`150×m² + 400×people`), not a per-mode step function.
- **`SEER = 15`** — a real mid-range reference unit, not reverse-engineered.
- Mode now only picks setpoint/fan; it no longer determines cooling capacity.

**Room-size rescale (2026-08-13):** At the *original* room scale (50–150/150–400/400+ m², "public-space" sizing), V3's realistic physics implied 50,000–100,000+ BTU/hr requirements at moderate/full occupancy — beyond what a single real AC unit handles (residential/light-commercial units top out ~24,000–60,000 BTU/hr). That read as implausible in a pitch ("a 12,000 BTU unit can't cool 40 people"). Fix: lowered room-size m² scale (small 20–40, medium 40–80, large 80+) so each size's peak requirement (small ~6.5–15k, medium ~12.6–25k+, large ~25–35k+ BTU/hr) stays servable by one plausible real unit. The alternative — supporting multiple AC units per room — was considered and explicitly deferred as future work (bigger schema rework than rescaling constants).

**Key defensible line for judges:** *"Every constant in the live model maps to a real, citable HVAC quantity — ASHRAE occupant heat gain, a real reference SEER, weatherapi.com live conditions. Nothing was reverse-engineered to hit a demo number."*

---

## 6. Simulation & Comparison Methodology

- **Mock data generator:** density-based (not flat people-count) targets against the real mode thresholds, so medium/large rooms actually reach moderate/full — weekday peak (9–5, 7–11pm) hits the full-mode threshold, low daytime at 40% of moderate threshold, night near-empty, weekends flatten daytime to ~40% of weekday peak, ±15% noise throughout.
- **Static baseline ("current system"):** always-on, fan 3, constant draw at a configurable setpoint (default 25°C). This is what a hotel/office runs *today* — no occupancy awareness.
  - **static-v3 baseline (current, more rigorous):** sized for the room's full-mode occupancy **and** the run's worst-case weather load (not just the 33°C/60% baseline) — its setpoint floor is full mode's own 21°C, so it can't be complacently warmer than real peak demand requires. This was a deliberate fix (2026-08-13) after finding the naive version could let CoolSense V3 briefly draw *more* power than an under-sized baseline during hot/diurnal peak hours — an obviously wrong comparison for a pitch. **This is worth mentioning proactively**: it shows the comparison was stress-tested against exactly the failure mode a skeptical judge would probe for.
    - **Sizing headroom (2026-08-14):** the sizing occupancy also carries a 1.2x margin above the exact full-mode threshold, because the mock generator's own ±15% noise could realistically push a peak reading past that exact boundary — stress-tested across 90 simulated weeks, ~67% had at least one hour where CoolSense exceeded an unmargined baseline before this fix, 0% after. **This also raised the reported savings number** (static-v3 is a flat per-run draw applied to every hour, so undersizing it understated the whole comparison, not just the crowded hours) — overall reduction moved from ~25.5% to ~30.0% on the same 90-week check purely from correcting this sizing. If you already have a specific % reduction number in slides from before 2026-08-14, re-run `/simulation/run` (or the Simulation page's "Generate & Run") and pull a fresh number — the old one is now stale and understates the real result.
- **Diurnal weather option:** continuous 24h cosine curve (trough 27°C/50% at 3am, peak 36°C/80% at 3pm) instead of a flat preset. Important because flat `warm`/`hot` presets sit at/above baseline, so the setpoint-easing logic never has mild-enough conditions to fire — this was actually caught as a real bug ("the two models show identical results") before being traced to the flat-preset default. Diurnal is now the tester's default weather mode for this reason.
- **Metrics:** Energy (kWh), CO₂ (0.5 kg/kWh, Thailand grid factor), Cost (5 baht/kWh), % reduction — computed for static, static-v3, CoolSense V2, and CoolSense V3 in parallel so the progression itself is visible in the dashboard.

---

## 7. Camera-Based Occupancy (Gemini Vision)

- Frontend opens the browser camera (`getUserMedia`), renders it live client-side (no server round-trip for video), and every 5s captures a frame → POSTs to `occupancy-vision` → Gemini vision (via **Vertex AI**, not the Gemini Developer API — see below) returns a structured `{ people_count }` → inserted into `occupancy_readings` as `source: 'camera_gemini'`.
- **"Real-time" is simulated, not streamed** — sending live video to Gemini was considered and rejected: Gemini's video understanding also just samples frames internally but with much higher latency, which works against a counter meant to update continuously. Single-frame polling every 5s is simpler and faster in practice.
- **No frames are ever stored** — only the resulting count persists.
- **Accuracy caveat (say this proactively, don't wait to be asked):** Gemini vision counting is reasonably accurate up to ~20-30 people but degrades on dense/large crowds, like any general-purpose vision LLM. This is a known limitation of the approach, not a bug — framing it this way ahead of time reads as rigor, not a gap you're hiding.
- **Auth note (only if asked why Vertex AI, not a simple API key):** originally used a plain Gemini Developer API key since this is a single-shot REST call, not streaming. Switched to Vertex AI + GCP service account because the project's linked Cloud Billing credit didn't apply to the Developer API's separate prepay wallet — Vertex AI bills through the same Cloud Billing account the credit is already on.

---

## 8. Demo Numbers Template

Use *fresh* numbers from an actual `/simulation/run` call before presenting — the numbers below are the shape/template only (from the original spec, pre-V3 rescale, kept here as a formatting reference, **not** something to quote as current results):

| | Energy | CO₂ | Cost |
|---|---|---|---|
| Static baseline | X kWh | X×0.5 kg | X×5 baht |
| Smart (CoolSense V3) | Y kWh | Y×0.5 kg | Y×5 baht |
| Saved | X−Y kWh (Z%) | (X−Y)×0.5 kg | (X−Y)×5 baht |

Annualized-per-building and Thailand-hotel-sector-scale numbers are a straightforward multiplication from the weekly figure — compute them from the real run, don't reuse old placeholder figures (450 kg CO₂ / 158,000 metric tons/year were original spec placeholders, not measured V3 output).

---

## 9. Things We Deliberately Did NOT Build (scope discipline — good to state proactively)

- No real AC hardware control (software/demo only)
- No real CO₂ sensors — occupancy comes directly from people-count readings, not derived from CO₂ (CO₂ was the original plan, dropped in favor of direct counting — simpler and more accurate)
- No custom-trained ML model — occupancy counting calls Gemini vision (third-party), no in-house model
- No multi-building support — `room_config` is intentionally a single-row (`id=1`) design
- No user authentication
- No mobile responsiveness
- No multi-AC-unit-per-room support (considered for the room-size rescale, explicitly deferred)

Framing for judges: *"We scoped tightly on purpose — every hour went into making the calculation defensible rather than building features that don't change the core claim."*

---

## 10. Hard Questions & Answers

**Q: Why does colder = more energy in your model — isn't that obvious?**
A: Yes, and that's exactly why our model only ever *relaxes* (warms) the setpoint when conditions are milder than baseline, never tightens it when hot — the heat-load increase from hot weather is already captured in the BTU weather multiplier. Tightening the setpoint *too* would double-count that. We caught and reversed an earlier draft that did this backwards.

**Q: Are your BTU/SEER numbers real, or tuned to hit a nice demo result?**
A: They're real HVAC figures — ASHRAE's ~400 BTU/hr seated occupant heat gain, a mid-range real-unit SEER (15, vs the 13-25 range actual units span), and a standard 150 BTU/hr/m² tropical envelope load. Our V1 model *did* use a reverse-engineered reference SEER (4.5) purely to reproduce an original spec table — we replaced it precisely because it wasn't defensible; V3 is the result of taking that critique seriously.

**Q: What about compressor cycling / transient power spikes when the setpoint changes frequently?**
A: Our simulation compares steady-state power draw per hour, so it doesn't model startup inrush or short-cycling losses. HVAC literature puts short-cycling efficiency loss at roughly 3-10%; a production deployment would enforce a minimum dwell time between setpoint changes (standard HVAC controls practice) to keep that near the low end. We'd apply a conservative ~5% haircut to reported savings if pressed for a "real-world" number.

**Q: What about individual comfort — not everyone wants the same temperature?**
A: `comfort_preference` (cold/neutral/warm) gives a ±2°C personal offset today. Phase 2 would add a feedback loop (track overrides → learn preferences) and context-aware baselines per space type — that's future work, not core to this pitch's energy claim.

**Q: Why webcam + Gemini instead of a proper occupancy sensor (PIR, CO₂, etc.)?**
A: Software-only hackathon scope — no hardware budget or install access. Cameras are infrastructure most target buildings (hotels, malls, offices) already have, so this is deployable without new hardware. Trade-off is accuracy at high crowd density, which we state upfront (§7).

**Q: Does the "smart vs static" comparison cheat by under-sizing the baseline?**
A: We explicitly built `static-v3` to prevent this — it's sized for the room's own full-mode occupancy (plus a 1.2x headroom margin covering realistic occupancy noise, added 2026-08-14) *and* the simulation's worst-case weather for the chosen condition, not the mild 33°C/60% baseline. We found and fixed two real versions of this bug — CoolSense V3 briefly exceeding an under-sized baseline during hot/diurnal peaks (weather), and during ordinary noisy crowding above the exact full-mode threshold (occupancy) — before either could surface in a demo. We stress-tested both fixes against 90 simulated weeks of realistic noise, not just the specific cases we found: zero violations remain.

**Q: Have you seen a case where CoolSense used MORE energy than a simpler strategy?**
A: Yes, and we're not hiding it — CoolSense's occupancy-adaptive logic never fully shuts the AC off (it always maintains at least the room's baseline envelope-load cooling), so a naive fixed on/off schedule (e.g. 9am-8pm operating hours) uses noticeably less raw energy than CoolSense running 24/7, purely from being off for the other 13 hours. Once we put both systems on the *same* operating-hours schedule, CoolSense is still ~12% more efficient on top of it — the honest framing is "scheduling gets most of the savings, CoolSense's smart logic adds a real, smaller improvement beyond it," not "smart AC alone beats everything." [Update this once the optional on/off scheduling feature ships with real numbers from the live system, not just the simulation estimate.]

**Q: Multi-room / multi-building scaling?**
A: Out of scope by design (`room_config` is a singleton) — noted as a known limitation, with multi-AC-unit-per-room already scoped as the next logical extension.

---

## 11. Tech Stack (for "how did you build this" questions)

- Frontend: Vue 3 + TypeScript + Vite, deployed on Vercel
- Backend: Supabase Edge Functions (Deno)
- Database: Supabase Postgres
- Vision: Gemini via Vertex AI (GCP service account auth, not a plain API key — see §7)
- Weather: weatherapi.com, live by location
- Testing: `deno test` over pure/testable shared modules (`_shared/acCalculationV3.ts`, `coolSenseV3Calculation.ts`, `simulation.ts`, `geminiOccupancy.ts`) — calculation logic is unit-tested independent of any live DB/API call

---

## 12. Source of Truth

This file is a pitch-facing *summary*. For anything that needs to be exactly right (thresholds, formulas, schema), the canonical source is `CLAUDE.md` at the repo root — if the two ever disagree, trust `CLAUDE.md` and flag it for an update. `RESEARCH.md` has additional historical research (Thailand EGAT/TIS standards, SEER regional context) from earlier in the project, some of which predates the V3 rescale — treat its room-size numbers and model names (e.g. "hybrid model") as historical, not current.
