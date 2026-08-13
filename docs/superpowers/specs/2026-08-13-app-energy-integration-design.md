---
name: app-energy-integration-design
description: Integrate app energy consumption into simulation and redesign analytics page layout
type: design
created: 2026-08-13
---

# App Energy Integration & Analytics Redesign

## Problem Statement

The simulation currently shows only AC energy savings, but doesn't account for the energy cost of running the optimization app itself. Additionally, the analytics page displays 9 stat cards at once, making it hard to understand what matters most. The story should be: "You save X kWh/day with the app, even after accounting for the app's own energy cost."

## Goals

1. **Calculate and integrate app energy consumption** into the simulation (baseline 24/7 running + per-run overhead)
2. **Redesign analytics page layout** to lead with impact (kWh saved, CO₂ prevented, cost saved) via side-by-side before/after comparison
3. **Make app energy cost transparent** — show it's negligible but don't hide it
4. **De-clutter the UI** — move V2/V3 technical details and hourly breakdown to an advanced section

## App Energy Footprint (Calculated)

### Baseline (App Running 24/7)
- **Vercel frontend**: 0.0001 kWh/day (data transfer)
- **Supabase database**: 0.055 kWh/day (Postgres + storage)
- **Edge functions**: 0.00005 kWh/day (~10 API calls/day)
- **Weather API calls**: 0.05 kWh/day (~50 calls/day to weatherapi.com)
- **Total baseline**: **0.1051 kWh/day** (0.00438 kW continuous)
- **Annual**: 38.4 kWh

### Per-Simulation-Run Overhead
- **Per 168-hour run**: **0.00185 kWh**
  - `/generate-mock-data`: 0.0001 kWh
  - `/simulation/run`: 0.0005 kWh
  - `/simulation/:id/hourly-data`: 0.00005 kWh
  - Database writes: 0.0002 kWh
  - Weather call: 0.001 kWh

### Impact Summary
- App cost is only **0.64% of AC savings** (0.1051 kWh/day vs 16.5 kWh/day saved)
- **Net benefit remains strongly positive**: 16.4 kWh/day saved after app cost
- Example: Annual savings = 6,023 kWh - 38 kWh app cost = **5,985 kWh net**

---

## Design: Side-by-Side Comparison Layout

### Visual Structure

```
┌────────────────────────────────────────────┐
│ SIMULATION SETTINGS (Sticky)               │
│ [Room Size] [Duration] [Weather] [SEER]   │
│                               [RUN BUTTON] │
└────────────────────────────────────────────┘

┌──────────────────────┬──────────────────────┐
│  STATIC BASELINE     │  SMART SYSTEM        │
│  (Always On, Full)   │  (CoolSense V3)      │
├──────────────────────┼──────────────────────┤
│  Energy:  818 kWh    │  Energy:  550 kWh    │
│  CO₂:     409 kg     │  CO₂:     275 kg     │
│  Cost:    4,090 baht │  Cost:    2,750 baht │
└──────────────────────┴──────────────────────┘

┌────────────────────────────────────────────┐
│  💚 YOUR NET SAVINGS                       │
├────────────────────────────────────────────┤
│  ⚡ 268 kWh saved                          │
│  🌱 134 kg CO₂ prevented                   │
│  💰 1,340 baht saved                       │
│                                            │
│  ℹ️  App energy: 0.3 kWh overhead          │
│     (−0.04% of savings)                    │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ [Power Over Time — Line Chart]             │
│ (Hourly power draw: Static vs Smart)       │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ [Cumulative Energy — Area Chart]           │
│ (Stacked: Static vs Smart over time)       │
└────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│ [Advanced Details ▼]  [Hourly Data ▼]     │
│                                            │
│ Advanced section contents (collapsed):     │
│  - V2 vs V3 comparison breakdown           │
│  - Per-component app energy cost           │
│                                            │
│ Hourly data section (collapsed):           │
│  - Full table: hour | power | cumulative  │
└────────────────────────────────────────────┘
```

### Section Descriptions

