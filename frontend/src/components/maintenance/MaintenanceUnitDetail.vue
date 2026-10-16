<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Card from '../ui/Card.vue';
import LineAreaChart from '../ui/LineAreaChart.vue';
import { CHART_1, CHART_2 } from '../../lib/chartColors';
import { formatDate, formatNumber, formatShortDate } from '../../lib/format';
import { t } from '../../lib/i18n';
import {
  getMaintenanceTrend,
  type AlertStatus,
  type MaintenanceAlert,
  type MaintenanceEvaluation,
  type TrendPoint,
} from '../../lib/maintenanceApi';
import { needsAttention, statusKey, STATUS_STYLE } from './status';

type Filter = 'all' | AlertStatus;
const FILTERS: Filter[] = ['all', 'open', 'acknowledged', 'dismissed', 'resolved'];
const TREND_DAYS = 30;

const props = defineProps<{
  unitId: string;
  // Floor, room and unit name, empty in real mode.
  path: string[];
  title: string;
  evaluation: MaintenanceEvaluation;
  alerts: MaintenanceAlert[];
  busy: boolean;
  evaluating: boolean;
  canClose: boolean;
  trendUnitId?: string;
}>();

const emit = defineEmits<{
  close: [];
  evaluate: [];
  clean: [];
  generate: [];
  respond: [alert: MaintenanceAlert, status: 'acknowledged' | 'dismissed', note?: string];
}>();

const key = computed(() => statusKey(props.evaluation));
const style = computed(() => STATUS_STYLE[key.value]);
const hasHistory = computed(() => props.evaluation.readings_count > 0);
const confirming = ref(false);
const filter = ref<Filter>('all');
const notes = ref<Record<string, string>>({});

watch(
  () => props.unitId,
  () => {
    confirming.value = false;
    filter.value = 'all';
  },
);

const detail = computed(() => {
  const e = props.evaluation;
  if (e.status === 'insufficient_data') return t('maintenance.hero.insufficient');
  if (e.status === 'degraded') return t('maintenance.hero.degraded', { pct: formatNumber(e.excess_pct ?? 0, 0) });
  return t('maintenance.hero.healthy');
});
const cleanedText = computed(() =>
  props.evaluation.last_serviced_at
    ? t('maintenance.lastServiced', { date: formatDate(props.evaluation.last_serviced_at) })
    : t('maintenance.neverServiced'),
);

const shownAlerts = computed(() => (filter.value === 'all' ? props.alerts : props.alerts.filter((a) => a.status === filter.value)));
const isActive = (a: MaintenanceAlert) => a.status === 'open' || a.status === 'acknowledged';

function alertSentence(alert: MaintenanceAlert): string {
  const pct = formatNumber(alert.excess_pct, 0);
  const b = alert.worst_bucket;
  if (!b) return t('maintenance.alerts.sentenceGeneral', { pct, n: alert.buckets_evaluated });
  return t('maintenance.alerts.sentence', {
    pct: formatNumber(b.excess_pct, 0),
    setpoint: formatNumber(b.setpoint_c, 0),
    min: formatNumber(b.outside_temp_min_c, 0),
    max: formatNumber(b.outside_temp_max_c, 0),
  });
}

function respond(alert: MaintenanceAlert, status: 'acknowledged' | 'dismissed') {
  emit('respond', alert, status, notes.value[alert.id]);
}

// ---- Trend for this unit ----
const trend = ref<TrendPoint[]>([]);
async function loadTrend() {
  try {
    trend.value = (await getMaintenanceTrend(TREND_DAYS, props.trendUnitId)).points;
  } catch (e) {
    console.error(e);
    trend.value = [];
  }
}
watch(() => [props.unitId, props.evaluation], loadTrend, { immediate: true });

const trendRows = computed(() => trend.value.map((p) => ({ ...p })));
const ratioRows = computed(() => trend.value.filter((p) => p.ratio !== null).map((p) => ({ ...p })));
const trendSeries = computed(() => [
  { key: 'actual_kwh', color: CHART_1, label: t('maintenance.trend.actual') },
  { key: 'expected_baseline_kwh', color: CHART_2, label: t('maintenance.trend.expected') },
]);
const ratioSeries = computed(() => [{ key: 'ratio', color: CHART_1, label: t('maintenance.ratio.series') }]);
const ratioLines = computed(() => [
  { value: 1.1, label: t('maintenance.ratio.watch'), color: '#8a5100' },
  { value: 1.2, label: t('maintenance.ratio.warning'), color: '#c2410c' },
  { value: 1.35, label: t('maintenance.ratio.critical'), color: '#ba1a1a' },
]);
const formatDay = (row: Record<string, unknown>) => formatShortDate(`${row.date}T12:00:00`);

