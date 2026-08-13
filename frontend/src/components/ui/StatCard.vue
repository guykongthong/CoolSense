<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string;
    icon?: string;
    valueSize?: 'display' | 'headline';
  }>(),
  { icon: undefined, valueSize: 'display' },
);
</script>

<template>
  <div
    class="bg-white rounded-xl border border-slate-200 shadow-[0_4px_20px_rgba(6,78,59,0.05)] p-6 flex flex-col justify-between min-h-48"
  >
    <div class="flex justify-between items-start gap-4">
      <div>
        <h3 class="text-label-md text-on-surface-variant mb-1">
          {{ label }}
        </h3>
        <div
          :class="valueSize === 'display' ? 'text-display-lg' : 'text-headline-lg'"
          class="text-on-surface"
        >
          {{ value }}
        </div>
      </div>
      <div
        v-if="icon"
        class="bg-surface-container-low p-2 rounded-full text-primary-container shrink-0"
      >
        <span class="material-symbols-outlined">{{ icon }}</span>
      </div>
    </div>
    <div class="mt-4">
      <slot />
    </div>
  </div>
</template>
