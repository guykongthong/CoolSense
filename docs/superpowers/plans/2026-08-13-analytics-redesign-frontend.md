# Analytics/Simulation Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Branch:** `feature/analytics-redesign-frontend` (branch off `dev`, merge back to `dev` when done — do not target `main`)

**Goal:** Redesign the simulation comparison page to lead with a side-by-side static-vs-smart comparison and a net-savings hero block (accounting for the app's own energy cost), moving the existing 9-stat-card grid and legacy-V2 details into a collapsed "Advanced Details" section.

**Architecture:** New `ComparisonSection.vue` component (in `frontend/src/components/ui/`, alongside the existing `Card`/`StatCard`/`LineAreaChart`) renders the hero comparison + net savings from a `SimulationSummary`. `SimulationView.vue`'s existing 9-`StatCard` grid is replaced by `<ComparisonSection>` at the top and moved, unchanged, into a new collapsible "Advanced Details" `<details>` block below the charts (next to the existing "Table view" `<details>` block). No chart changes — `LineAreaChart` usage is untouched.

**Tech Stack:** Vue 3 + TypeScript + Vite, Tailwind v4 (CSS-variable-based tokens in `frontend/src/style.css`), the project's own `t()` i18n helper (`frontend/src/lib/i18n.ts`, locales `en`/`ko`). No frontend test runner exists in this repo — verification is `npm run typecheck`, `npm run lint`, `npm run build`, plus manual check against the dev server (per this project's UI-change convention).

**Spec:** `docs/superpowers/specs/2026-08-13-app-energy-integration-design.md`

## Correction to the spec

**The spec's file references are stale — read this before starting.** The spec says "Stat cards are currently in `AnalyticsView.vue`" and asks to add a `ComparisonSection.vue` there. That's no longer accurate:

- `AnalyticsView.vue` (`frontend/src/views/AnalyticsView.vue`) is the **real-time People/Electric Energy/Temperature history page**, added after the spec's mental model — it has no stat cards, no simulation data, and nothing in this plan touches it.
- The static-vs-smart comparison UI the spec is actually describing — the 9 `StatCard`s, the power/energy charts, the hourly table — lives in **`frontend/src/views/SimulationView.vue`** (moved there by a prior commit, "Move the static/V2/V3 comparison UI to a new Simulation page").

Every task below targets `SimulationView.vue`, not `AnalyticsView.vue`. If you're re-reading the spec mid-implementation, mentally substitute the filename.

**Depends on:** the sibling backend plan (`docs/superpowers/plans/2026-08-13-app-energy-backend.md`) adds `app_energy_kwh`, `net_energy_saved_kwh`, `net_co2_saved_kg`, `net_cost_saved_baht` to `frontend/src/lib/api.ts`'s `SimulationSummary` type. This plan's `ComparisonSection.vue` consumes those four fields by name — if the backend branch hasn't merged yet, `npm run typecheck` in Task 2 will fail with "property does not exist on type `SimulationSummary`" until it does (or until you temporarily add the same four fields to `SimulationSummary` locally — but don't commit that; let the backend branch own the interface to avoid a merge conflict on that file).

## Global Constraints

- "Smart System" throughout this redesign means **CoolSense V3** (`coolsense_v3_*` fields), matching the design mockup's explicit "(CoolSense V3)" label — not the legacy V2 pair (`current_energy_kwh`/`smart_energy_kwh`), which moves to Advanced Details unchanged.
- Color scheme: gray/neutral for the static column, primary/green (`text-primary`, matching this app's `--color-primary`) for the smart column — per spec's "visual priority" note.
- No new npm dependencies — collapsible sections use plain HTML `<details>` (matches the existing hourly-table pattern in `SimulationView.vue`), charts reuse the existing `LineAreaChart.vue` as-is.
- Every new user-facing string needs both an `en` and a `ko` entry in `frontend/src/lib/i18n.ts` — this codebase has no English-only strings anywhere else.

---

### Task 1: Add i18n keys for the new comparison/net-savings copy

**Files:**
- Modify: `frontend/src/lib/i18n.ts`

**Interfaces:**
- Produces: the following keys, resolvable via `t('simulation.<key>')`, consumed by Task 2's `ComparisonSection.vue`.

- [ ] **Step 1: Add English keys**

In `frontend/src/lib/i18n.ts`, in the `en` block, directly after the existing `'simulation.errorFallback': 'Failed to run comparison — showing mock data instead',` line (around line 147), add:

```typescript
    'simulation.staticBaseline': 'Static Baseline',
    'simulation.staticBaselineSubtitle': 'Always on, full mode',
    'simulation.smartSystem': 'Smart System',
    'simulation.smartSystemSubtitle': 'CoolSense V3',
    'simulation.energyLabel': 'Energy',
    'simulation.co2Label': 'CO₂',
    'simulation.costLabel': 'Cost',
    'simulation.netSavingsTitle': 'Your net savings',
    'simulation.netEnergySaved': 'Energy saved',
    'simulation.netCo2Saved': 'CO₂ prevented',
    'simulation.netCostSaved': 'Cost saved',
    'simulation.appEnergyFootnote': 'App energy: {kwh} kWh overhead ({pct}% of savings)',
    'simulation.advancedDetails': 'Advanced details',
    'simulation.advancedDetailsSubtitle': 'V2 legacy comparison and full metric breakdown',
```

- [ ] **Step 2: Add matching Korean keys**

In the `ko` block, directly after the existing `'simulation.errorFallback'` line's Korean counterpart (find it the same way — it's at the same relative position as the English block, roughly line 269), add:

