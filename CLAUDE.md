# Smart AC Optimization Hackathon Project

## Core Feature Summary

---

## Project Overview

**Problem:** AC systems waste energy running full blast in empty/low-occupancy rooms (hotels, offices, malls)

**Solution:** Smart AC system that adjusts temperature & fan speed based on occupancy (tracked via CO₂ levels)

**Impact:** Measurable carbon reduction + energy savings

**Timeline:** 2-day hackathon

**Scope:** Software only, no hardware (only input through camera)

---

## How It Works

**Input:**
- Building name
- Room size (small/medium/large)
- Current CO₂ level (400-2000 ppm slider)
- Weather (hot/warm/cool)

**Algorithm Logic:**
```
CO₂ level → Estimate occupancy
↓
Occupancy + Room size → Determine AC mode
↓
Mode + Weather → Calculate temperature, fan speed, power
↓
Calculate energy (kWh) & CO₂ emissions
```

**AC Modes:**
- **Eco** (0 people, <600 ppm): 28°C, fan 1, 0.5 kW
- **Moderate** (1-2 people, 600-1000 ppm): 24°C, fan 2, 2.5 kW
- **Full** (3+ people, 1000+ ppm): 21°C, fan 3, 4.5 kW

---

## Core MVPs (5 Items)

**1. Input Form** (2-3 hours)
- Building name input
- Room size dropdown
- CO₂ slider (400-2000 ppm)
- Weather selector
- Submit button

**2. Temperature Calculation Algorithm** (3-4 hours)
- Convert CO₂ → occupancy estimate
- Apply room size adjustment
- Select AC mode (eco/moderate/full)
- Calculate power consumption (kW)
- Adjust for weather conditions

**3. Mock Data Generator** (1-2 hours)
- Create a 168 hour test dataset
- Compare a static 25 degree test run vs our flucuating system

**4. System Simulation & Comparison** (1-2 hours)
- Run current system (always 25°C, 4.5 kW) for 200 hours
- Run smart system (variable based on CO₂) for 200 hours
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
   "Hotel AC runs 24/7 at 25°C"
   Display: 900 kWh, 450 kg CO₂

2. **Run your app:**
   Enter: Room size, CO₂ pattern, weather
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

"AC systems waste energy cooling empty rooms. We built a smart system that tracks occupancy via CO₂ and automatically adjusts temperature.

We tested it with realistic 200-hour hotel data:
- Current system: 900 kWh
- Our system: 550 kWh
- Savings: 40% energy, 1,750 baht per week

For all Thai hotels, that's 158,000 metric tons of CO₂ prevented annually."

---

## Success Criteria

- Working input form
- Algorithm correctly converts CO₂ → AC mode
- Mock data shows 30-40% energy savings
- Dashboard displays graphs + numbers clearly
- Pitch tells coherent story
- Demo doesn't crash

---

## Next Steps

1. Go to Claude Code
2. Build MVP 1 (input form)
3. Build MVP 2 (algorithm)
4. Test both together
5. Add mock data + comparison
6. Build dashboard + graphs
7. Polish + practice pitch

Focus on core. Ship something great.
