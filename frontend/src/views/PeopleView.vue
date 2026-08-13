<script setup lang="ts">
import { computed, ref } from 'vue';
import Card from '../components/ui/Card.vue';
import StatCard from '../components/ui/StatCard.vue';
import { useAcCalculation } from '../composables/useAcCalculation';
import { useCameraOccupancy } from '../composables/useCameraOccupancy';
import { useOccupancy } from '../composables/useOccupancy';
import { usePeakOccupancy } from '../composables/usePeakOccupancy';
import { t } from '../lib/i18n';

const { videoRef, isMonitoring, isAnalyzing, latestCount, error, start, stop } = useCameraOccupancy();
const { latestReading } = useOccupancy();
const { latestCalculation } = useAcCalculation();
const { peak } = usePeakOccupancy();

const peakOccupancyDisplay = computed(() => (peak.value ? peak.value.people_count.toLocaleString() : '—'));
const peakAtDisplay = computed(() => {
  if (!peak.value?.captured_at) return t('people.peakAtNone');
  const time = new Date(peak.value.captured_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return t('people.peakAt', { time });
});

const acTempDisplay = computed(() => (latestCalculation.value ? `${latestCalculation.value.temperature_c}°C` : '—'));
const acModeDisplay = computed(() => (latestCalculation.value ? t(`people.acMode.${latestCalculation.value.ac_mode}`) : ''));

const currentOccupancyDisplay = computed(() => {
  // While the camera is monitoring, prefer its direct Gemini response over the
  // DB/Realtime round-trip — it's the same value a moment sooner, and immune to
  // other sources (manual input, mock data) overwriting it via Realtime INSERT.
  if (isMonitoring.value && latestCount.value !== null) {
    return latestCount.value.toLocaleString();
  }
  return latestReading.value ? latestReading.value.people_count.toLocaleString() : '—';
});

// Static placeholder content matching the design comp — this page isn't
// wired to occupancy_readings yet (multi-zone breakdown has no equivalent
// in our single-room data model). Revisit once the room-input page (page 2)
// and real per-zone/aggregate data are defined.
const activityBars = [
  { heightPct: 20 },
  { heightPct: 30 },
  { heightPct: 25 },
  { heightPct: 40 },
  { heightPct: 55 },
  { heightPct: 60 },
  { heightPct: 45 },
  { heightPct: 30 },
  { heightPct: 20 },
  { heightPct: 80, now: true },
];

const zones = computed(() => [
  {
    icon: 'meeting_room',
    name: t('rooms.mainHall'),
    capacity: 500,
    count: 412,
    status: t('people.statusHighUsage'),
    statusClass: 'text-error',
    countClass: 'text-primary-container',
    iconBgClass: 'bg-secondary-fixed',
    iconColorClass: 'text-primary-container',
  },
  {
    icon: 'chair_alt',
    name: t('rooms.conferenceRoomA'),
    capacity: 50,
    count: 24,
    status: t('people.statusOptimal'),
    statusClass: 'text-primary-container',
    countClass: 'text-on-surface',
    iconBgClass: 'bg-surface-container-high',
    iconColorClass: 'text-on-surface-variant',
  },
  {
    icon: 'desk',
    name: t('rooms.openOfficeNorth'),
    capacity: 120,
    count: 89,
    status: t('people.statusOptimal'),
    statusClass: 'text-primary-container',
    countClass: 'text-on-surface',
    iconBgClass: 'bg-surface-container-high',
    iconColorClass: 'text-on-surface-variant',
  },
  {
    icon: 'local_cafe',
    name: t('rooms.cafeteria'),
    capacity: 200,
    count: 15,
    status: t('people.statusLow'),
    statusClass: 'text-outline',
    countClass: 'text-on-surface',
    iconBgClass: 'bg-surface-container-high',
    iconColorClass: 'text-on-surface-variant',
    dim: true,
  },
]);

const activityRange = ref<'12h' | '24h'>('24h');
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <StatCard
      :label="t('people.currentOccupancy')"
      :value="currentOccupancyDisplay"
      icon="group"
    />

    <div class="bg-white rounded-xl border border-slate-200 shadow-[0_4px_20px_rgba(6,78,59,0.05)] p-6 flex flex-col justify-between h-48">
      <div class="flex justify-between items-start mb-4">
        <h3 class="text-label-md text-on-surface-variant">
          {{ t('people.peakOccupancyToday') }}
        </h3>
        <span class="material-symbols-outlined text-outline">show_chart</span>
      </div>
      <div>
        <div class="text-headline-lg text-on-surface">
          {{ peakOccupancyDisplay }}
        </div>
        <p class="text-label-sm text-outline mt-1">
          {{ peakAtDisplay }}
        </p>
      </div>
    </div>

    <StatCard
      :label="t('people.acSetting')"
      :value="acTempDisplay"
      icon="thermostat"
    >
      <span class="text-label-sm text-outline">{{ acModeDisplay }}</span>
      <span
        v-if="latestCalculation?.capacity_constrained"
        class="ml-2 text-label-sm text-error"
      >{{ t('people.acUndersized') }}</span>
    </StatCard>
  </div>

  <Card :title="t('people.camera.title')">
    <template #actions>
      <button
        v-if="!isMonitoring"
        type="button"
        class="px-3 py-1 text-label-sm rounded-lg bg-primary text-on-primary transition-colors hover:opacity-90"
        @click="start"
      >
        {{ t('people.camera.start') }}
      </button>
      <button
        v-else
        type="button"
        class="px-3 py-1 text-label-sm rounded-lg bg-error text-on-error transition-colors hover:opacity-90"
        @click="stop"
      >
        {{ t('people.camera.stop') }}
      </button>
    </template>

    <div class="relative w-full aspect-video bg-surface-container-low rounded-lg overflow-hidden flex items-center justify-center">
      <video
        :ref="(el) => (videoRef = el as HTMLVideoElement | null)"
        autoplay
        muted
        playsinline
        class="w-full h-full object-cover"
        :class="{ hidden: !isMonitoring }"
      />
      <div
        v-if="!isMonitoring"
        class="text-on-surface-variant text-label-sm flex flex-col items-center gap-2"
      >
        <span class="material-symbols-outlined text-[40px]">videocam_off</span>
        {{ t('people.camera.notStarted') }}
      </div>
      <div
        v-if="isMonitoring"
        class="absolute top-3 right-3 bg-black/60 text-white text-label-sm px-3 py-1 rounded-full flex items-center gap-2"
      >
        <span class="material-symbols-outlined text-[16px]">group</span>
        <span v-if="latestCount !== null">{{ t('people.camera.count', { n: latestCount }) }}</span>
        <span v-else-if="isAnalyzing">{{ t('people.camera.analyzing') }}</span>
      </div>
    </div>
    <p
      v-if="error"
      class="text-label-sm text-error mt-3"
    >
      {{ error === 'permission_denied' ? t('people.camera.permissionDenied') : t('people.camera.analysisFailed') }}
    </p>
  </Card>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <Card
      :title="t('people.activityTrend')"
      class="lg:col-span-2 min-h-[400px]"
    >
      <template #actions>
        <button
          type="button"
          class="px-3 py-1 text-label-sm rounded-lg transition-colors"
          :class="activityRange === '12h' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'"
          @click="activityRange = '12h'"
        >
          12h
        </button>
        <button
          type="button"
          class="px-3 py-1 text-label-sm rounded-lg transition-colors"
          :class="activityRange === '24h' ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'"
          @click="activityRange = '24h'"
        >
          24h
        </button>
      </template>

      <div class="flex-1 w-full bg-surface-container-low rounded-lg relative overflow-hidden flex items-end justify-between p-4 pt-12 gap-[3%]">
        <div
          v-for="(bar, i) in activityBars"
          :key="i"
          class="w-full rounded-t-sm relative"
          :class="bar.now ? 'bg-primary-container' : 'bg-surface-variant'"
          :style="{ height: `${bar.heightPct}%` }"
        >
          <div
            v-if="bar.now"
            class="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-on-surface text-label-sm px-2 py-1 rounded shadow-sm border border-slate-200 whitespace-nowrap"
          >
            {{ t('people.now') }}
          </div>
        </div>
      </div>
    </Card>

    <Card :title="t('people.densityByZone')">
      <div class="flex flex-col gap-4 overflow-y-auto max-h-80 pr-2">
        <div
          v-for="zone in zones"
          :key="zone.name"
          class="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-surface-container-low transition-colors cursor-pointer"
          :class="{ 'opacity-70': zone.dim }"
        >
          <div class="flex items-center gap-3">
            <div
              class="p-2 rounded-lg"
              :class="[zone.iconBgClass, zone.iconColorClass]"
            >
              <span class="material-symbols-outlined text-[20px]">{{ zone.icon }}</span>
            </div>
            <div>
              <div class="text-label-md text-on-surface">
                {{ zone.name }}
              </div>
              <div class="text-label-sm text-outline">
                {{ t('people.capacity', { n: zone.capacity }) }}
              </div>
            </div>
          </div>
          <div class="text-right">
            <div
              class="text-headline-md"
              :class="zone.countClass"
            >
              {{ zone.count }}
            </div>
            <div
              class="text-[10px]"
              :class="zone.statusClass"
            >
              {{ zone.status }}
            </div>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>