const buttonBase = 'px-4 min-h-11 text-label-md rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
const primaryButton = `${buttonBase} bg-primary text-on-primary hover:bg-primary-container`;
const outlineButton = `${buttonBase} border border-outline text-on-surface hover:bg-surface-container-low`;
</script>

<template>
  <section
    class="flex flex-col gap-6 rounded-xl border-2 border-primary p-4 md:p-6 bg-surface-container-low"
    aria-labelledby="maintenance-detail-title"
  >
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-label-md text-on-surface-variant">
          {{ t('maintenance.detail.label') }}
        </p>
        <h2
          id="maintenance-detail-title"
          class="text-headline-md text-on-surface break-words focus:outline-none"
          tabindex="-1"
        >
          {{ path.length ? t('maintenance.detail.title', { name: path.join(' > ') }) : title }}
        </h2>
      </div>
      <button
        v-if="canClose"
        type="button"
        :class="outlineButton"
        @click="emit('close')"
      >
        {{ t('maintenance.detail.back') }}
      </button>
    </header>

    <Card>
      <div class="flex flex-col md:flex-row md:items-center gap-6">
        <div
          class="flex items-center gap-4 flex-1"
          role="status"
        >
          <div
            class="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
            :class="style.chip"
          >
            <span
              class="material-symbols-outlined text-[32px]"
              aria-hidden="true"
            >{{ style.icon }}</span>
          </div>
          <div>
            <h3 class="text-headline-md text-on-surface">
              {{ t(`maintenance.status.${key}`) }}
            </h3>
            <p class="text-body-md text-on-surface-variant">
              {{ detail }}
            </p>
            <p class="text-body-md text-on-surface font-medium mt-1">
              {{ t(`maintenance.meaning.${key}`) }}
            </p>
            <p
              v-if="evaluation.status === 'insufficient_data' && hasHistory"
              class="text-label-md text-on-surface-variant"
            >
              {{ t('maintenance.hero.insufficientProgress', { days: Math.min(14, evaluation.baseline_days) }) }}
            </p>
            <p class="text-label-md text-on-surface-variant mt-1">
              {{ cleanedText }}
            </p>
          </div>
        </div>
        <div
          v-if="evaluation.status !== 'insufficient_data'"
          class="md:text-right"
        >
          <div class="text-label-md text-on-surface-variant">
            {{ t('maintenance.excessLabel') }}
          </div>
          <div class="text-display-lg text-on-surface">
            {{ formatNumber(evaluation.excess_pct ?? 0, 0) }}%
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-dashed border-slate-200">
        <button
          type="button"
          :class="outlineButton"
          :disabled="busy"
          @click="emit('evaluate')"
        >
          {{ evaluating ? t('maintenance.evaluating') : t('maintenance.evaluate') }}
        </button>
        <button
          v-if="!confirming && (needsAttention(evaluation) || !path.length)"
          type="button"
          :class="primaryButton"
          :disabled="busy"
          @click="confirming = true"
        >
          {{ t('maintenance.markCleaned') }}
        </button>
        <div
          v-else-if="confirming"
          class="flex flex-wrap items-center gap-3"
          role="group"
        >
          <p class="text-label-md text-on-surface-variant max-w-md">
            {{ path.length ? t('maintenance.confirmPromptUnit') : t('maintenance.confirmPrompt') }}
          </p>
          <button
            type="button"
            :class="primaryButton"
            :disabled="busy"
            @click="confirming = false; emit('clean')"
          >
            {{ t('maintenance.confirmCleaned') }}
          </button>
          <button
            type="button"
            :class="outlineButton"
            @click="confirming = false"
          >
            {{ t('maintenance.cancel') }}
          </button>
        </div>
      </div>
    </Card>

    <Card
      v-if="evaluation.status === 'insufficient_data'"
      :title="t('maintenance.empty.title')"
    >
      <p class="text-body-md text-on-surface-variant mb-4">
        {{ hasHistory ? t('maintenance.empty.shortBody') : t('maintenance.empty.body') }}
      </p>
      <button
        type="button"
        :class="primaryButton"
        :disabled="busy"
        @click="emit('generate')"
      >
        {{ t('maintenance.generateDemo') }}
      </button>
    </Card>

    <Card :title="t('maintenance.alerts.title')">
      <div
        class="flex flex-wrap gap-2 mb-4"
        role="group"
        :aria-label="t('maintenance.filter.label')"
      >
        <button
          v-for="f in FILTERS"
          :key="f"
          type="button"
          class="px-3 min-h-11 min-w-11 md:min-h-9 rounded-full text-label-md transition-colors"
          :class="filter === f ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'"
          :aria-pressed="filter === f"
          @click="filter = f"
        >
          {{ t(`maintenance.filter.${f}`) }}
        </button>
      </div>
      <p
        v-if="shownAlerts.length === 0"
        class="text-body-md text-on-surface-variant"
      >
        {{ t('maintenance.alerts.none') }}
      </p>
      <ul
        v-else
        class="flex flex-col divide-y divide-slate-200"
      >
        <li
          v-for="alert in shownAlerts"
          :key="alert.id"
          class="py-4 first:pt-0 last:pb-0 flex flex-col gap-3"
        >
          <p
            v-if="path.length"
            class="text-label-md text-on-surface"
          >
            {{ path.join(' > ') }}
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-label-md"
              :class="STATUS_STYLE[alert.severity].chip"
            >
              <span
                class="material-symbols-outlined text-[18px]"
                aria-hidden="true"
              >{{ STATUS_STYLE[alert.severity].icon }}</span>
              {{ t(`maintenance.status.${alert.severity}`) }}
            </span>
            <span class="px-3 py-1 rounded-full border border-outline-variant text-label-md text-on-surface-variant">
              {{ t(`maintenance.alertStatus.${alert.status}`) }}
            </span>
            <span class="text-label-md text-on-surface-variant">
              {{ t('maintenance.alerts.detected', { date: formatDate(alert.created_at) }) }}
            </span>
          </div>
          <p class="text-body-md text-on-surface">
            {{ alertSentence(alert) }}
          </p>
          <p class="text-label-md text-on-surface-variant">
            {{ t(`maintenance.meaning.${alert.severity}`) }}
          </p>
          <p
            v-if="alert.note"
            class="text-label-md text-on-surface-variant"
          >
            {{ t('maintenance.alerts.noteSaved', { note: alert.note }) }}
          </p>

          <div
            v-if="isActive(alert)"
            class="flex flex-wrap items-end gap-3"
          >
            <label class="flex flex-col gap-1 flex-1 min-w-48">
              <span class="text-label-md text-on-surface-variant">{{ t('maintenance.alerts.note') }}</span>
              <input
                v-model="notes[alert.id]"
                type="text"
                maxlength="200"
                class="min-h-11 px-3 rounded-lg border border-outline-variant bg-surface-container-lowest text-body-md focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
              >
            </label>
            <button
              v-if="alert.status === 'open'"
              type="button"
              :class="outlineButton"
              @click="respond(alert, 'acknowledged')"
            >
              {{ t('maintenance.alerts.acknowledge') }}
            </button>
            <button
              type="button"
              :class="outlineButton"
              @click="respond(alert, 'dismissed')"
            >
              {{ t('maintenance.alerts.dismiss') }}
            </button>
          </div>
        </li>
      </ul>
    </Card>

    <Card :title="t('maintenance.trend.title')">
      <LineAreaChart
        v-if="trendRows.length > 1"
        :data="trendRows"
        :series="trendSeries"
        x-key="date"
        :format-x="formatDay"
        unit=" kWh"
        :aria-label="t('maintenance.trend.aria')"
      />
      <p
        v-else
        class="text-body-md text-on-surface-variant"
      >
        {{ t('maintenance.trend.empty') }}
      </p>
    </Card>

    <Card
      v-if="ratioRows.length > 1"
      :title="t('maintenance.ratio.title')"
    >
      <LineAreaChart
        :data="ratioRows"
        :series="ratioSeries"
        x-key="date"
        :format-x="formatDay"
        :y-min="0.8"
        :reference-lines="ratioLines"
        :aria-label="t('maintenance.ratio.aria')"
      />
    </Card>
  </section>
</template>
