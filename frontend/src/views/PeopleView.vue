<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Card from '../components/ui/Card.vue';
import LineAreaChart from '../components/ui/LineAreaChart.vue';
import StatCard from '../components/ui/StatCard.vue';
import { useAcCalculation } from '../composables/useAcCalculation';
import { useOccupancy } from '../composables/useOccupancy';
import { usePeakOccupancy } from '../composables/usePeakOccupancy';
import { floorName, roomName, unitName, useSelectedFloor } from '../composables/useSelectedFloor';
import AcUnitCard from '../components/ui/AcUnitCard.vue';
import FloorStats from '../components/rooms/FloorStats.vue';
import { isDemoMode } from '../lib/mock/mode';
import { mockFloorTiles } from '../lib/mock/api';
import { getPeopleHistory, TODAY_BUCKET_MINUTES } from '../lib/api';
import { CHART_1 } from '../lib/chartColors';
import { formatNumber, formatTime } from '../lib/format';
import { t } from '../lib/i18n';

const { latestReading } = useOccupancy();
const { latestCalculation } = useAcCalculation();
const { peak } = usePeakOccupancy();
const router = useRouter();

const { selectedFloor, ALL_FLOORS } = useSelectedFloor();

// Tapping a unit tile opens that unit in the Device page's edit form.
function openDevice(unitId: string) {
  router.push({ path: '/device', query: { unit: unitId } });
}

// Demo mode: floors with their rooms and a tile for every AC unit.
// Recomputed whenever a new live reading arrives.
const floorTiles = computed(() => {
  void latestReading.value;
  return isDemoMode ? mockFloorTiles(selectedFloor.value) : [];
});
const allFloors = computed(() => selectedFloor.value === ALL_FLOORS);

// With all floors selected each floor card can be opened or closed.
const openFloors = ref<string[]>([]);
function toggleFloor(id: string) {
  openFloors.value = openFloors.value.includes(id) ? openFloors.value.filter((f) => f !== id) : [...openFloors.value, id];
}
// Start with every floor open so the AC units are visible straight away.
onMounted(() => {
  openFloors.value = floorTiles.value.map((f) => f.floor.id);
});
const everyFloorOpen = computed(() => floorTiles.value.every((f) => openFloors.value.includes(f.floor.id)));
function toggleAll() {
  openFloors.value = everyFloorOpen.value ? [] : floorTiles.value.map((f) => f.floor.id);
}

const peakOccupancyDisplay = computed(() => (peak.value ? formatNumber(peak.value.people_count, 0) : '—'));
const peakAtDisplay = computed(() => {
  if (!peak.value?.captured_at) return t('people.peakAtNone');
  return t('people.peakAt', { time: formatTime(peak.value.captured_at) });
});

const acTempDisplay = computed(() =>
  latestCalculation.value ? `${formatNumber(latestCalculation.value.temperature_c, 1)}°C` : '—',
);
const acModeDisplay = computed(() => (latestCalculation.value ? t(`people.acMode.${latestCalculation.value.ac_mode}`) : ''));

const currentOccupancyDisplay = computed(() =>
  latestReading.value ? formatNumber(latestReading.value.people_count, 0) : '—',
);

// Occupancy chart: today's readings, collapsed from 1-minute buckets into
// hourly peaks so the chart stays readable. The range buttons slice that list.
const activityRange = ref<'12h' | 'today'>('today');
const hourly = ref<{ hour: number; people: number }[]>([]);
const historyLoading = ref(true);
const historyError = ref(false);

async function loadHistory() {
  try {
    const points = await getPeopleHistory('today', selectedFloor.value);
    const perHour = 60 / TODAY_BUCKET_MINUTES;
    const currentHour = new Date().getHours();
    const rows: { hour: number; people: number }[] = [];
    for (let h = 0; h <= currentHour; h++) {
      const slice = points.slice(h * perHour, (h + 1) * perHour);
      rows.push({ hour: h, people: Math.max(0, ...slice.map((p) => p.value)) });
    }
    hourly.value = rows;
    historyError.value = false;
  } catch {
    historyError.value = true;
  } finally {
    historyLoading.value = false;
  }
}

const chartRows = computed(() => (activityRange.value === '12h' ? hourly.value.slice(-12) : hourly.value));
const hasReadings = computed(() => hourly.value.some((r) => r.people > 0));
const chartSeries = computed(() => [{ key: 'people', color: CHART_1, label: t('people.peopleSeries') }]);

