<script setup lang="ts">
import { computed, ref } from 'vue';
import Card from '../components/ui/Card.vue';
import StatCard from '../components/ui/StatCard.vue';
import ComparisonSection from '../components/ui/ComparisonSection.vue';
import LineAreaChart from '../components/ui/LineAreaChart.vue';
import { t } from '../lib/i18n';
import { ROOM_IDS, type RoomId } from '../lib/rooms';
import {
  generateMockData,
  getSimulationHourlyData,
  type OperatingHoursSchedule,
  runSimulation,
  type RoomSize,
  type SimulationHourlyRow,
  type SimulationSummary,
  type WeatherCondition,
} from '../lib/api';
import { withProgress } from '../lib/progress';

const selectedRoom = ref<RoomId>(ROOM_IDS[0]);

const CURRENT_COLOR = '#2a78d6';
const SMART_V3_COLOR = '#d68f2a';

const durationHours = ref(168);
const roomSize = ref<RoomSize>('medium');
const weatherCondition = ref<WeatherCondition>('diurnal');
// Mirrors supabase/functions/_shared/acCalculationV3.ts's STANDARD_SEER_V3 /
// InformationView.vue's MIN_AC_SEER-MAX_AC_SEER — CoolSense V3 (the only
// live model) uses a realistic 13-25 SEER range, not V1's old 2-6/4.5.
const STANDARD_SEER_V3 = 15;
const MIN_AC_SEER = 13;
const MAX_AC_SEER = 25;
const acSeer = ref(STANDARD_SEER_V3);

// Static baseline's configurable setpoint (`static_temp_c` on the backend,
// see supabase/functions/_shared/simulation.ts). Defaults to 21°C — full
// mode's base temp — since a milder default just gets silently clamped
// there anyway by staticV3Settings' worst-case-occupancy floor.
const DEFAULT_STATIC_TEMP_C = 21;
const staticTempC = ref(DEFAULT_STATIC_TEMP_C);

// Optional operating-hours schedule — simulation-only, since it can't be
// demoed against the live single-room calculation (see CLAUDE.md). When
// disabled, every model runs 24/7 (today's behavior, unchanged).
const scheduleEnabled = ref(false);
const scheduleStartHour = ref(9);
const scheduleEndHour = ref(20);
const schedule = computed<OperatingHoursSchedule | undefined>(() =>
  scheduleEnabled.value ? { startHour: scheduleStartHour.value, endHour: scheduleEndHour.value } : undefined,
);

const running = ref(false);
const errorMessage = ref('');
const summary = ref<SimulationSummary | null>(null);
const hourlyData = ref<SimulationHourlyRow[]>([]);

// What the currently-displayed results were actually run with — compared
// against the live input refs below to flag "you changed a setting but
// haven't re-run yet" instead of leaving the graph silently stale.
const lastRunParams = ref({
  durationHours: durationHours.value,
  roomSize: roomSize.value,
  weatherCondition: weatherCondition.value,
  acSeer: acSeer.value,
  staticTempC: staticTempC.value,
  scheduleEnabled: scheduleEnabled.value,
  scheduleStartHour: scheduleStartHour.value,
  scheduleEndHour: scheduleEndHour.value,
});

const hasPendingChanges = computed(
  () =>
    durationHours.value !== lastRunParams.value.durationHours ||
    roomSize.value !== lastRunParams.value.roomSize ||
    weatherCondition.value !== lastRunParams.value.weatherCondition ||
    acSeer.value !== lastRunParams.value.acSeer ||
    staticTempC.value !== lastRunParams.value.staticTempC ||
    scheduleEnabled.value !== lastRunParams.value.scheduleEnabled ||
    (scheduleEnabled.value &&
      (scheduleStartHour.value !== lastRunParams.value.scheduleStartHour ||
        scheduleEndHour.value !== lastRunParams.value.scheduleEndHour)),
);

// Only static-v3 (the size/weather-aware baseline) vs CoolSense V3 —
// CoolSense V1/V2 were dropped from these graphs once V3 became the only
// live model (see CLAUDE.md's CoolSense V3 section); showing three models
// when only one is ever actually deployed just clutters the chart with
// history no one's asking to compare against anymore.
const chartSeries = computed(() => ({
  power: [
    { key: 'static_v3_power_kw', color: CURRENT_COLOR, label: t('simulation.staticBaseline') },
    { key: 'coolsense_v3_power_kw', color: SMART_V3_COLOR, label: t('simulation.smartSystem') },
  ],
  energy: [
    { key: 'static_v3_cumulative_kwh', color: CURRENT_COLOR, label: t('simulation.staticBaseline') },
    { key: 'coolsense_v3_cumulative_kwh', color: SMART_V3_COLOR, label: t('simulation.smartSystem') },
  ],
  temperature: [
    { key: 'static_v3_temperature_c', color: CURRENT_COLOR, label: t('simulation.staticBaseline') },
    { key: 'coolsense_v3_temperature_c', color: SMART_V3_COLOR, label: t('simulation.smartSystem') },
  ],
}));

