<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import Card from '../components/ui/Card.vue';
import StatCard from '../components/ui/StatCard.vue';
import LineAreaChart from '../components/ui/LineAreaChart.vue';
import { t } from '../lib/i18n';
import { CHART_1, CHART_2, CHART_3, CHART_4 } from '../lib/chartColors';
import { formatNumber, formatShortDate, formatTime } from '../lib/format';
import {
  type CarbonHistory,
  getCarbonHistory,
  getLatestSimulationCarbon,
  getUsageBreakdown,
  type SimulationCarbon,
  type UsageBreakdownItem,
} from '../lib/carbon';
import {
  type DateRange,
  getElectricHistory,
  getPeopleHistory,
  getTemperatureHistory,
  type HistoryPoint,
  rangeStart,
  TODAY_BUCKET_MINUTES,
} from '../lib/api';
import { withProgress } from '../lib/progress';
import { isDemoMode } from '../lib/mock/mode';
import { floorName, roomName, useSelectedFloor } from '../composables/useSelectedFloor';
import RankedBarList from '../components/ui/RankedBarList.vue';

type Tab = 'people' | 'electric' | 'temperature' | 'carbon';
type HistoryTab = Exclude<Tab, 'carbon'>;

const TAB_IDS: Tab[] = ['people', 'electric', 'temperature', 'carbon'];
const RANGE_IDS: DateRange[] = ['today', '7d', '30d'];

const TAB_CONFIG: Record<HistoryTab, { fetcher: (range: DateRange, floorId?: string) => Promise<HistoryPoint[]>; color: string; unit: string }> = {
  people: { fetcher: getPeopleHistory, color: CHART_3, unit: '' },
  electric: { fetcher: getElectricHistory, color: CHART_1, unit: ' kW' },
  temperature: { fetcher: getTemperatureHistory, color: CHART_4, unit: '°C' },
};

const activeTab = ref<Tab>('people');
const dateRange = ref<DateRange>('today');
const points = ref<HistoryPoint[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const carbon = ref<CarbonHistory | null>(null);
const simCarbon = ref<SimulationCarbon | null>(null);
const breakdown = ref<UsageBreakdownItem[]>([]);
const { selectedFloor } = useSelectedFloor();

// Ignore results from a request that was superseded by a newer tab/range
// choice, so a slow response can't overwrite fresher data.
let requestId = 0;

async function load(showProgress = true) {
  const myRequest = ++requestId;
  loading.value = true;
  errorMessage.value = '';
  const tab = activeTab.value;
  const range = dateRange.value;
  const fetchData = async () => {
    const scope = selectedFloor.value;
    if (tab === 'carbon') {
      const [history, sim, parts] = await Promise.all([
        getCarbonHistory(range, scope),
        getLatestSimulationCarbon(scope).catch(() => null),
        getUsageBreakdown(range, scope),
      ]);
      return { kind: 'carbon' as const, history, sim, parts };
    }
    if (tab === 'electric') {
      const partsRequest = getUsageBreakdown(range, scope);
      const rows = await TAB_CONFIG[tab].fetcher(range, scope);
      return { kind: 'electric' as const, rows, parts: await partsRequest };
    }
    return TAB_CONFIG[tab].fetcher(range, scope);
  };
  try {
    const result = showProgress ? await withProgress(fetchData) : await fetchData();
    if (myRequest !== requestId) return;
    if (Array.isArray(result)) {
      points.value = result;
    } else if (result.kind === 'electric') {
      points.value = result.rows;
      breakdown.value = result.parts;
    } else {
      carbon.value = result.history;
      simCarbon.value = result.sim;
      breakdown.value = result.parts;
    }
  } catch {
    if (myRequest !== requestId) return;
    errorMessage.value = t('analytics.errorFallback');
    points.value = [];
    carbon.value = null;
  } finally {
    if (myRequest === requestId) loading.value = false;
  }
}

watch([activeTab, dateRange, selectedFloor], () => load(), { immediate: true });

// These are aggregated/bucketed queries, not a single row, Realtime's
// postgres_changes can't target "re-run this aggregation," so a light
// poll is the practical way to keep the chart current as new readings
// (camera detections, /calculation runs) come in while the page is open.
// Runs silently (showProgress=false), a top-bar flash every 30s while the
// page just sits open would be noisy, not informative.
const REFRESH_INTERVAL_MS = 30_000;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  refreshInterval = setInterval(() => load(false), REFRESH_INTERVAL_MS);
});

onUnmounted(() => {
  if (refreshInterval !== null) clearInterval(refreshInterval);
});

