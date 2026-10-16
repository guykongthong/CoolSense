<script setup lang="ts">
import { computed } from 'vue';
import { formatNumber } from '../../lib/format';
import { t } from '../../lib/i18n';

const props = withDefaults(
  defineProps<{
    name: string;
    roomName?: string;
    // null means no maintenance issue.
    severity?: 'watch' | 'warning' | 'critical' | null;
    setpointC: number;
    savedKg: number;
    savedPct: number;
    people: number;
  }>(),
  { roomName: undefined, severity: null },
);

const emit = defineEmits<{ select: [] }>();

const dotClass = computed(() => {
  if (props.severity === 'critical') return 'bg-error';
  if (props.severity) return 'bg-warning';
  return 'bg-success';
});
const statusText = computed(() => t(`maintenance.status.${props.severity ?? 'healthy'}`));
</script>

<template>
  <div
    role="button"
    tabindex="0"
    :aria-label="t('people.tile.open', { name })"
    class="bg-surface-container-lowest rounded-xl border border-slate-200 shadow-card p-4 flex flex-col gap-3 cursor-pointer transition-colors hover:border-primary hover:bg-surface-container-low"
    @click="emit('select')"
    @keydown.enter.prevent="emit('select')"
    @keydown.space.prevent="emit('select')"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h4 class="text-label-md text-on-surface truncate">
          {{ name }}
        </h4>
        <p
          v-if="roomName"
          class="text-label-sm text-on-surface-variant truncate"
        >
          {{ roomName }}
        </p>
      </div>
    </div>

    <div class="text-headline-lg text-on-surface">
      {{ formatNumber(setpointC, 1) }}°C
    </div>

    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-label-sm">
      <dt class="text-on-surface-variant">
        {{ t('people.tile.carbonSaved') }}
      </dt>
      <dd class="text-on-surface text-right">
        {{ formatNumber(savedKg, 1) }} kg ({{ formatNumber(savedPct, 0) }}%)
      </dd>
      <dt class="text-on-surface-variant">
        {{ t('people.tile.people') }}
      </dt>
      <dd class="text-on-surface text-right">
        {{ formatNumber(people, 0) }}
      </dd>
      <dt class="text-on-surface-variant">
        {{ t('people.tile.cleaning') }}
      </dt>
      <dd class="text-on-surface text-right inline-flex items-center justify-end gap-1.5">
        <span
          class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          :class="dotClass"
          aria-hidden="true"
        />
        {{ statusText }}
      </dd>
    </dl>
  </div>
</template>