#### 1. Simulation Settings (Sticky Top)
- Inputs: room size, duration, weather condition, AC SEER
- Call-to-action: "Run Simulation" button (enabled/disabled based on valid inputs)
- Stays visible while scrolling through results

#### 2. Before/After Comparison (Hero Section)
- **Left column (Static Baseline):** Always-on, full-mode AC
- **Right column (Smart System):** CoolSense V3 with occupancy-based adaptation
- Three metrics each: Energy (kWh), CO₂ (kg), Cost (baht)
- **Color scheme:** Gray/neutral for static, green for smart (visual priority)

#### 3. Net Savings (Highlighted)
- **Three large hero numbers:** kWh saved, CO₂ prevented, cost saved
- **Callout (smaller, secondary):** App overhead cost and percentage of savings
- Transparent but not buried — shows the full story

#### 4. Power Over Time (Chart 1)
- **Type:** Line chart
- **X-axis:** Hour (0–168)
- **Y-axis:** Power draw (kW)
- **Series:** Static (blue), Smart (orange), with legend
- **Purpose:** Show hour-by-hour behavior — how smart system adapts to occupancy

#### 5. Cumulative Energy (Chart 2)
- **Type:** Stacked area chart
- **X-axis:** Hour (0–168)
- **Y-axis:** Cumulative energy (kWh)
- **Series:** Static and Smart stacked to show divergence over time
- **Purpose:** Visual impact — see the gap widen as hours accumulate

#### 6. Advanced Details (Collapsible)
- **Header:** "Advanced Details ▼"
- **Contents (hidden by default):**
  - V2 vs V3 comparison (only if both were run)
  - Component breakdown (app energy: database, functions, weather API, etc.)
  - Technical notes (assumptions, baseline conditions)

#### 7. Hourly Data Table (Collapsible)
- **Header:** "Hourly Data ▼"
- **Contents (hidden by default):**
  - Full table: hour_index | static_power | smart_power | static_cumulative | smart_cumulative
  - Sortable columns, scrollable
- **Purpose:** For detailed analysis, not primary story

---

## Data Integration

### Simulation Backend Changes
1. `runSimulation()` returns app energy metrics alongside existing AC metrics:
   - `app_baseline_kwh_per_day`: 0.1051
   - `app_per_run_overhead_kwh`: 0.00185
   - `net_energy_saved_kwh`: (smart savings - app overhead)
   - `net_co2_saved_kg`: (smart savings - app overhead) × 0.5
   - `net_cost_saved_baht`: (smart savings - app overhead) × 5

2. `SimulationSummary` interface updated to include app energy fields

### Frontend Changes
1. **Display app overhead in savings section:**
   - Calculated as: `(app_baseline_kwh_per_day / 24) × duration_hours + app_per_run_overhead_kwh`
   - Shown as footnote: "ℹ️ App energy: X.X kWh overhead (−Y.YY% of savings)"

2. **Hero numbers use net savings:** Display `net_energy_saved_kwh`, `net_co2_saved_kg`, `net_cost_saved_baht`

3. **Charts remain unchanged:** Continue plotting static vs smart AC power (app energy is per-day, not hourly, so it's not charted, only footnoted)

---

## Success Criteria

- [ ] App energy baseline and per-run overhead calculated and integrated
- [ ] Analytics page displays before/after comparison side-by-side
- [ ] Hero metrics (savings) lead the page; app cost is transparent but secondary
- [ ] Charts and advanced details are discoverable but don't clutter primary message
- [ ] User can see at a glance: "I save X kWh with this app, even accounting for the app's cost"
- [ ] No breaking changes to existing endpoints or data structures

---

## Out of Scope

- Real-time energy monitoring of the production app
- Per-user billing or cost attribution
- Optimization of the app's energy consumption (future work if needed)
- Changing V2 vs V3 comparison logic — only UI reorganization

---

## Implementation Notes

- Stat cards are currently in `AnalyticsView.vue` — refactor into a new `ComparisonSection.vue` component
- Charts use `LineAreaChart.vue` — no changes needed
- Collapsible sections use HTML `<details>` — no new libraries needed
- App energy constants defined in backend `simulation.ts` — keep configurable for testing