const isCarbon = computed(() => activeTab.value === 'carbon');
const historyTab = computed<HistoryTab>(() => (activeTab.value === 'carbon' ? 'electric' : activeTab.value));

const chartSeries = computed(() => [
  { key: 'value', color: TAB_CONFIG[historyTab.value].color, label: t('analytics.legendRecorded') },
]);

// Bucket size in minutes for the current tab (carbon uses hourly buckets today).
function bucketMinutes(): number {
  if (dateRange.value !== 'today') return 24 * 60;
  return isCarbon.value ? 60 : TODAY_BUCKET_MINUTES;
}

function formatLabel(row: Record<string, unknown>): string {
  const bucket = Number(row.bucket);
  const date = new Date(rangeStart(dateRange.value).getTime() + bucket * bucketMinutes() * 60 * 1000);
  return dateRange.value === 'today' ? formatTime(date) : formatShortDate(date);
}

const hasData = computed(() => points.value.some((p) => p.value > 0));

const titleKey = computed(() => `analytics.${activeTab.value}Title`);
const subtitleKey = computed(() => `analytics.${activeTab.value}Subtitle`);

const carbonTotals = computed(() => carbon.value?.totals ?? null);
const hasCarbonData = computed(() => (carbon.value?.totals.rowsUsed ?? 0) > 0);

const carbonSeries = computed(() => [
  { key: 'actualKg', color: CHART_1, label: t('analytics.carbon.coolsense') },
  { key: 'baselineKg', color: CHART_2, label: t('analytics.carbon.baseline') },
]);
const savedSeries = computed(() => [
  { key: 'cumulativeSavedKg', color: CHART_1, label: t('analytics.carbon.cumulativeSaved') },
]);
const simSeries = computed(() => [
  { key: 'staticKg', color: CHART_2, label: t('analytics.carbon.staticSystem') },
  { key: 'coolsenseKg', color: CHART_1, label: t('analytics.carbon.coolsense') },
  { key: 'savedKg', color: CHART_4, label: t('analytics.carbon.difference') },
]);

function formatHour(row: Record<string, unknown>): string {
  return `${row.hour_index}h`;
}

function itemLabel(item: UsageBreakdownItem): string {
  return item.kind === 'floor' ? floorName(item.id) : roomName(item.id);
}

const kwhItems = computed(() => breakdown.value.map((b) => ({ id: b.id, label: itemLabel(b), value: b.actualKwh })));
const savedItems = computed(() => breakdown.value.map((b) => ({ id: b.id, label: itemLabel(b), value: b.savedKg })));
const breakdownTitleKey = computed(() =>
  selectedFloor.value === 'all' ? 'analytics.breakdown.byFloor' : 'analytics.breakdown.byRoom',
);

