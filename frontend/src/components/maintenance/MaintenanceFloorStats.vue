<script setup lang="ts">
import { computed } from 'vue';
import { formatDate } from '../../lib/format';
import { t } from '../../lib/i18n';

const props = defineProps<{
  attention: number;
  unitCount: number;
  openAlerts: number;
  oldestCleaned: string | null;
  neverCleaned: boolean;
}>();

const cleanedText = computed(() => {
  if (props.neverCleaned || !props.oldestCleaned) return t('maintenance.floor.cleanedNone');
  return formatDate(props.oldestCleaned);
});
</script>

<template>
  <dl class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <div class="rounded-lg bg-surface-container-low px-4 py-3">
      <dt class="text-label-sm text-on-surface-variant">
        {{ t('maintenance.floor.attention') }}
      </dt>
      <dd
        class="text-headline-md"
        :class="attention > 0 ? 'text-error' : 'text-on-surface'"
      >
        {{ attention }} / {{ unitCount }}
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
    <div class="rounded-lg bg-surface-container-low px-4 py-3 col-span-2 sm:col-span-1">
      <dt class="text-label-sm text-on-surface-variant">
        {{ t('maintenance.floor.cleaned') }}
      </dt>
      <dd class="text-headline-md text-on-surface">
        {{ cleanedText }}
      </dd>
    </div>
  </dl>
</template>