```typescript
    'simulation.staticBaseline': '고정 시스템',
    'simulation.staticBaselineSubtitle': '항시 가동, 풀 모드',
    'simulation.smartSystem': '스마트 시스템',
    'simulation.smartSystemSubtitle': 'CoolSense V3',
    'simulation.energyLabel': '에너지',
    'simulation.co2Label': 'CO₂',
    'simulation.costLabel': '비용',
    'simulation.netSavingsTitle': '순 절감 효과',
    'simulation.netEnergySaved': '절감 에너지',
    'simulation.netCo2Saved': 'CO₂ 절감',
    'simulation.netCostSaved': '절감 비용',
    'simulation.appEnergyFootnote': '앱 에너지: {kwh} kWh 오버헤드 (절감량의 {pct}%)',
    'simulation.advancedDetails': '고급 세부정보',
    'simulation.advancedDetailsSubtitle': 'V2 레거시 비교 및 전체 지표',
```

- [ ] **Step 3: Verify the keys resolve**

Run: `cd frontend && npm run typecheck`
Expected: PASS (the `Messages` type in `i18n.ts` is `Record<string, string>`, so adding keys can't break the type — this step just confirms no syntax error was introduced, e.g. a missing comma).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/i18n.ts
git commit -m "feat: add i18n keys for the comparison/net-savings redesign"
```

---

### Task 2: Build `ComparisonSection.vue`

**Files:**
- Create: `frontend/src/components/ui/ComparisonSection.vue`

**Interfaces:**
- Consumes: `SimulationSummary` type from `frontend/src/lib/api.ts` (must already include `static_v3_energy_kwh`, `coolsense_v3_energy_kwh`, `static_v3_co2_kg`, `coolsense_v3_co2_kg`, `static_v3_cost_baht`, `coolsense_v3_cost_baht`, `app_energy_kwh`, `net_energy_saved_kwh`, `net_co2_saved_kg`, `net_cost_saved_baht` — see "Depends on" above); `Card.vue` (default import, `title` prop, default slot); `t()` from `frontend/src/lib/i18n.ts`; i18n keys from Task 1.
- Produces: default-exported component accepting a single required prop `summary: SimulationSummary`, for Task 3 to mount as `<ComparisonSection :summary="summary" />`.

- [ ] **Step 1: Write the component**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import Card from './Card.vue';
import { t } from '../../lib/i18n';
import type { SimulationSummary } from '../../lib/api';

const props = defineProps<{ summary: SimulationSummary }>();

const v3EnergySaved = computed(() => props.summary.static_v3_energy_kwh - props.summary.coolsense_v3_energy_kwh);

const appOverheadPct = computed(() =>
  v3EnergySaved.value > 0 ? (props.summary.app_energy_kwh / v3EnergySaved.value) * 100 : 0,
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card :title="t('simulation.staticBaseline')">
        <p class="text-label-sm text-on-surface-variant -mt-2 mb-4">
          {{ t('simulation.staticBaselineSubtitle') }}
        </p>
        <dl class="flex flex-col gap-3">
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.energyLabel') }}
            </dt>
            <dd class="text-headline-lg text-on-surface-variant">
              {{ summary.static_v3_energy_kwh.toFixed(1) }} kWh
            </dd>
          </div>
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.co2Label') }}
            </dt>
            <dd class="text-headline-lg text-on-surface-variant">
              {{ summary.static_v3_co2_kg.toFixed(1) }} kg
            </dd>
          </div>
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.costLabel') }}
            </dt>
            <dd class="text-headline-lg text-on-surface-variant">
              {{ summary.static_v3_cost_baht.toFixed(0) }} baht
            </dd>
          </div>
        </dl>
      </Card>

      <Card :title="t('simulation.smartSystem')">
        <p class="text-label-sm text-on-surface-variant -mt-2 mb-4">
          {{ t('simulation.smartSystemSubtitle') }}
        </p>
        <dl class="flex flex-col gap-3">
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.energyLabel') }}
            </dt>
            <dd class="text-headline-lg text-primary">
              {{ summary.coolsense_v3_energy_kwh.toFixed(1) }} kWh
            </dd>
          </div>
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.co2Label') }}
            </dt>
            <dd class="text-headline-lg text-primary">
              {{ summary.coolsense_v3_co2_kg.toFixed(1) }} kg
            </dd>
          </div>
          <div class="flex justify-between items-baseline">
            <dt class="text-label-md text-on-surface-variant">
              {{ t('simulation.costLabel') }}
            </dt>
            <dd class="text-headline-lg text-primary">
              {{ summary.coolsense_v3_cost_baht.toFixed(0) }} baht
            </dd>
          </div>
        </dl>
      </Card>
    </div>

    <Card :title="t('simulation.netSavingsTitle')">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
        <div>
          <div class="text-display-lg text-primary">
            {{ summary.net_energy_saved_kwh.toFixed(1) }} kWh
          </div>
          <div class="text-label-md text-on-surface-variant">
            {{ t('simulation.netEnergySaved') }}
          </div>
        </div>
        <div>
          <div class="text-display-lg text-primary">
            {{ summary.net_co2_saved_kg.toFixed(1) }} kg
          </div>
          <div class="text-label-md text-on-surface-variant">
            {{ t('simulation.netCo2Saved') }}
          </div>
        </div>
        <div>
          <div class="text-display-lg text-primary">
            {{ summary.net_cost_saved_baht.toFixed(0) }} baht
          </div>
          <div class="text-label-md text-on-surface-variant">
            {{ t('simulation.netCostSaved') }}
          </div>
        </div>
      </div>
      <p class="text-label-sm text-on-surface-variant mt-4 pt-4 border-t border-dashed border-slate-200">
        {{
          t('simulation.appEnergyFootnote', {
            kwh: summary.app_energy_kwh.toFixed(3),
            pct: appOverheadPct.toFixed(2),
          })
        }}
      </p>
    </Card>
  </div>
</template>
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npm run typecheck`
Expected: PASS if the backend branch's `SimulationSummary` fields are already merged; otherwise fails only on the four new field names (see "Depends on" above) — not a problem with this component's own code.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/ComparisonSection.vue
git commit -m "feat: add ComparisonSection component for static-vs-smart hero comparison"
```

---

### Task 3: Wire `ComparisonSection` into `SimulationView.vue`, move legacy stats to Advanced Details

**Files:**
- Modify: `frontend/src/views/SimulationView.vue`

**Interfaces:**
- Consumes: `ComparisonSection.vue` (Task 2) as `<ComparisonSection :summary="summary" />`; `summary` is the existing `ref<SimulationSummary | null>` already declared in this file (line 121) — reuse it, don't add a new one.

- [ ] **Step 1: Import `ComparisonSection`**

In `frontend/src/views/SimulationView.vue`, add to the top imports (after the existing `import StatCard from '../components/ui/StatCard.vue';` on line 4):

```typescript
import ComparisonSection from '../components/ui/ComparisonSection.vue';
```

- [ ] **Step 2: Replace the top-level 9-StatCard grid with `ComparisonSection`**

Replace the entire `<div v-if="summary" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">...</div>` block (lines 183–232, from `<div v-if="summary"` through its closing `</div>`) with:

```vue
      <ComparisonSection
        v-if="summary"
        :summary="summary"
      />
```

- [ ] **Step 3: Add the "Advanced Details" collapsible containing the moved stat cards**

Immediately after the `<Card :title="t('simulation.cumulativeEnergy')">...</Card>` block (was lines 242–248, now shifted up since Step 2 removed lines) and before the existing `<details>` "Table view" block, insert a new `<details>` block containing the original 9 `StatCard`s verbatim (same props, same order) plus the app-energy component breakdown as plain text:

```vue
      <details
        v-if="summary"
        class="bg-white rounded-xl border border-slate-200 shadow-[0_4px_20px_rgba(6,78,59,0.05)] p-4"
      >
        <summary class="cursor-pointer text-label-md text-on-surface select-none">
          {{ t('simulation.advancedDetails') }}
        </summary>
        <p class="text-label-sm text-on-surface-variant mt-2 mb-4">
          {{ t('simulation.advancedDetailsSubtitle') }}
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            :label="t('simulation.currentEnergy')"
            :value="`${summary.current_energy_kwh.toFixed(0)} kWh`"
            value-size="headline"
          />
          <StatCard
            :label="t('simulation.smartEnergy')"
            :value="`${summary.smart_energy_kwh.toFixed(1)} kWh`"
            value-size="headline"
          />
          <StatCard
            :label="t('simulation.energySaved')"
            :value="`${(summary.current_energy_kwh - summary.smart_energy_kwh).toFixed(1)} kWh`"
            value-size="headline"
          />
          <StatCard
            :label="t('simulation.pctReduction')"
            :value="`${summary.pct_reduction.toFixed(1)}%`"
            value-size="headline"
          />
          <StatCard
            :label="t('simulation.co2Saved')"
            :value="`${(summary.current_co2_kg - summary.smart_co2_kg).toFixed(1)} kg`"
            value-size="headline"
          />
          <StatCard
            :label="t('simulation.costSaved')"
            :value="`${(summary.current_cost_baht - summary.smart_cost_baht).toFixed(1)} baht`"
            value-size="headline"
          />
          <StatCard
            :label="t('simulation.v3Energy')"
            :value="`${summary.coolsense_v3_energy_kwh.toFixed(1)} kWh`"
            value-size="headline"
          />
          <StatCard
            :label="t('simulation.v3EnergySaved')"
            :value="`${(summary.static_v3_energy_kwh - summary.coolsense_v3_energy_kwh).toFixed(1)} kWh`"
            value-size="headline"
          />
          <StatCard
            :label="t('simulation.v3PctReduction')"
            :value="`${summary.v3_pct_reduction.toFixed(1)}%`"
            value-size="headline"
          />
        </div>
      </details>
```

- [ ] **Step 4: Type-check and lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: PASS. `vue-tsc` will catch any leftover reference to the removed `<div v-if="summary" class="grid ...">` block if Step 2 was applied incompletely.

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: PASS — production build succeeds with the new component tree.

- [ ] **Step 6: Manual verification against the dev server**

Run: `cd frontend && npm run dev` (or `npm run dev:prod` if a local Supabase stack isn't running — the page falls back to `generateMockComparison()` client-side mock data on mount regardless, per the existing `onMounted` hook, so this works without a backend).

In the browser, navigate to the Simulation page and confirm:
- The static-vs-smart comparison renders as two side-by-side cards above the charts, gray-toned static column on the left, green/primary-toned smart column on the right.
- A "Your net savings" card renders below the comparison with three hero numbers and the app-energy footnote text.
- The two charts (power over time, cumulative energy) still render unchanged.
- "Advanced details" and "Table view" both appear as collapsed `<details>` below the charts; expanding "Advanced details" shows the original 9 stat cards.
- Click "Generate & Run Against Live Backend" (requires a local Supabase stack + the backend branch merged) and confirm the comparison/net-savings numbers update from the live response.

Expected: no console errors, all of the above renders correctly in both `en` and `ko` locales (use the locale toggle in the header).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/SimulationView.vue
git commit -m "feat: lead Simulation page with hero comparison, move legacy stats to Advanced Details"
```

---

## Self-Review Notes

- **Spec coverage:** "Redesign analytics page layout... side-by-side before/after" → Task 3 Step 2 (`ComparisonSection`). "Net savings... hero section" → Task 2's second `Card`. "App energy cost transparent but de-emphasized... footnote" → Task 2's footnote `<p>`. "De-clutter... move V2/V3 technical details to advanced section" → Task 3 Step 3 ("Advanced Details" `<details>`). "Charts remain unchanged" → confirmed, `LineAreaChart` usages untouched by this plan. "Hourly data... collapsible" → already existed as the "Table view" `<details>`; left as-is, not duplicated.
- Sticky settings bar (spec's mockup section 1) is **not** in scope here — `SimulationView.vue`'s comparison-settings `Card` already exists at the bottom of the page (not sticky); making it sticky-top would be a layout reflow beyond "reorganize into before/after + net savings + advanced details" and wasn't called out as required in the spec's numbered Data Integration / Success Criteria sections, only in the visual mockup. Flagged back to the spec's author rather than assumed.
