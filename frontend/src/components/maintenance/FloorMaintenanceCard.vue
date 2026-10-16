<script setup lang="ts">
import type { FloorGroup } from '../../composables/useMaintenancePage';
import { floorName, roomName } from '../../composables/useSelectedFloor';
import { t } from '../../lib/i18n';
import MaintenanceFloorStats from './MaintenanceFloorStats.vue';
import MaintenanceRoomGroup from './MaintenanceRoomGroup.vue';

defineProps<{
  group: FloorGroup;
  // All floors: a collapsible card. One floor: a plain section.
  collapsible: boolean;
  open: boolean;
  selectedId: string | null;
  busy: boolean;
}>();

const emit = defineEmits<{ toggle: []; select: [id: string]; clean: [id: string] }>();
</script>

<template>
  <section
    v-if="collapsible"
    class="bg-surface-container-lowest rounded-xl border border-slate-200 shadow-card"
    :aria-label="floorName(group.floor.id)"
  >
    <div class="p-4 md:p-6 flex flex-col gap-4">
      <button
        type="button"
        class="w-full text-left flex items-center justify-between gap-3 min-h-11"
        :aria-expanded="open"
        @click="emit('toggle')"
      >
        <span class="min-w-0">
          <span class="block text-headline-md text-on-surface">{{ floorName(group.floor.id) }}</span>
          <span class="block text-label-md text-on-surface-variant truncate">
            {{ group.rooms.map((r) => roomName(r.room.id)).join(', ') || t('floors.empty') }}
          </span>
        </span>
        <span
          class="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform"
          :class="open ? 'rotate-180' : ''"
          aria-hidden="true"
        >expand_more</span>
      </button>
      <MaintenanceFloorStats
        :attention="group.attention"
        :unit-count="group.unitCount"
        :open-alerts="group.openAlerts"
        :oldest-cleaned="group.oldestCleaned"
        :never-cleaned="group.neverCleaned"
      />
    </div>
    <div
      v-if="open"
      class="px-4 md:px-6 pb-4 md:pb-6 flex flex-col gap-6 border-t border-slate-200 pt-4"
    >
      <MaintenanceRoomGroup
        v-for="r in group.rooms"
        :key="r.room.id"
        :group="r"
        :selected-id="selectedId"
        :busy="busy"
        compact
        @select="(id) => emit('select', id)"
        @clean="(id) => emit('clean', id)"
      />
    </div>
  </section>

  <section
    v-else
    class="flex flex-col gap-6"
    :aria-label="floorName(group.floor.id)"
  >
    <MaintenanceFloorStats
      :attention="group.attention"
      :unit-count="group.unitCount"
      :open-alerts="group.openAlerts"
      :oldest-cleaned="group.oldestCleaned"
      :never-cleaned="group.neverCleaned"
    />
    <p
      v-if="group.rooms.length === 0"
      class="text-body-md text-on-surface-variant"
    >
      {{ t('floors.empty') }}
    </p>
    <MaintenanceRoomGroup
      v-for="r in group.rooms"
      :key="r.room.id"
      :group="r"
      :selected-id="selectedId"
      :busy="busy"
      @select="(id) => emit('select', id)"
      @clean="(id) => emit('clean', id)"
    />
  </section>
</template>
