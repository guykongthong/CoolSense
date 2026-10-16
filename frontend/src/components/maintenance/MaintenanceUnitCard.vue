<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MaintenanceEvaluation } from '../../lib/maintenanceApi';
import { formatDate, formatNumber } from '../../lib/format';
import { t } from '../../lib/i18n';
import { needsAttention, statusKey, STATUS_STYLE } from './status';

const props = defineProps<{
  // Floor, room and unit name, empty in real mode.
  path: string[];
  title: string;
  evaluation: MaintenanceEvaluation;
  selected: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{ select: []; clean: [] }>();

const key = computed(() => statusKey(props.evaluation));
const style = computed(() => STATUS_STYLE[key.value]);
const attention = computed(() => needsAttention(props.evaluation));
const confirming = ref(false);
const extra = computed(() =>
  key.value === 'insufficient' ? '' : t('maintenance.card.extra', { pct: formatNumber(props.evaluation.excess_pct ?? 0, 0) }),
);
const cleaned = computed(() =>
  props.evaluation.last_serviced_at
    ? t('maintenance.lastServiced', { date: formatDate(props.evaluation.last_serviced_at) })
    : t('maintenance.neverServiced'),
);

function confirm() {
  confirming.value = false;
  emit('clean');
}

const btn = 'px-3 min-h-11 text-label-md rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
</script>

<template>
  <article
    class="bg-surface-container-lowest rounded-xl border p-4 flex flex-col gap-3 shadow-card transition-colors cursor-pointer hover:border-primary"
    :class="selected ? 'border-primary ring-2 ring-primary bg-surface-container-low' : 'border-slate-200'"
    :aria-label="title"
    :aria-current="selected ? 'true' : undefined"
    @click="emit('select')"
  >
    <div class="min-w-0">
      <p
        v-if="path.length"
        class="text-label-sm text-on-surface-variant truncate"
      >
        {{ path.join(' > ') }}
      </p>
      <h4 class="text-label-md text-on-surface truncate">
        {{ path.length ? path[path.length - 1] : title }}
      </h4>
    </div>

    <span
      class="inline-flex items-center gap-1 self-start px-3 py-1 rounded-full text-label-md"
      :class="style.chip"
    >
      <span
        class="material-symbols-outlined text-[18px]"
        aria-hidden="true"
      >{{ style.icon }}</span>
      {{ t(`maintenance.status.${key}`) }}
    </span>

    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-label-sm">
      <template v-if="extra">
        <dt class="text-on-surface-variant">
          {{ t('maintenance.excessLabel') }}
        </dt>
        <dd class="text-on-surface text-right font-medium">
          {{ extra }}
        </dd>
      </template>
      <dt class="text-on-surface-variant col-span-2">
        {{ cleaned }}
      </dt>
    </dl>

    <div
      v-if="!confirming"
      class="flex flex-wrap gap-2 mt-auto"
    >
      <button
        type="button"
        :class="[btn, selected ? 'bg-primary text-on-primary' : 'border border-outline text-on-surface hover:bg-surface-container-low']"
        :aria-pressed="selected"
        :aria-label="t('maintenance.card.viewFor', { name: title })"
        @click.stop="emit('select')"
      >
        {{ selected ? t('maintenance.card.viewing') : t('maintenance.card.view') }}
      </button>
      <button
        v-if="attention"
        type="button"
        :class="[btn, 'border border-outline text-on-surface hover:bg-surface-container-low']"
        :disabled="busy"
        :aria-label="t('maintenance.card.cleanedFor', { name: title })"
        @click.stop="confirming = true"
      >
        {{ t('maintenance.markCleaned') }}
      </button>
    </div>
    <div
      v-else
      class="flex flex-col gap-2 mt-auto"
      role="group"
      :aria-label="title"
      @click.stop
    >
      <p class="text-label-sm text-on-surface-variant">
        {{ t('maintenance.confirmPromptUnit') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          :class="[btn, 'bg-primary text-on-primary hover:bg-primary-container']"
          :disabled="busy"
          @click="confirm"
        >
          {{ t('maintenance.confirmCleaned') }}
        </button>
        <button
          type="button"
          :class="[btn, 'border border-outline text-on-surface hover:bg-surface-container-low']"
          @click="confirming = false"
        >
          {{ t('maintenance.cancel') }}
        </button>
      </div>
    </div>
  </article>
</template>
