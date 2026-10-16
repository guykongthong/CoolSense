<script setup lang="ts">
import type { RoomGroup, UnitEntry } from '../../composables/useMaintenancePage';
import { floorName, roomName, unitName } from '../../composables/useSelectedFloor';
import { t } from '../../lib/i18n';
import MaintenanceUnitCard from './MaintenanceUnitCard.vue';

defineProps<{
  group: RoomGroup;
  selectedId: string | null;
  busy: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{ select: [id: string]; clean: [id: string] }>();

function path(group: RoomGroup, entry: UnitEntry): string[] {
  const unit = group.room.units.find((u) => u.id === entry.id);
  return [floorName(group.room.floorId), roomName(group.room.id), unit ? unitName(unit) : ''];
}
</script>

<template>
  <section
    class="flex flex-col gap-3"
    :aria-label="roomName(group.room.id)"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3 :class="compact ? 'text-label-md text-on-surface' : 'text-headline-md text-on-surface'">
        {{ roomName(group.room.id) }}
      </h3>
      <p class="text-label-sm text-on-surface-variant">
        {{ t('maintenance.room.units', { n: group.units.length }) }}
      </p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <MaintenanceUnitCard
        v-for="entry in group.units"
        :key="entry.id"
        :path="path(group, entry)"
        :title="path(group, entry).join(' > ')"
        :evaluation="entry.evaluation"
        :selected="selectedId === entry.id"
        :busy="busy"
        @select="emit('select', entry.id)"
        @clean="emit('clean', entry.id)"
      />
    </div>
  </section>
</template>
