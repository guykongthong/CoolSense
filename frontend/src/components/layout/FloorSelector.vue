<script setup lang="ts">
import { floorName, useSelectedFloor } from '../../composables/useSelectedFloor';
import { demoFloors } from '../../lib/mock/rooms';
import { t } from '../../lib/i18n';

// select: dropdown for the desktop header. chips: scrollable row for phones.
withDefaults(defineProps<{ variant?: 'select' | 'chips' }>(), { variant: 'select' });

const { selectedFloor, setFloor, ALL_FLOORS } = useSelectedFloor();

const chipBase = 'shrink-0 min-h-11 px-4 rounded-full text-label-md border transition-colors';
</script>

<template>
  <label
    v-if="variant === 'select'"
    class="flex items-center gap-2 min-w-0"
  >
    <span class="sr-only">{{ t('floors.selectorLabel') }}</span>
    <span
      class="material-symbols-outlined text-primary shrink-0"
      aria-hidden="true"
    >layers</span>
    <span class="relative min-w-0">
      <select
        :value="selectedFloor"
        class="appearance-none min-h-11 min-w-0 max-w-full md:max-w-64 border border-outline-variant rounded-lg pl-3 pr-11 text-label-md bg-surface-container-lowest text-on-surface"
        @change="setFloor(($event.target as HTMLSelectElement).value)"
      >
        <option :value="ALL_FLOORS">
          {{ t('floors.all') }}
        </option>
        <option
          v-for="floor in demoFloors"
          :key="floor.id"
          :value="floor.id"
        >
          {{ floorName(floor.id) }}
        </option>
      </select>
      <span
        class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
        aria-hidden="true"
      >expand_more</span>
    </span>
  </label>
  <div
    v-else
    class="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1"
    role="group"
    :aria-label="t('floors.selectorLabel')"
  >
    <button
      type="button"
      :class="[chipBase, selectedFloor === ALL_FLOORS ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant']"
      :aria-pressed="selectedFloor === ALL_FLOORS"
      @click="setFloor(ALL_FLOORS)"
    >
      {{ t('floors.all') }}
    </button>
    <button
      v-for="floor in demoFloors"
      :key="floor.id"
      type="button"
      :class="[chipBase, selectedFloor === floor.id ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant']"
      :aria-pressed="selectedFloor === floor.id"
      @click="setFloor(floor.id)"
    >
      {{ floorName(floor.id) }}
    </button>
  </div>
</template>