function formatHour(row: Record<string, unknown>): string {
  return `${String(row.hour).padStart(2, '0')}:00`;
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;
// The occupancy chart is only for the single real room. Demo mode is floor by
// floor, where the room headers already show people per room.
onMounted(() => {
  if (isDemoMode) return;
  loadHistory();
  refreshTimer = setInterval(loadHistory, 60000);
});
onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
watch(selectedFloor, () => {
  if (isDemoMode) return;
  historyLoading.value = true;
  loadHistory();
});
// A new reading arriving over Realtime should show up in the chart too.
watch(latestReading, () => {
  if (!isDemoMode && !historyLoading.value) loadHistory();
});
</script>

<template>
  <template v-if="isDemoMode">
    <!-- One floor: summary strip, then its rooms with their units -->
    <template v-if="!allFloors">
      <section
        v-for="entry in floorTiles"
        :key="entry.floor.id"
        class="flex flex-col gap-6"
        :aria-label="floorName(entry.floor.id)"
      >
        <FloorStats
          :people="entry.people"
          :units-running="entry.unitsRunning"
          :unit-count="entry.unitCount"
          :saved-kg="entry.savedKg"
          :open-alerts="entry.openAlerts"
        />
        <p
          v-if="entry.rooms.length === 0"
          class="text-body-md text-on-surface-variant"
        >
          {{ t('floors.empty') }}
        </p>
        <section
          v-for="group in entry.rooms"
          :key="group.room.id"
          class="flex flex-col gap-3"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 class="text-headline-md text-on-surface">
              {{ roomName(group.room.id) }}
            </h3>
            <p class="text-label-md text-on-surface-variant">
              {{ t('people.tile.roomSummary', { people: formatNumber(group.people, 0), kg: formatNumber(group.savedKg, 1) }) }}
            </p>
          </div>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            <AcUnitCard
              v-for="tile in group.tiles"
              :key="tile.unit.id"
              :name="unitName(tile.unit)"
              :severity="tile.severity"
              :setpoint-c="tile.setpointC"
              :saved-kg="tile.savedKg"
              :saved-pct="tile.savedPct"
              :people="group.people"
              @select="openDevice(tile.unit.id)"
            />
          </div>
        </section>
      </section>
    </template>

    <!-- All floors: one collapsible card per floor -->
    <template v-else>
      <!-- The button lives in the page header so it does not add a row here -->
      <Teleport
        defer
        to="#header-actions"
      >
        <button
          type="button"
          class="px-4 min-h-11 text-label-md rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-colors whitespace-nowrap hidden md:inline-flex items-center"
          @click="toggleAll"
        >
          {{ everyFloorOpen ? t('floors.collapseAll') : t('floors.expandAll') }}
        </button>
        <button
          type="button"
          class="md:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface"
          :aria-label="everyFloorOpen ? t('floors.collapseAll') : t('floors.expandAll')"
          @click="toggleAll"
        >
          <span
            class="material-symbols-outlined"
            aria-hidden="true"
          >{{ everyFloorOpen ? 'unfold_less' : 'unfold_more' }}</span>
        </button>
      </Teleport>
      <section
        v-for="entry in floorTiles"
        :key="entry.floor.id"
        class="bg-surface-container-lowest rounded-xl border border-slate-200 shadow-card"
      >
        <div class="p-4 md:p-6 flex flex-col gap-4">
          <button
            type="button"
            class="w-full text-left flex items-center justify-between gap-3 min-h-11"
            :aria-expanded="openFloors.includes(entry.floor.id)"
            @click="toggleFloor(entry.floor.id)"
          >
            <span class="min-w-0">
              <span class="block text-headline-md text-on-surface">{{ floorName(entry.floor.id) }}</span>
              <span class="block text-label-md text-on-surface-variant truncate">
                {{ entry.rooms.map((r) => roomName(r.room.id)).join(', ') || t('floors.empty') }}
              </span>
            </span>
            <span
              class="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform"
              :class="openFloors.includes(entry.floor.id) ? 'rotate-180' : ''"
              aria-hidden="true"
            >expand_more</span>
          </button>
          <FloorStats
            :people="entry.people"
            :units-running="entry.unitsRunning"
            :unit-count="entry.unitCount"
            :saved-kg="entry.savedKg"
            :open-alerts="entry.openAlerts"
          />
        </div>
        <div
          v-if="openFloors.includes(entry.floor.id)"
          class="px-4 md:px-6 pb-4 md:pb-6 flex flex-col gap-6 border-t border-slate-200 pt-4"
        >
          <section
            v-for="group in entry.rooms"
            :key="group.room.id"
            class="flex flex-col gap-3"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 class="text-label-md text-on-surface">
                {{ roomName(group.room.id) }}
              </h3>
              <p class="text-label-sm text-on-surface-variant">
                {{ t('people.tile.roomSummary', { people: formatNumber(group.people, 0), kg: formatNumber(group.savedKg, 1) }) }}
              </p>
            </div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              <AcUnitCard
                v-for="tile in group.tiles"
                :key="tile.unit.id"
                :name="unitName(tile.unit)"
                :severity="tile.severity"
                :setpoint-c="tile.setpointC"
                :saved-kg="tile.savedKg"
                :saved-pct="tile.savedPct"
                :people="group.people"
                @select="openDevice(tile.unit.id)"
              />
            </div>
          </section>
        </div>
      </section>
    </template>
  </template>

  <div
    v-else
    class="grid grid-cols-1 lg:grid-cols-3 gap-6"
  >
    <StatCard
      :label="t('people.currentOccupancy')"
      :value="historyLoading ? '' : currentOccupancyDisplay"
      icon="group"
    >
      <div
        v-if="historyLoading"
        class="h-8 w-24 rounded bg-surface-container animate-pulse"
        aria-hidden="true"
      />
    </StatCard>

    <StatCard
      :label="t('people.peakOccupancyToday')"
      :value="historyLoading ? '' : peakOccupancyDisplay"
      icon="show_chart"
    >
      <div
        v-if="historyLoading"
        class="h-4 w-32 rounded bg-surface-container animate-pulse"
        aria-hidden="true"
      />
      <span
        v-else
        class="text-label-sm text-on-surface-variant"
      >{{ peakAtDisplay }}</span>
    </StatCard>

    <StatCard
      :label="t('people.acSetting')"
      :value="historyLoading ? '' : acTempDisplay"
      icon="thermostat"
    >
      <div
        v-if="historyLoading"
        class="h-4 w-32 rounded bg-surface-container animate-pulse"
        aria-hidden="true"
      />
      <template v-else>
        <span class="text-label-sm text-on-surface-variant">{{ acModeDisplay }}</span>
        <span
          v-if="latestCalculation?.capacity_constrained"
          class="ml-2 inline-flex items-center gap-1 text-label-sm text-error"
        >
          <span
            class="material-symbols-outlined text-[16px]"
            aria-hidden="true"
          >warning</span>
          {{ t('people.acUndersized') }}
        </span>
      </template>
    </StatCard>
  </div>

  <Card
    v-if="!isDemoMode"
    :title="t('people.activityTrend')"
  >
    <template #actions>
      <button
        type="button"
        class="px-3 py-1.5 text-label-md rounded-lg transition-colors"
        :class="activityRange === '12h' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'"
        :aria-pressed="activityRange === '12h'"
        @click="activityRange = '12h'"
      >
        {{ t('people.range12h') }}
      </button>
      <button
        type="button"
        class="px-3 py-1.5 text-label-md rounded-lg transition-colors"
        :class="activityRange === 'today' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'"
        :aria-pressed="activityRange === 'today'"
        @click="activityRange = 'today'"
      >
        {{ t('people.rangeToday') }}
      </button>
    </template>

    <div
      v-if="historyLoading"
      class="h-60 rounded-lg bg-surface-container animate-pulse"
      aria-hidden="true"
    />
    <div
      v-else-if="historyError"
      class="flex flex-wrap items-center gap-3 py-8 justify-center"
      role="alert"
    >
      <p class="text-label-md text-error">
        {{ t('people.historyError') }}
      </p>
      <button
        type="button"
        class="px-3 py-1.5 text-label-md rounded-lg border border-outline text-on-surface hover:bg-surface-container-low transition-colors"
        @click="loadHistory"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <p
      v-else-if="!hasReadings"
      class="text-body-md text-on-surface-variant text-center py-12"
    >
      {{ t('people.historyEmpty') }}
    </p>
    <LineAreaChart
      v-else
      :data="chartRows"
      mode="area"
      integer-y
      x-key="hour"
      :series="chartSeries"
      :format-x="formatHour"
      :aria-label="t('people.activityTrend')"
    />
  </Card>
</template>