function kg(value: number | undefined): string {
  return value === undefined ? '-' : formatNumber(value, 1);
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
      <div class="flex flex-wrap gap-2 bg-surface-container-low rounded-lg p-1 w-fit max-w-full">
        <button
          v-for="tab in TAB_IDS"
          :key="tab"
          type="button"
          class="px-4 min-h-11 text-label-md rounded-md transition-colors"
          :aria-pressed="activeTab === tab"
          :class="activeTab === tab ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'"
          @click="activeTab = tab"
        >
          {{ t(`analytics.tab.${tab}`) }}
        </button>
      </div>

      <div class="flex flex-wrap gap-2 bg-surface-container-low rounded-lg p-1 w-fit max-w-full">
        <button
          v-for="range in RANGE_IDS"
          :key="range"
          type="button"
          class="px-4 min-h-11 text-label-md rounded-md transition-colors"
          :aria-pressed="dateRange === range"
          :class="dateRange === range ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'"
          @click="dateRange = range"
        >
          {{ t(`analytics.range.${range}`) }}
        </button>
      </div>
    </div>

    <template v-if="!isCarbon">
      <Card :title="t(titleKey)">
        <template #actions>
          <span class="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
            <span
              class="inline-block w-2.5 h-2.5 rounded-sm"
              :style="{ backgroundColor: TAB_CONFIG[historyTab].color }"
            />
            {{ t('analytics.legendRecorded') }}
          </span>
        </template>

        <p class="text-body-md text-on-surface-variant -mt-4 mb-4">
          {{ t(subtitleKey) }}
        </p>

        <p
          v-if="errorMessage"
          class="text-label-sm text-error mb-4"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <p
          v-else-if="!loading && !hasData"
          class="text-label-sm text-on-surface-variant mb-4"
        >
          {{ t('analytics.noData') }}
        </p>

        <div
          v-if="loading && points.length === 0"
          class="h-60 rounded-lg bg-surface-container-low animate-pulse"
        />
        <LineAreaChart
          v-else
          :data="points"
          mode="line"
          x-key="bucket"
          :series="chartSeries"
          :format-x="formatLabel"
          :unit="TAB_CONFIG[historyTab].unit"
          :aria-label="`${t(titleKey)}, ${t(`analytics.range.${dateRange}`)}`"
          :integer-y="historyTab === 'people'"
        />
      </Card>

      <Card
        v-if="isDemoMode && activeTab === 'electric' && breakdown.length > 0"
        :title="t('analytics.breakdown.kwhTitle')"
      >
        <p class="text-body-md text-on-surface-variant -mt-4 mb-4">
          {{ t(breakdownTitleKey) }}
        </p>
        <RankedBarList
          :items="kwhItems"
          unit="kWh"
          :color="CHART_1"
        />
      </Card>
    </template>

    <template v-else>
      <p
        v-if="errorMessage"
        class="text-label-sm text-error"
        role="alert"
      >
        {{ errorMessage }}
      </p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          :label="t('analytics.carbon.emitted')"
          :value="loading && !carbonTotals ? '...' : `${kg(carbonTotals?.actualKg)} kg`"
          icon="co2"
          value-size="headline"
        />
        <StatCard
          :label="t('analytics.carbon.avoided')"
          :value="loading && !carbonTotals ? '...' : `${kg(carbonTotals?.savedKg)} kg`"
          icon="eco"
          value-size="headline"
        />
        <StatCard
          :label="t('analytics.carbon.reduction')"
          :value="loading && !carbonTotals ? '...' : `${formatNumber(carbonTotals?.pctReduction ?? 0, 1)}%`"
          icon="trending_down"
          value-size="headline"
        />
      </div>

      <p
        v-if="!loading && !errorMessage && !hasCarbonData"
        class="text-label-sm text-on-surface-variant"
      >
        {{ t('analytics.carbon.noBaseline') }}
      </p>

      <Card :title="t('analytics.carbon.usageTitle')">
        <p class="text-body-md text-on-surface-variant -mt-4 mb-4">
          {{ t('analytics.carbon.usageSubtitle') }}
        </p>
        <div
          v-if="loading && !carbon"
          class="h-60 rounded-lg bg-surface-container-low animate-pulse"
        />
        <LineAreaChart
          v-else
          :data="carbon?.points ?? []"
          mode="bar"
          x-key="bucket"
          :series="carbonSeries"
          :format-x="formatLabel"
          unit=" kg"
          :aria-label="t('analytics.carbon.usageTitle')"
        />
      </Card>

      <Card :title="t('analytics.carbon.reductionTitle')">
        <p class="text-body-md text-on-surface-variant -mt-4 mb-4">
          {{ t('analytics.carbon.reductionSubtitle') }}
        </p>
        <div
          v-if="loading && !carbon"
          class="h-60 rounded-lg bg-surface-container-low animate-pulse"
        />
        <LineAreaChart
          v-else
          :data="carbon?.points ?? []"
          mode="area"
          x-key="bucket"
          :series="savedSeries"
          :format-x="formatLabel"
          unit=" kg"
          :aria-label="t('analytics.carbon.reductionTitle')"
        />
      </Card>

      <Card
        v-if="isDemoMode && breakdown.length > 0"
        :title="t('analytics.breakdown.co2Title')"
      >
        <p class="text-body-md text-on-surface-variant -mt-4 mb-4">
          {{ t(breakdownTitleKey) }}
        </p>
        <RankedBarList
          :items="savedItems"
          unit="kg CO2"
          :color="CHART_4"
        />
      </Card>

      <Card :title="t('analytics.carbon.simTitle')">
        <p class="text-body-md text-on-surface-variant -mt-4 mb-4">
          {{ t('analytics.carbon.simSubtitle') }}
        </p>
        <p
          v-if="!loading && !simCarbon"
          class="text-label-sm text-on-surface-variant"
        >
          {{ t('analytics.carbon.simEmpty') }}
        </p>
        <LineAreaChart
          v-else-if="simCarbon"
          :data="simCarbon.points"
          mode="line"
          x-key="hour_index"
          :series="simSeries"
          :format-x="formatHour"
          unit=" kg"
          :aria-label="t('analytics.carbon.simTitle')"
        />
      </Card>

      <p class="text-label-sm text-on-surface-variant">
        {{ t('analytics.carbon.footnote', { excluded: String(carbonTotals?.rowsExcluded ?? 0) }) }}
      </p>
    </template>
  </div>
</template>
