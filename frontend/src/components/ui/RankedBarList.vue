<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber } from '../../lib/format';

export interface RankedBarItem {
  id: string;
  label: string;
  value: number;
}

const props = withDefaults(
  defineProps<{
    items: RankedBarItem[];
    unit: string;
    color: string;
    digits?: number;
  }>(),
  { digits: 1 },
);

const sorted = computed(() => [...props.items].sort((a, b) => b.value - a.value));
const maxValue = computed(() => Math.max(0.0001, ...props.items.map((i) => Math.abs(i.value))));
</script>

<template>
  <ul class="flex flex-col gap-3">
    <li
      v-for="item in sorted"
      :key="item.id"
      class="flex flex-col gap-1"
    >
      <div class="flex justify-between gap-3 text-label-md">
        <span class="text-on-surface truncate">{{ item.label }}</span>
        <span class="text-on-surface-variant shrink-0">{{ formatNumber(item.value, digits) }} {{ unit }}</span>
      </div>
      <div class="h-2.5 rounded-full bg-surface-container-low overflow-hidden">
        <div
          class="h-full rounded-full"
          :style="{ width: `${Math.max(2, (Math.abs(item.value) / maxValue) * 100)}%`, backgroundColor: color }"
        />
      </div>
    </li>
  </ul>
</template>
