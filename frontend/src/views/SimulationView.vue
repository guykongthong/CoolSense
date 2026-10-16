<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Card from '../components/ui/Card.vue';
import StatCard from '../components/ui/StatCard.vue';
import ComparisonSection from '../components/ui/ComparisonSection.vue';
import LineAreaChart from '../components/ui/LineAreaChart.vue';
import { CHART_1, CHART_2 } from '../lib/chartColors';
import { formatNumber } from '../lib/format';
import { t } from '../lib/i18n';
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
import { isDemoMode } from '../lib/mock/mode';
import { roomAverageSeer, roomsInScope } from '../lib/mock/rooms';
import { floorName, roomName, useSelectedFloor } from '../composables/useSelectedFloor';

const BASELINE_COLOR = CHART_2;
const COOLSENSE_COLOR = CHART_1;

const { selectedFloor, ALL_FLOORS } = useSelectedFloor();
// The rooms the selection covers. With anything but exactly one room, each
// room runs as set up on the Device page and the results are added up.
const scopeRooms = computed(() => (isDemoMode ? roomsInScope(selectedFloor.value) : []));
const multiRoom = computed(() => isDemoMode && scopeRooms.value.length !== 1);

const scopeText = computed(() => {
  if (selectedFloor.value === ALL_FLOORS) return t('simulation.scopeAll');
  if (scopeRooms.value.length === 1) {
    return t('simulation.scopeRoom', { floor: floorName(selectedFloor.value), room: roomName(scopeRooms.value[0].id) });
  }
  return t('simulation.scopeFloor', { floor: floorName(selectedFloor.value), n: scopeRooms.value.length });
});

const durationHours = ref(168);
const roomSize = ref<RoomSize>('medium');
const weatherCondition = ref<WeatherCondition>('diurnal');
// Mirrors supabase/functions/_shared/acCalculationV3.ts's STANDARD_SEER_V3 /
// InformationView.vue's MIN_AC_SEER-MAX_AC_SEER, CoolSense V3 (the only
// live model) uses a realistic 13-25 SEER range, not V1's old 2-6/4.5.
const STANDARD_SEER_V3 = 15;
const MIN_AC_SEER = 13;
const MAX_AC_SEER = 25;
const acSeer = ref(STANDARD_SEER_V3);

// Static baseline's configurable setpoint (`static_temp_c` on the backend,
// see supabase/functions/_shared/simulation.ts). Defaults to 21°C, full
// mode's base temp, since a milder default just gets silently clamped
// there anyway by staticV3Settings' worst-case-occupancy floor.
const DEFAULT_STATIC_TEMP_C = 21;
const staticTempC = ref(DEFAULT_STATIC_TEMP_C);

// Optional operating-hours schedule, simulation-only, since it can't be
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

// What the currently-displayed results were actually run with, compared
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

// Only static-v3 (the size/weather-aware baseline) vs CoolSense V3,
// CoolSense V1/V2 were dropped from these graphs once V3 became the only
// live model (see CLAUDE.md's CoolSense V3 section); showing three models
// when only one is ever actually deployed just clutters the chart with
// history no one's asking to compare against anymore.
const chartSeries = computed(() => ({
  power: [
    { key: 'static_v3_power_kw', color: BASELINE_COLOR, label: t('simulation.staticBaseline') },
    { key: 'coolsense_v3_power_kw', color: COOLSENSE_COLOR, label: t('simulation.smartSystem') },
  ],
  energy: [
    { key: 'static_v3_cumulative_kwh', color: BASELINE_COLOR, label: t('simulation.staticBaseline') },
    { key: 'coolsense_v3_cumulative_kwh', color: COOLSENSE_COLOR, label: t('simulation.smartSystem') },
  ],
  temperature: [
    { key: 'static_v3_temperature_c', color: BASELINE_COLOR, label: t('simulation.staticBaseline') },
    { key: 'coolsense_v3_temperature_c', color: COOLSENSE_COLOR, label: t('simulation.smartSystem') },
  ],
}));

// Picking a floor with a single room fills the form from that room, either
// way the old results are cleared.
if (isDemoMode) {
  watch(
    selectedFloor,
    () => {
      const [room] = scopeRooms.value;
      if (scopeRooms.value.length === 1) {
        roomSize.value = room.size;
        acSeer.value = Math.min(MAX_AC_SEER, Math.max(MIN_AC_SEER, Math.round(roomAverageSeer(room) * 10) / 10));
      }
      summary.value = null;
      hourlyData.value = [];
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
      // Demo mode shows results straight away instead of an empty page.
      void handleGenerateAndRun();
    },
    { immediate: true },
  );
}

