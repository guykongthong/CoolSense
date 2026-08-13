<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import Card from '../components/ui/Card.vue';
import LineAreaChart from '../components/ui/LineAreaChart.vue';
import { t } from '../lib/i18n';
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

type Tab = 'people' | 'electric' | 'temperature';

const TAB_IDS: Tab[] = ['people', 'electric', 'temperature'];
const RANGE_IDS: DateRange[] = ['today', '7d', '30d'];

const TAB_CONFIG: Record<Tab, { fetcher: (range: DateRange) => Promise<HistoryPoint[]>; color: string; unit: string }> = {
  people: { fetcher: getPeopleHistory, color: '#eb6834', unit: '' },
  electric: { fetcher: getElectricHistory, color: '#2a78d6', unit: ' kW' },
  temperature: { fetcher: getTemperatureHistory, color: '#1baf7a', unit: '°C' },
};

const activeTab = ref<Tab>('people');
const dateRange = ref<DateRange>('today');
const points = ref<HistoryPoint[]>([]);
const loading = ref(false);
const errorMessage = ref('');

async function load(showProgress = true) {
  loading.value = true;
  errorMessage.value = '';
  const fetchPoints = () => TAB_CONFIG[activeTab.value].fetcher(dateRange.value);
  try {
    points.value = showProgress ? await withProgress(fetchPoints) : await fetchPoints();
  } catch {
    errorMessage.value = t('analytics.errorFallback');
    points.value = [];
  } finally {
    loading.value = false;
  }
}

watch([activeTab, dateRange], () => load(), { immediate: true });

// These are aggregated/bucketed queries, not a single row — Realtime's
// postgres_changes can't target "re-run this aggregation," so a light
// poll is the practical way to keep the chart current as new readings
// (camera detections, /calculation runs) come in while the page is open.
// Runs silently (showProgress=false) — a top-bar flash every 30s while the
// page just sits open would be noisy, not informative.
const REFRESH_INTERVAL_MS = 30_000;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  refreshInterval = setInterval(() => load(false), REFRESH_INTERVAL_MS);
});

onUnmounted(() => {
  if (refreshInterval !== null) clearInterval(refreshInterval);
});

const chartSeries = computed(() => [
  { key: 'value', color: TAB_CONFIG[activeTab.value].color, label: t('analytics.legendRecorded') },
]);

function formatLabel(row: Record<string, unknown>): string {
  const bucket = Number(row.bucket);
  if (dateRange.value === 'today') {
    const totalMinutes = bucket * TODAY_BUCKET_MINUTES;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${hour}:${String(minute).padStart(2, '0')}`;
  }
  const date = new Date(rangeStart(dateRange.value).getTime() + bucket * 24 * 60 * 60 * 1000);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const hasData = computed(() => points.value.some((p) => p.value > 0));

const titleKey = computed(() => `analytics.${activeTab.value}Title`);
const subtitleKey = computed(() => `analytics.${activeTab.value}Subtitle`);
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
      <div class="flex gap-2 bg-surface-container-low rounded-lg p-1 w-fit">
        <button
          v-for="tab in TAB_IDS"
          :key="tab"
          type="button"
          class="px-4 py-2 text-label-md rounded-md transition-colors"
          :class="activeTab === tab ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'"
          @click="activeTab = tab"
        >
          {{ t(`analytics.tab.${tab}`) }}
        </button>
      </div>

      <div class="flex gap-2 bg-surface-container-low rounded-lg p-1 w-fit">
        <button
          v-for="range in RANGE_IDS"
          :key="range"
          type="button"
          class="px-4 py-2 text-label-md rounded-md transition-colors"
          :class="dateRange === range ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'"
          @click="dateRange = range"
        >
          {{ t(`analytics.range.${range}`) }}
        </button>
      </div>
    </div>

    <Card :title="t(titleKey)">
      <template #actions>
        <span class="flex items-center gap-1.5 text-label-sm text-on-surface-variant">
          <span
            class="inline-block w-2.5 h-2.5 rounded-sm"
            :style="{ backgroundColor: TAB_CONFIG[activeTab].color }"
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
      >
        {{ errorMessage }}
      </p>
      <p
        v-else-if="!loading && !hasData"
        class="text-label-sm text-on-surface-variant mb-4"
      >
        {{ t('analytics.noData') }}
      </p>

      <LineAreaChart
        :data="points"
        mode="line"
        x-key="bucket"
        :series="chartSeries"
        :format-x="formatLabel"
      />
    </Card>
  </div>
</template>
