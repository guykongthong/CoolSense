<script setup lang="ts">
import { t } from '../../lib/i18n';

export interface NavItem {
  id: string;
  to: string;
  label: string;
  icon: string;
  badge?: number;
}

defineProps<{
  items: NavItem[];
  closable?: boolean;
}>();

defineEmits<{ close: [] }>();
</script>

<template>
  <nav
    class="flex flex-col bg-surface-container-low h-full w-64 shrink-0 p-6 gap-2"
    :aria-label="t('nav.main')"
  >
    <div class="mb-8 flex items-start justify-between gap-2">
      <div>
        <h1 class="text-headline-md font-bold text-primary">
          CoolSense
        </h1>
        <p class="text-label-sm text-on-surface-variant">
          {{ t('shell.tagline') }}
        </p>
      </div>
      <button
        v-if="closable"
        type="button"
        class="-mt-2 -mr-2 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
        :aria-label="t('nav.closeMenu')"
        @click="$emit('close')"
      >
        <span
          class="material-symbols-outlined"
          aria-hidden="true"
        >close</span>
      </button>
    </div>

    <RouterLink
      v-for="item in items"
      :key="item.id"
      :to="item.to"
      class="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors text-on-surface-variant hover:bg-surface-container-high"
      active-class="nav-active"
    >
      <span
        class="material-symbols-outlined"
        aria-hidden="true"
      >{{ item.icon }}</span>
      <span class="text-label-md flex-1">{{ item.label }}</span>
      <span
        v-if="item.badge"
        class="min-w-5 h-5 px-1.5 rounded-full bg-error text-on-error text-label-sm flex items-center justify-center"
      >{{ item.badge }}</span>
    </RouterLink>

    <slot />
  </nav>
</template>
