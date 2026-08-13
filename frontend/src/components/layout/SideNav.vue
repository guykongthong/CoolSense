<script setup lang="ts">
import { t } from '../../lib/i18n';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

defineProps<{
  items: NavItem[];
  modelValue: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <nav class="flex flex-col bg-surface-container-low h-full w-64 shrink-0 p-6 gap-2">
    <div class="mb-8">
      <h1 class="text-headline-md font-bold text-primary">
        CoolSense
      </h1>
      <p class="text-label-sm text-on-surface-variant">
        {{ t('shell.tagline') }}
      </p>
    </div>

    <a
      v-for="item in items"
      :key="item.id"
      href="#"
      class="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors"
      :class="
        modelValue === item.id
          ? 'bg-secondary-fixed text-on-secondary-fixed'
          : 'text-on-surface-variant hover:bg-surface-container-high'
      "
      @click.prevent="$emit('update:modelValue', item.id)"
    >
      <span
        class="material-symbols-outlined"
        :style="modelValue === item.id ? { fontVariationSettings: '\'FILL\' 1' } : {}"
      >{{
        item.icon
      }}</span>
      <span class="text-label-md">{{ item.label }}</span>
    </a>
  </nav>
</template>
