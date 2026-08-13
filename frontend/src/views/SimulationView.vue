<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Card from '../components/ui/Card.vue';
import StatCard from '../components/ui/StatCard.vue';
import LineAreaChart from '../components/ui/LineAreaChart.vue';
import { t } from '../lib/i18n';
import { ROOM_IDS, type RoomId } from '../lib/rooms';
import {
  generateMockData,
  getSimulationHourlyData,
  runSimulation,
  type RoomSize,
  type SimulationHourlyRow,
  type SimulationSummary,
  type WeatherCondition,
} from '../lib/api';

const selectedRoom = ref<RoomId>(ROOM_IDS[0]);

const CURRENT_COLOR = '#2a78d6';
const SMART_COLOR = '#eb6834';
const SMART_V3_COLOR = '#d68f2a';
const CO2_PER_KWH = 0.5;
const COST_PER_KWH_BAHT = 5;
const CURRENT_SYSTEM_KW = 4.5;
const MODE_KW = { eco: 0.5, moderate: 2.5, full: 4.5 };
// Rough stand-ins for the V3 mock preview only — CoolSense V3's real
// physics (supabase/functions/_shared/acCalculationV3.ts) scales with
// actual room area + occupancy, which this client-side mock doesn't model.
// Replaced immediately once "Generate & Run Comparison" succeeds.
const STATIC_V3_KW = 2.75;
const MODE_V3_KW = { eco: 1.0, moderate: 1.8, full: 3.5 };

// No backend/session dependency for the initial view — generates a
// plausible 168h current-vs-smart dataset client-side, using the same
// day/night occupancy pattern and CO2/cost formulas as
// supabase/functions/_shared/simulation.ts, so the shape (flat baseline,
// mode-driven smart plateaus) matches what a real run produces. Replaced by
// the real thing once "Generate & Run Comparison" succeeds against a live
// backend.
function generateMockComparison(durationHours: number): { hourly: SimulationHourlyRow[]; summary: SimulationSummary } {
  const hourly: SimulationHourlyRow[] = [];
  let currentCum = 0;
  let smartCum = 0;
  let staticV3Cum = 0;
  let smartV3Cum = 0;

  for (let i = 0; i < durationHours; i++) {
    const hour = i % 24;
    const isWeekend = Math.floor(i / 24) % 7 >= 5;
    const isPeak = (hour >= 9 && hour < 17) || (hour >= 19 && hour < 23);
    const isNight = hour < 7 || hour >= 23;

    let mode: keyof typeof MODE_KW;
    if (isNight) {
      mode = 'eco';
    } else if (isWeekend) {
      mode = Math.random() < 0.5 ? 'eco' : 'moderate';
    } else if (isPeak) {
      mode = Math.random() < 0.55 ? 'full' : 'moderate';
    } else {
      mode = Math.random() < 0.5 ? 'moderate' : 'eco';
    }
    const smartKw = MODE_KW[mode];
    const smartV3Kw = MODE_V3_KW[mode];

    currentCum += CURRENT_SYSTEM_KW;
    smartCum += smartKw;
    staticV3Cum += STATIC_V3_KW;
    smartV3Cum += smartV3Kw;

    hourly.push({
      id: `mock-${i}`,
      simulation_run_id: 'mock',
      hour_index: i,
      current_power_kw: CURRENT_SYSTEM_KW,
      smart_power_kw: smartKw,
      current_cumulative_kwh: currentCum,
      smart_cumulative_kwh: smartCum,
      current_cumulative_co2: currentCum * CO2_PER_KWH,
      smart_cumulative_co2: smartCum * CO2_PER_KWH,
      static_v3_power_kw: STATIC_V3_KW,
      coolsense_v3_power_kw: smartV3Kw,
      static_v3_cumulative_kwh: staticV3Cum,
      coolsense_v3_cumulative_kwh: smartV3Cum,
      static_v3_cumulative_co2: staticV3Cum * CO2_PER_KWH,
      coolsense_v3_cumulative_co2: smartV3Cum * CO2_PER_KWH,
    });
  }

  const energySaved = currentCum - smartCum;
  const v3EnergySaved = staticV3Cum - smartV3Cum;
  const summary: SimulationSummary = {
    duration_hours: durationHours,
    current_energy_kwh: currentCum,
    smart_energy_kwh: smartCum,
    current_co2_kg: currentCum * CO2_PER_KWH,
    smart_co2_kg: smartCum * CO2_PER_KWH,
    current_cost_baht: currentCum * COST_PER_KWH_BAHT,
    smart_cost_baht: smartCum * COST_PER_KWH_BAHT,
    pct_reduction: currentCum > 0 ? (energySaved / currentCum) * 100 : 0,
    static_v3_energy_kwh: staticV3Cum,
    coolsense_v3_energy_kwh: smartV3Cum,
    static_v3_co2_kg: staticV3Cum * CO2_PER_KWH,
    coolsense_v3_co2_kg: smartV3Cum * CO2_PER_KWH,
    static_v3_cost_baht: staticV3Cum * COST_PER_KWH_BAHT,
    coolsense_v3_cost_baht: smartV3Cum * COST_PER_KWH_BAHT,
    v3_pct_reduction: staticV3Cum > 0 ? (v3EnergySaved / staticV3Cum) * 100 : 0,
  };

  return { hourly, summary };
}