async function handleGenerateAndRun() {
  running.value = true;
  errorMessage.value = '';
  try {
    await withProgress(async () => {
      await generateMockData(durationHours.value, roomSize.value);
      const result = await runSimulation(
        durationHours.value,
        roomSize.value,
        acSeer.value,
        weatherCondition.value,
        schedule.value,
        staticTempC.value,
      );
      summary.value = result.summary;
      hourlyData.value = await getSimulationHourlyData(result.simulation_run_id);
    });
    lastRunParams.value = {
      durationHours: durationHours.value,
      roomSize: roomSize.value,
      weatherCondition: weatherCondition.value,
      acSeer: acSeer.value,
      staticTempC: staticTempC.value,
      scheduleEnabled: scheduleEnabled.value,
      scheduleStartHour: scheduleStartHour.value,
      scheduleEndHour: scheduleEndHour.value,
    };
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
      <div class="sticky top-4 z-10">
        <Card :title="t('simulation.comparisonSettings')">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
            <div class="flex flex-col gap-1.5">
              <label
                class="text-label-md text-on-surface-variant min-h-[2.5rem] flex items-end"
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
                class="text-label-md text-on-surface-variant min-h-[2.5rem] flex items-end"
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
                class="text-label-md text-on-surface-variant min-h-[2.5rem] flex items-end"
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
                class="text-label-md text-on-surface-variant min-h-[2.5rem] flex items-end"
                for="an_seer"
              >{{ t('simulation.acSeer') }}</label>
              <input
                id="an_seer"
                v-model.number="acSeer"
                class="w-full border border-slate-300 rounded-lg px-3 py-2 text-body-md"
                type="number"
                :min="MIN_AC_SEER"
                :max="MAX_AC_SEER"
                step="0.1"
              >
            </div>
            <div class="flex flex-col gap-1.5">
              <label
                class="text-label-md text-on-surface-variant min-h-[2.5rem] flex items-end"
                for="an_static_temp"
              >{{ t('simulation.staticTempC') }}</label>
              <input
                id="an_static_temp"
                v-model.number="staticTempC"
                class="w-full border border-slate-300 rounded-lg px-3 py-2 text-body-md"
                type="number"
                min="10"
                max="30"
                step="0.5"
              >
            </div>
          </div>

          <div class="mb-4 pt-4 border-t border-slate-200">
            <label class="flex items-center gap-2 text-label-md text-on-surface-variant mb-2">
              <input
                v-model="scheduleEnabled"
                type="checkbox"
                class="accent-primary w-4 h-4"
              >
              {{ t('simulation.scheduleToggle') }}
            </label>
            <p class="text-label-sm text-on-surface-variant mb-2">
              {{ t('simulation.scheduleHint') }}
            </p>
            <div
              v-if="scheduleEnabled"
              class="grid grid-cols-2 gap-4 max-w-md"
            >
              <div class="flex flex-col gap-1.5">
                <label
                  class="text-label-md text-on-surface-variant"
                  for="an_schedule_start"
                >{{ t('simulation.scheduleStart') }}</label>
                <input
                  id="an_schedule_start"
                  v-model.number="scheduleStartHour"
                  class="w-full border border-slate-300 rounded-lg px-3 py-2 text-body-md"
                  type="number"
                  min="0"
                  max="23"
                >
              </div>
              <div class="flex flex-col gap-1.5">
                <label
                  class="text-label-md text-on-surface-variant"
                  for="an_schedule_end"
                >{{ t('simulation.scheduleEnd') }}</label>
                <input
                  id="an_schedule_end"
                  v-model.number="scheduleEndHour"
                  class="w-full border border-slate-300 rounded-lg px-3 py-2 text-body-md"
                  type="number"
                  min="0"
                  max="23"
                >
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              :disabled="running"
              class="text-label-md rounded-lg px-4 py-2.5 transition-colors disabled:opacity-50"
              :class="
                hasPendingChanges
                  ? 'bg-primary text-on-primary hover:opacity-90 animate-pulse'
                  : 'border border-slate-300 text-on-surface hover:bg-surface-container-low'
              "
              @click="handleGenerateAndRun"
            >
              {{ running ? t('simulation.running') : t('simulation.runButton') }}
            </button>
            <span
              v-if="hasPendingChanges && !running"
              class="text-label-sm text-primary"
            >{{ t('simulation.pendingChanges') }}</span>
            <span
              v-if="errorMessage"
              class="text-label-sm text-error"
            >{{ errorMessage }}</span>
          </div>
        </Card>
      </div>

      <template v-if="summary">
        <ComparisonSection :summary="summary" />

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

        <Card :title="t('simulation.temperatureOverTime')">
          <LineAreaChart
            :data="hourlyData"
            mode="line"
            :series="chartSeries.temperature"
            :y-min="18"
          />
        </Card>

        <details class="bg-white rounded-xl border border-slate-200 shadow-[0_4px_20px_rgba(6,78,59,0.05)] p-4">
          <summary class="cursor-pointer text-label-md text-on-surface select-none">
            {{ t('simulation.advancedDetails') }}
          </summary>
          <p class="text-label-sm text-on-surface-variant mt-2 mb-4">
            {{ t('simulation.advancedDetailsSubtitle') }}
          </p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                    {{ t('simulation.staticV3Kw') }}
                  </th>
                  <th class="py-2 pr-4">
                    {{ t('simulation.smartV3Kw') }}
                  </th>
                  <th class="py-2 pr-4">
                    {{ t('simulation.staticV3CumKwh') }}
                  </th>
                  <th class="py-2 pr-4">
                    {{ t('simulation.smartV3CumKwh') }}
                  </th>
                  <th class="py-2 pr-4">
                    {{ t('simulation.staticV3TempC') }}
                  </th>
                  <th class="py-2 pr-4">
                    {{ t('simulation.smartV3TempC') }}
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
                    {{ row.static_v3_power_kw.toFixed(2) }}
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ row.coolsense_v3_power_kw.toFixed(2) }}
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ row.static_v3_cumulative_kwh.toFixed(1) }}
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ row.coolsense_v3_cumulative_kwh.toFixed(1) }}
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ row.static_v3_temperature_c.toFixed(1) }}°C
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ row.coolsense_v3_temperature_c.toFixed(1) }}°C
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </template>

      <Card v-else>
        <p class="text-body-md text-on-surface-variant text-center py-8">
          {{ t('simulation.emptyState') }}
        </p>
      </Card>
    </div>
  </div>
</template>
