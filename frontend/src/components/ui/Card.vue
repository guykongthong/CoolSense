<script setup lang="ts">
withDefaults(defineProps<{ title?: string }>(), { title: undefined });
</script>

<template>
  <div class="bg-surface-container-lowest rounded-xl border border-slate-200 shadow-card p-6 flex flex-col">
    <div
      v-if="title || $slots.actions"
      class="flex justify-between items-center mb-6 pb-4 border-b border-dashed border-slate-200"
    >
      <h3 class="text-headline-md text-on-surface">
        {{ title }}
      </h3>
      <div class="flex gap-2">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </div>
</template>
