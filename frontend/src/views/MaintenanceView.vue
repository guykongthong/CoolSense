<script setup lang="ts">
import { nextTick, ref } from 'vue';
import FloorMaintenanceCard from '../components/maintenance/FloorMaintenanceCard.vue';
import MaintenanceUnitCard from '../components/maintenance/MaintenanceUnitCard.vue';
import MaintenanceUnitDetail from '../components/maintenance/MaintenanceUnitDetail.vue';
import { REAL_UNIT_ID, useMaintenancePage } from '../composables/useMaintenancePage';
import { t } from '../lib/i18n';
import { isDemoMode } from '../lib/mock/mode';

const page = useMaintenancePage();
const {
  loading, loadError, actionError, busy, entries, alerts, groups, selected, selectedId, allFloors,
  openFloors, everyFloorOpen, unitPath, unitTitle,
} = page;

const detailEl = ref<HTMLElement | null>(null);

// Picking a card brings the details into view, they sit below the overview.
async function choose(id: string) {
  page.select(id);
  await nextTick();
  detailEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  detailEl.value?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
}

const outlineButton =
  'px-4 min-h-11 text-label-md rounded-lg border border-outline text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
</script>

<template>
  <div class="flex flex-col gap-6">
    <div
      v-if="loadError"
      class="flex flex-wrap items-center gap-3 rounded-xl bg-error-container text-on-error-container p-4"
      role="alert"
    >
      <span
        class="material-symbols-outlined"
        aria-hidden="true"
      >error</span>
      <p class="text-label-md flex-1">
        {{ t('maintenance.loadError') }}
      </p>
      <button
        type="button"
        :class="outlineButton"
        @click="page.load()"
      >
        {{ t('maintenance.retry') }}
      </button>
    </div>

    <div
      v-if="actionError"
      class="flex items-center gap-3 rounded-xl bg-error-container text-on-error-container p-4"
      role="alert"
    >
      <span
        class="material-symbols-outlined"
        aria-hidden="true"
      >error</span>
      <p class="text-label-md">
        {{ t('maintenance.actionError') }}
      </p>
    </div>

    <template v-if="loading">
      <div
        class="h-48 rounded-xl bg-surface-container animate-pulse"
        aria-hidden="true"
      />
      <div
        class="h-64 rounded-xl bg-surface-container animate-pulse"
        aria-hidden="true"
      />
    </template>

    <template v-else-if="entries.length">
      <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div class="flex-1 min-w-64">
          <p class="text-label-md text-on-surface-variant max-w-3xl">
            {{ t('maintenance.howItWorks') }}
          </p>
          <p
            v-if="entries.some((e) => e.evaluation.demo_data)"
            class="text-label-sm text-on-surface-variant mt-1"
          >
            {{ t('maintenance.demoNote') }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-if="isDemoMode && allFloors"
            type="button"
            :class="outlineButton"
            @click="page.toggleAll()"
          >
            {{ everyFloorOpen ? t('floors.collapseAll') : t('floors.expandAll') }}
          </button>
          <button
            type="button"
            :class="outlineButton"
            :disabled="busy !== null"
            @click="page.evaluateAll()"
          >
            {{ busy === 'evaluate' ? t('maintenance.evaluating') : t('maintenance.evaluateAll') }}
          </button>
        </div>
      </div>

      <!-- Overview: floor > room > unit -->
      <template v-if="isDemoMode">
        <FloorMaintenanceCard
          v-for="g in groups"
          :key="g.floor.id"
          :group="g"
          :collapsible="allFloors"
          :open="openFloors.includes(g.floor.id)"
          :selected-id="selectedId"
          :busy="busy !== null"
          @toggle="page.toggleFloor(g.floor.id)"
          @select="choose"
          @clean="page.markCleaned"
        />
      </template>
      <div
        v-else
        class="max-w-md"
      >
        <MaintenanceUnitCard
          :path="[]"
          :title="unitTitle(REAL_UNIT_ID)"
          :evaluation="entries[0].evaluation"
          :selected="true"
          :busy="busy !== null"
          @select="choose(REAL_UNIT_ID)"
          @clean="page.markCleaned(REAL_UNIT_ID)"
        />
      </div>

      <!-- Details of one unit -->
      <div ref="detailEl">
        <MaintenanceUnitDetail
          v-if="selected"
          :unit-id="selected.id"
          :trend-unit-id="isDemoMode ? selected.id : undefined"
          :path="unitPath(selected.id)"
          :title="unitTitle(selected.id)"
          :evaluation="selected.evaluation"
          :alerts="isDemoMode ? alerts.filter((a) => a.unit_id === selected!.id) : alerts"
          :busy="busy !== null"
          :evaluating="busy === 'evaluate'"
          :can-close="isDemoMode"
          @close="page.clearSelection()"
          @evaluate="page.evaluateAll()"
          @clean="page.markCleaned(selected.id)"
          @generate="page.generateDemo()"
          @respond="page.respond"
        />
        <p
          v-else
          class="text-body-md text-on-surface-variant"
        >
          {{ t('maintenance.detail.none') }}
        </p>
      </div>
    </template>
  </div>
</template>
