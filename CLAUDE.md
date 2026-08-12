# Smart AC Optimization Hackathon Project

## Core Feature Summary

---

## Keeping This File Current

**Whenever a core decision of this project changes — the algorithm/inputs, AC mode thresholds, tech stack, scope, or MVP list — update this file in the same change.** This document is the source of truth for the team; a stale spec here causes rework and conflicting assumptions across sessions/teammates. If a request would change something documented below, update the relevant section(s) here before or alongside implementing it.

---

## Project Overview

**Problem:** AC systems waste energy running full blast in empty/low-occupancy rooms (hotels, offices, malls)

**Solution:** Smart AC system that adjusts temperature & fan speed based on occupancy (people count, currently manual input, ML camera-based counting planned)

**Impact:** Measurable carbon reduction + energy savings

**Timeline:** 2-day hackathon

**Scope:** Software only, no hardware (only input through camera)

**Tech Stack**
- Frontend: Vue.js + Typescript
- Backend: Node.js
- Database: Supabase
- Deployment: Vercel

---

## How It Works

**Input:**
- Building name
- Room size (small/medium/large — public-space scale, see below)
- Number of people in the room (currently a manual slider/number input; will be replaced by ML-based people counting from camera input later — see `supabase/functions/occupancy`)
- Weather (hot/warm/cool)

> Occupancy is **not** derived from CO₂ level. People count comes directly from an `occupancy_readings` table (mocked today, ML-populated later). CO₂ was the original plan but was dropped in favor of direct people counting.

**Algorithm Logic:**
```
People count + Room size (m²) → Occupancy density (people ÷ m²)
↓
Density → Determine AC mode
↓
Mode + Room size → Calculate temperature, fan speed, power
↓
(Weather adjustment not yet implemented — pending science team criteria)
↓
Calculate energy (kWh) & CO₂ emissions
```

**Room size → representative m²** (midpoint of each public-space range; used only for the density calculation, not stored/enforced in the schema):
- Small: 50-150 m² → 100 m²
- Medium: 150-400 m² → 275 m²
- Large: 400+ m² → 450 m²

**AC Modes** (by occupancy density = people ÷ representative m²):
- **Eco** (density < 0.05 people/m²): 28°C, fan 1, 0.5 kW base
- **Moderate** (0.05 ≤ density < 0.15 people/m²): 24°C, fan 2, 2.5 kW base
- **Full** (density ≥ 0.15 people/m²): 21°C, fan 3, 4.5 kW base, scales up further with extra people beyond the full threshold

Base power is also scaled by a room-size multiplier (small ×0.7, medium ×1.0, large ×1.5) — a bigger room has more air volume to cool. See `supabase/functions/_shared/acCalculation.ts` for the reference implementation (mirrored in `tools/calculation-tester.html` for local testing without Supabase running).

> Because the public-space m² scale is large, demoing mode changes needs a people-count range wider than a 0-10 slider (e.g. 0-100) — a 0-10 range only ever reaches "moderate" in a small room and never reaches "full" for any room size.

---

## Core MVPs (5 Items)

**1. Input Form** (2-3 hours)
- Building name input
- Room size dropdown
- People-count input (slider/number, wide enough range e.g. 0-100 to demo all modes — placeholder for future ML camera-based counting)
- Weather selector
- Submit button

**2. Temperature Calculation Algorithm** (3-4 hours)
- Convert people count + room size → occupancy density
- Select AC mode (eco/moderate/full) from density thresholds
- Apply room size power multiplier
- Calculate power consumption (kW)
- Adjust for weather conditions (not yet implemented)

**3. Mock Data Generator** (1-2 hours)
- Create a 168 hour test dataset
- Compare a static 25 degree test run vs our flucuating system

**4. System Simulation & Comparison** (1-2 hours)
- Run current system (always 25°C, 4.5 kW) for 168 hours
- Run smart system (variable based on CO₂) for 168 hours
- Calculate metrics:
  - Energy used (kWh)
  - CO₂ emissions (kg)
  - % reduction
  - Cost savings (baht)

**5. Admin Dashboard Display** (2-3 hours)
- Show user inputs
- Display recommended AC settings
- Energy comparison (current vs smart)
- CO₂ impact visualization
- Two graphs:
  - Line graph: Power over 200 hours
  - Area chart: Cumulative energy/CO₂

---

## Metrics Calculated

**Energy (kWh):**
- Current system: X kWh
- Smart system: Y kWh
- Savings: X - Y = Z kWh (-% reduction)

**Carbon (kg CO₂):**
- Thailand grid: 0.5 kg CO₂ per kWh
- Current: X × 0.5 = A kg CO₂
- Smart: Y × 0.5 = B kg CO₂
- Saved: A - B kg CO₂

**Cost (Baht):**
- Thailand electricity: 5 baht/kWh
- Current: X × 5 baht
- Smart: Y × 5 baht
- Saved: Z baht

---

## Example Output (200-hour demo)

**Current System (always 25°C full):**
- Energy: 900 kWh
- CO₂: 450 kg
- Cost: 4,500 baht

**Smart System:**
- Energy: 550 kWh (-38.9%)
- CO₂: 275 kg (-38.9%)
- Cost: 2,750 baht (-38.9%)

**Annual Scaling (per hotel):**
- CO₂ saved: 15.8 metric tons/year
- Cost saved: 315,000 baht/year

---

## Demo Flow

1. **Show problem:**
   "Library AC runs 24/7 at 25°C"
   Display: 900 kWh, 450 kg CO₂

2. **Run your app:**
   Enter: Room size, people count, weather
   System calculates: Optimal settings

3. **Show results:**
   "Smart system recommends MODERATE + 24°C"
   Display: 550 kWh, 275 kg CO₂

4. **Show savings:**
   38.9% energy reduction
   175 kg CO₂ saved
   1,750 baht saved

5. **Scale up:**
   "For all Thai hotels: 158,000 metric tons CO₂/year"

---

## Implementation Timeline

**Day 1 (8 hours):**
- Morning: MVP 1 (input form) + MVP 2 (algorithm)
- Afternoon: MVP 3 (mock data) + testing

**Day 2 (8 hours):**
- Morning: MVP 4 (simulation) + MVP 5 (dashboard)
- Afternoon: Polish, debug, practice pitch

---

## Team Tasks

**CS/SE:**
- Build input form UI
- Dashboard layout & design
- Integrate algorithm into frontend

**Data Analysis:**
- Build temperature calculation algorithm
- Energy/CO₂ calculation logic
- Comparison metrics (current vs smart)
- Graph generation

**Business Admin:**
- Define AC power specs
- Create demo scenario
- Calculate scaling numbers
- Prepare pitch narrative

**Food Science:**
- Support as needed

---

## What NOT to Include

- Real AC hardware control
- Real CO₂ sensors
- Machine learning
- Multi-building database
- User authentication
- Mobile responsiveness

---

## The Pitch (30 seconds)

"AC systems waste energy cooling empty rooms. We built a smart system that tracks occupancy (people count) and automatically adjusts temperature.

We tested it with realistic 200-hour hotel data:
- Current system: 900 kWh
- Our system: 550 kWh
- Savings: 40% energy, 1,750 baht per week

For all Thai hotels, that's 158,000 metric tons of CO₂ prevented annually."

---

## Success Criteria

- Working input form
- Algorithm correctly converts people count + room size (occupancy density) → AC mode
- Mock data shows 30-40% energy savings
- Dashboard displays graphs + numbers clearly
- Pitch tells coherent story
- Demo doesn't crash

---