const durationHours = ref(168);
const roomSize = ref<RoomSize>('medium');
const weatherCondition = ref<WeatherCondition>('diurnal');
const acSeer = ref(4.5);

const running = ref(false);
const errorMessage = ref('');
const summary = ref<SimulationSummary | null>(null);
const hourlyData = ref<SimulationHourlyRow[]>([]);

const chartSeries = computed(() => ({
  power: [
    { key: 'current_power_kw', color: CURRENT_COLOR, label: t('simulation.currentLegend') },
    { key: 'smart_power_kw', color: SMART_COLOR, label: t('simulation.smartLegend') },
    { key: 'coolsense_v3_power_kw', color: SMART_V3_COLOR, label: t('simulation.smartV3Legend') },
  ],
  energy: [
    { key: 'current_cumulative_kwh', color: CURRENT_COLOR, label: t('simulation.currentLegend') },
    { key: 'smart_cumulative_kwh', color: SMART_COLOR, label: t('simulation.smartLegend') },
    { key: 'coolsense_v3_cumulative_kwh', color: SMART_V3_COLOR, label: t('simulation.smartV3Legend') },
  ],
}));

onMounted(() => {
  const mock = generateMockComparison(durationHours.value);
  hourlyData.value = mock.hourly;
  summary.value = mock.summary;
});