async function handleGenerateAndRun() {
  running.value = true;
  errorMessage.value = '';
  try {
    await withProgress(async () => {
      await generateMockData(durationHours.value, roomSize.value, selectedFloor.value);
      const result = await runSimulation(
        durationHours.value,
        roomSize.value,
        acSeer.value,
        weatherCondition.value,
        schedule.value,
        staticTempC.value,
        selectedFloor.value,
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
    <aside class="w-full md:w-72 shrink-0 md:sticky md:top-24">
      <Card :title="t('simulation.comparisonSettings')">
        <p
          v-if="isDemoMode"
          class="text-label-md text-on-surface-variant mb-4"
        >
          {{ scopeText }}
        </p>
        <div class="flex flex-col gap-4 mb-4">
          <div class="flex flex-col gap-1.5">
            <label
              class="text-label-md text-on-surface-variant"
              for="an_duration"
            >{{ t('simulation.duration') }}</label>
            <input
              id="an_duration"
              v-model.number="durationHours"
              class="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-md"
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
              :disabled="multiRoom"
              class="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-md bg-surface-container-lowest disabled:opacity-60"
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
              class="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-md bg-surface-container-lowest"
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
              :disabled="multiRoom"
              class="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-md disabled:opacity-60"
              type="number"
              :min="MIN_AC_SEER"
              :max="MAX_AC_SEER"
              step="0.1"
            >
          </div>
          <div class="flex flex-col gap-1.5">
            <label
              class="text-label-md text-on-surface-variant"
              for="an_static_temp"
            >{{ t('simulation.staticTempC') }}</label>
            <input
              id="an_static_temp"
              v-model.number="staticTempC"
              class="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-md"
              type="number"
              min="10"
              max="30"
              step="0.5"
            >
          </div>
        </div>

        <details class="mb-4 pt-4 border-t border-slate-200">
          <summary class="cursor-pointer text-label-md text-on-surface select-none min-h-[44px] flex items-center">
            {{ t('simulation.scheduleToggle') }}
          </summary>
          <label class="flex items-center gap-2 text-label-md text-on-surface-variant mt-2 mb-2 min-h-[44px] cursor-pointer">
            <input
              v-model="scheduleEnabled"
              type="checkbox"
              class="accent-primary w-4 h-4"
            >
            {{ t('simulation.scheduleEnable') }}
          </label>
          <p class="text-label-sm text-on-surface-variant mb-2">
            {{ t('simulation.scheduleHint') }}
          </p>
          <div
            v-if="scheduleEnabled"
            class="flex flex-col gap-4"
          >
            <div class="flex flex-col gap-1.5">
              <label
                class="text-label-md text-on-surface-variant"
                for="an_schedule_start"
              >{{ t('simulation.scheduleStart') }}</label>
              <input
                id="an_schedule_start"
                v-model.number="scheduleStartHour"
                class="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-md"
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
                class="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-md"
                type="number"
                min="0"
                max="23"
              >
            </div>
          </div>
        </details>

        <div class="flex flex-col gap-3">
          <button
            type="button"
            :disabled="running"
            class="text-label-md rounded-lg px-4 py-3 min-h-[44px] transition-colors disabled:opacity-50"
            :class="
              hasPendingChanges
                ? 'bg-primary text-on-primary hover:opacity-90'
                : 'border border-outline text-on-surface hover:bg-surface-container-low'
            "
            @click="handleGenerateAndRun"
          >
            {{ running ? t('simulation.running') : t('simulation.runButton') }}
          </button>
          <span
            v-if="hasPendingChanges && !running"
            class="text-label-md text-primary flex items-center gap-1"
          >
            <span
              class="material-symbols-outlined text-[18px]"
              aria-hidden="true"
            >info</span>
            {{ t('simulation.pendingChanges') }}
          </span>
          <span
            v-if="errorMessage"
            class="text-label-md text-error flex items-center gap-1"
            role="alert"
          >
            <span
              class="material-symbols-outlined text-[18px]"
              aria-hidden="true"
            >error</span>
            {{ errorMessage }}
          </span>
        </div>
      </Card>
    </aside>

    <div class="flex-1 min-w-0 flex flex-col gap-6">
      <template v-if="summary">
        <ComparisonSection :summary="summary" />

        <Card :title="t('simulation.powerOverTime')">
          <LineAreaChart
            :data="hourlyData"
            mode="line"
            :series="chartSeries.power"
            unit=" kW"
            :aria-label="t('simulation.powerOverTime')"
          />
        </Card>

        <Card :title="t('simulation.cumulativeEnergy')">
          <LineAreaChart
            :data="hourlyData"
            mode="area"
            :series="chartSeries.energy"
            unit=" kWh"
            :aria-label="t('simulation.cumulativeEnergy')"
          />
        </Card>

        <Card :title="t('simulation.temperatureOverTime')">
          <LineAreaChart
            :data="hourlyData"
            mode="line"
            :series="chartSeries.temperature"
            unit="°C"
            :y-min="18"
            :aria-label="t('simulation.temperatureOverTime')"
          />
        </Card>

        <details class="bg-surface-container-lowest rounded-xl border border-slate-200 shadow-card p-4">
          <summary class="cursor-pointer text-label-md text-on-surface select-none min-h-11 flex items-center">
            {{ t('simulation.advancedDetails') }}
          </summary>
          <p class="text-label-sm text-on-surface-variant mt-2 mb-4">
            {{ t('simulation.advancedDetailsSubtitle') }}
          </p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard
              :label="t('simulation.v3Energy')"
              :value="`${formatNumber(summary.coolsense_v3_energy_kwh, 1)} kWh`"
              value-size="headline"
            />
            <StatCard
              :label="t('simulation.v3EnergySaved')"
              :value="`${formatNumber(summary.static_v3_energy_kwh - summary.coolsense_v3_energy_kwh, 1)} kWh`"
              value-size="headline"
            />
            <StatCard
              :label="t('simulation.v3PctReduction')"
              :value="`${formatNumber(summary.v3_pct_reduction, 1)}%`"
              value-size="headline"
            />
          </div>
        </details>

        <details class="bg-surface-container-lowest rounded-xl border border-slate-200 shadow-card p-4">
          <summary class="cursor-pointer text-label-md text-on-surface select-none min-h-11 flex items-center">
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
                    {{ formatNumber(row.static_v3_power_kw, 2) }}
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ formatNumber(row.coolsense_v3_power_kw, 2) }}
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ formatNumber(row.static_v3_cumulative_kwh, 1) }}
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ formatNumber(row.coolsense_v3_cumulative_kwh, 1) }}
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ formatNumber(row.static_v3_temperature_c, 1) }}°C
                  </td>
                  <td class="py-1.5 pr-4">
                    {{ formatNumber(row.coolsense_v3_temperature_c, 1) }}°C
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
