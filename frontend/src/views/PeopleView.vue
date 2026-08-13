<script setup lang="ts">
import { computed, ref } from 'vue';
import Card from '../components/ui/Card.vue';
import StatCard from '../components/ui/StatCard.vue';
import { t } from '../lib/i18n';

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
      value="1,284"
      icon="group"
    >
      <div class="flex items-center gap-2">
        <span class="flex items-center text-primary-container text-label-sm bg-secondary-fixed px-2 py-1 rounded-full">
          <span class="material-symbols-outlined text-[16px] mr-1">trending_up</span>+12%
        </span>
        <span class="text-label-sm text-outline">{{ t('people.vsLastHour') }}</span>
      </div>
    </StatCard>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:col-span-2">
      <div class="bg-white rounded-xl border border-slate-200 shadow-[0_4px_20px_rgba(6,78,59,0.05)] p-6 flex flex-col justify-between h-48">
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-label-md text-on-surface-variant">
            {{ t('people.peakOccupancyToday') }}
          </h3>
          <span class="material-symbols-outlined text-outline">show_chart</span>
        </div>
        <div>
          <div class="text-headline-lg text-on-surface">
            1,450
          </div>
          <p class="text-label-sm text-outline mt-1">
            {{ t('people.peakAt') }}
          </p>
        </div>
        <div class="w-full bg-surface-container h-2 rounded-full mt-4 overflow-hidden">
          <div
            class="h-full rounded-full bg-gradient-to-r from-[#10B981] to-primary-container"
            style="width: 85%"
          />
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 shadow-[0_4px_20px_rgba(6,78,59,0.05)] p-6 flex flex-col justify-between h-48">
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-label-md text-on-surface-variant">
            {{ t('people.averageStayTime') }}
          </h3>
          <span class="material-symbols-outlined text-outline">schedule</span>
        </div>
        <div>
          <div class="text-headline-lg text-on-surface">
            45 min
          </div>
          <p class="text-label-sm text-outline mt-1">
            {{ t('people.minFromYesterday') }}
          </p>
        </div>
        <div class="flex gap-2 mt-4">
          <span class="bg-error-container text-on-error-container text-label-sm px-2 py-1 rounded-full border border-error/20">{{
            t('people.optimal')
          }}</span>
        </div>
      </div>
    </div>
  </div>

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