async function handleGenerateAndRun() {
  running.value = true;
  errorMessage.value = '';
  try {
    await generateMockData(durationHours.value, roomSize.value);
    const result = await runSimulation(durationHours.value, roomSize.value, acSeer.value, weatherCondition.value);
    summary.value = result.summary;
    hourlyData.value = await getSimulationHourlyData(result.simulation_run_id);
  } catch {
    errorMessage.value = t('simulation.errorFallback');
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col md:flex-row gap-6 items-start">
    <aside class="md:w-56 shrink-0 w-full">
      <Card :title="t('simulation.rooms')">
        <div class="flex flex-col gap-1.5">
          <button
            v-for="id in ROOM_IDS"
            :key="id"
            type="button"
            class="w-full text-left px-4 py-2.5 rounded-lg text-label-md transition-colors"
            :class="
              selectedRoom === id
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            "
            @click="selectedRoom = id"
          >
            {{ t(`rooms.${id}`) }}
          </button>
        </div>
      </Card>
    </aside>

    <div class="flex-1 min-w-0 flex flex-col gap-6">
      <div
        v-if="summary"
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
      >
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

      <Card :title="t('simulation.powerOverTime')">
        <LineAreaChart
          :data="hourlyData"
          mode="line"
          :series="chartSeries.power"
        />
      </Card>

      <Card :title="t('simulation.cumulativeEnergy')">
        <LineAreaChart
          :data="hourlyData"
          mode="area"
          :series="chartSeries.energy"
        />
      </Card>

      <details class="bg-white rounded-xl border border-slate-200 shadow-[0_4px_20px_rgba(6,78,59,0.05)] p-4">
        <summary class="cursor-pointer text-label-md text-on-surface select-none">
          {{ t('simulation.tableView') }}
        </summary>
        <div class="mt-4 overflow-x-auto max-h-96 overflow-y-auto">
          <table class="w-full text-label-sm">
            <thead>
              <tr class="text-left text-on-surface-variant border-b border-slate-200">
                <th class="py-2 pr-4">
                  {{ t('simulation.hour') }}
                </th>
                <th class="py-2 pr-4">
                  {{ t('simulation.currentKw') }}
                </th>
                <th class="py-2 pr-4">
                  {{ t('simulation.smartKw') }}
                </th>
                <th class="py-2 pr-4">
                  {{ t('simulation.smartV3Kw') }}
                </th>
                <th class="py-2 pr-4">
                  {{ t('simulation.currentCumKwh') }}
                </th>
                <th class="py-2 pr-4">
                  {{ t('simulation.smartCumKwh') }}
                </th>
                <th class="py-2 pr-4">
                  {{ t('simulation.smartV3CumKwh') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in hourlyData"
                :key="row.hour_index"
                class="border-b border-slate-100"
              >
                <td class="py-1.5 pr-4">
                  {{ row.hour_index }}h
                </td>
                <td class="py-1.5 pr-4">
                  {{ row.current_power_kw.toFixed(2) }}
                </td>
                <td class="py-1.5 pr-4">
                  {{ row.smart_power_kw.toFixed(2) }}
                </td>
                <td class="py-1.5 pr-4">
                  {{ row.coolsense_v3_power_kw.toFixed(2) }}
                </td>
                <td class="py-1.5 pr-4">
                  {{ row.current_cumulative_kwh.toFixed(1) }}
                </td>
                <td class="py-1.5 pr-4">
                  {{ row.smart_cumulative_kwh.toFixed(1) }}
                </td>
                <td class="py-1.5 pr-4">
                  {{ row.coolsense_v3_cumulative_kwh.toFixed(1) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <Card :title="t('simulation.comparisonSettings')">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div class="flex flex-col gap-1.5">
            <label
              class="text-label-md text-on-surface-variant"
              for="an_duration"
            >{{ t('simulation.duration') }}</label>
            <input
              id="an_duration"
              v-model.number="durationHours"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-body-md"
              type="number"
              min="1"
            >
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-label-md text-on-surface-variant"
              for="an_room_size"
            >{{ t('simulation.roomSize') }}</label>
            <select
              id="an_room_size"
              v-model="roomSize"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-body-md bg-white"
            >
              <option value="small">
                {{ t('common.small') }}
              </option>
              <option value="medium">
                {{ t('common.medium') }}
              </option>
              <option value="large">
                {{ t('common.large') }}
              </option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-label-md text-on-surface-variant"
              for="an_weather"
            >{{ t('simulation.weather') }}</label>
            <select
              id="an_weather"
              v-model="weatherCondition"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-body-md bg-white"
            >
              <option value="diurnal">
                {{ t('simulation.diurnal') }}
              </option>
              <option value="cool">
                {{ t('simulation.cool') }}
              </option>
              <option value="warm">
                {{ t('simulation.warm') }}
              </option>
              <option value="hot">
                {{ t('simulation.hot') }}
              </option>
            </select>
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-label-md text-on-surface-variant"
              for="an_seer"
            >{{ t('simulation.acSeer') }}</label>
            <input
              id="an_seer"
              v-model.number="acSeer"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-body-md"
              type="number"
              min="2"
              max="6"
              step="0.1"
            >
          </div>
        </div>
        <div class="flex items-center gap-3">
          <button
            type="button"
            :disabled="running"
            class="border border-slate-300 text-on-surface text-label-md rounded-lg px-4 py-2.5 hover:bg-surface-container-low transition-colors disabled:opacity-50"
            @click="handleGenerateAndRun"
          >
            {{ running ? t('simulation.running') : t('simulation.runButton') }}
          </button>
          <span
            v-if="errorMessage"
            class="text-label-sm text-error"
          >{{ errorMessage }}</span>
        </div>
      </Card>
    </div>
  </div>
</template>
