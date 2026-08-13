<script setup lang="ts">
import SideNav, { type NavItem } from './SideNav.vue';
import LocaleToggle from '../ui/LocaleToggle.vue';
import { t } from '../../lib/i18n';

defineProps<{
  items: NavItem[];
  modelValue: string;
  title: string;
  subtitle: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();
</script>

<template>
  <div class="min-h-screen flex flex-col md:flex-row bg-background text-on-background">
    <SideNav
      class="hidden md:flex fixed left-0 top-0 h-screen z-40"
      :items="items"
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
    />

    <div class="flex-1 md:ml-64 flex flex-col min-h-screen">
      <header class="bg-surface sticky top-0 z-30 border-b border-surface-container-high md:border-none">
        <div class="flex justify-between items-center px-4 md:px-10 h-20 max-w-[1280px] mx-auto">
          <div class="md:hidden">
            <span class="text-headline-md font-bold text-primary">CoolSense</span>
          </div>
          <div class="hidden md:flex flex-col">
            <h2 class="text-headline-lg text-on-surface">
              {{ title }}
            </h2>
            <p class="text-body-md text-on-surface-variant">
              {{ subtitle }}
            </p>
          </div>
          <LocaleToggle />
        </div>
        <!-- Mobile tab strip — no drawer/router in this MVP, just a flat switcher. -->
        <div class="md:hidden flex gap-2 px-4 pb-3 overflow-x-auto">
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-label-sm whitespace-nowrap transition-colors"
            :class="
              modelValue === item.id
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant'
            "
            @click="$emit('update:modelValue', item.id)"
          >
            <span class="material-symbols-outlined text-[16px]">{{ item.icon }}</span>
            {{ item.label }}
          </button>
        </div>
      </header>

      <main class="flex-1 p-4 md:p-10 max-w-[1280px] mx-auto w-full flex flex-col gap-6">
        <div class="md:hidden">
          <h2 class="text-headline-lg-mobile text-on-surface">
            {{ title }}
          </h2>
          <p class="text-body-md text-on-surface-variant">
            {{ subtitle }}
          </p>
        </div>
        <slot />
      </main>

      <footer class="bg-on-surface text-inverse-on-surface py-8 mt-auto">
        <div class="flex flex-col md:flex-row justify-between items-center gap-2 px-4 md:px-10 max-w-[1280px] mx-auto text-label-sm">
          <span class="font-bold text-primary-fixed-dim">CoolSense</span>
          <p>{{ t('shell.footerTagline') }}</p>
        </div>
      </footer>
    </div>
  </div>
</template>
