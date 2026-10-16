<script setup lang="ts">
import { formatNumber } from '../../lib/format';
import { t } from '../../lib/i18n';

defineProps<{
  people: number;
  unitsRunning: number;
  unitCount: number;
  savedKg: number;
  openAlerts: number;
}>();
</script>

<template>
  <dl class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <div class="rounded-lg bg-surface-container-low px-4 py-3">
      <dt class="text-label-sm text-on-surface-variant">
        {{ t('floors.stat.people') }}
      </dt>
      <dd class="text-headline-md text-on-surface">
        {{ formatNumber(people, 0) }}
      </dd>
    </div>
    <div class="rounded-lg bg-surface-container-low px-4 py-3">
      <dt class="text-label-sm text-on-surface-variant">
        {{ t('floors.stat.running') }}
      </dt>
      <dd class="text-headline-md text-on-surface">
        {{ unitsRunning }} / {{ unitCount }}
      </dd>
    </div>
    <div class="rounded-lg bg-surface-container-low px-4 py-3">
      <dt class="text-label-sm text-on-surface-variant">
        {{ t('floors.stat.saved') }}
      </dt>
      <dd class="text-headline-md text-on-surface">
        {{ formatNumber(savedKg, 1) }} kg
      </dd>
    </div>
    <div class="rounded-lg bg-surface-container-low px-4 py-3">
      <dt class="text-label-sm text-on-surface-variant">
        {{ t('floors.stat.alerts') }}
      </dt>
      <dd
        class="text-headline-md"
        :class="openAlerts > 0 ? 'text-error' : 'text-on-surface'"
      >
        {{ openAlerts }}
      </dd>
    </div>
  </dl>
</template>
