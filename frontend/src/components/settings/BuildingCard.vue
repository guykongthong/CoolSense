<script setup lang="ts">
import { nextTick, ref, watch, useId } from 'vue';
import { formatNumber } from '../../lib/format';
import { t } from '../../lib/i18n';
import Card from '../ui/Card.vue';
import LocationFields from './LocationFields.vue';

export interface WeatherView {
  temp: number;
  humidity: number;
  label: string;
}

const props = defineProps<{
  name: string;
  location: string;
  current?: boolean;
  // Real mode has one location only: no name, no delete, no switch.
  single?: boolean;
  canDelete?: boolean;
  canSwitch?: boolean;
  weather: WeatherView | null;
  weatherState?: 'ok' | 'loading' | 'error' | 'none';
  saving?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  save: [name: string, location: string];
  remove: [];
  switch: [];
}>();

const uid = useId();
const editing = ref(false);
const confirming = ref(false);
const draftName = ref('');
const draftLocation = ref('');
const nameError = ref('');
const nameInput = ref<HTMLInputElement | null>(null);
const locationError = ref(false);

const btn = 'min-h-11 px-4 rounded-lg text-label-md transition-colors';
const outlineBtn = `${btn} border border-outline text-on-surface hover:bg-surface-container-low`;
const field = 'w-full bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 text-on-surface text-body-md py-3 px-4';

async function startEdit() {
  draftName.value = props.name;
  draftLocation.value = props.location;
  nameError.value = '';
  locationError.value = false;
  confirming.value = false;
  editing.value = true;
  await nextTick();
  nameInput.value?.focus();
}

function submit() {
  if (!props.single && !draftName.value.trim()) {
    nameError.value = t('settings.nameRequired');
    return;
  }
  if (!draftLocation.value) {
    locationError.value = true;
    return;
  }
  emit('save', draftName.value, draftLocation.value);
}

// The parent closes the form once the save went through.
function closeEdit() {
  editing.value = false;
}
defineExpose({ closeEdit });

// Drop the province warning as soon as one is picked.
watch(draftLocation, (value) => {
  if (value) locationError.value = false;
});
</script>

<template>
  <Card>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <span
            class="material-symbols-outlined text-primary"
            aria-hidden="true"
          >apartment</span>
          <h4 class="text-headline-md text-on-surface break-words">
            {{ single ? t('settings.location') : name }}
          </h4>
          <span
            v-if="current && !single"
            class="px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed-variant text-label-sm"
          >{{ t('settings.current') }}</span>
        </div>
        <p class="text-body-md text-on-surface-variant mt-1 break-words">
          {{ location || t('settings.noLocation') }}
        </p>
      </div>

      <div
        class="text-right shrink-0"
        aria-live="polite"
      >
        <template v-if="weather">
          <p class="text-headline-md text-on-surface">
            {{ formatNumber(weather.temp, 0) }}°C
            <span class="text-label-md text-on-surface-variant font-normal ml-1">{{ formatNumber(weather.humidity, 0) }}% {{ t('building.humidity') }}</span>
          </p>
          <p class="text-label-md text-on-surface-variant">
            {{ weather.label }}
          </p>
        </template>
        <p
          v-else-if="weatherState === 'loading'"
          class="text-label-md text-on-surface-variant"
        >
          {{ t('settings.weatherLoading') }}
        </p>
        <p
          v-else-if="weatherState === 'error'"
          class="text-label-md text-error"
        >
          {{ t('settings.weatherError') }}
        </p>
        <p
          v-else
          class="text-label-md text-on-surface-variant"
        >
          {{ t('settings.weatherNone') }}
        </p>
      </div>
    </div>

    <form
      v-if="editing"
      class="mt-5 pt-5 border-t border-dashed border-slate-200 flex flex-col gap-4"
      @submit.prevent="submit"
    >
      <div v-if="!single">
        <label
          class="block text-label-md text-on-surface-variant mb-1"
          :for="`${uid}-name`"
        >{{ t('settings.name') }}</label>
        <input
          :id="`${uid}-name`"
          ref="nameInput"
          v-model="draftName"
          type="text"
          :class="field"
          :aria-invalid="!!nameError"
          :placeholder="t('settings.namePlaceholder')"
        >
        <p
          v-if="nameError"
          class="text-label-md text-error mt-1"
          role="alert"
        >
          {{ nameError }}
        </p>
      </div>
      <div>
        <LocationFields
          v-model="draftLocation"
          :id-prefix="`${uid}-loc`"
          :invalid="locationError"
        />
        <p
          v-if="locationError"
          class="text-label-md text-error mt-1"
          role="alert"
        >
          {{ t('settings.provinceRequired') }}
        </p>
      </div>
      <p
        v-if="error"
        class="text-label-md text-error"
        role="alert"
      >
        {{ error }}
      </p>
      <div class="flex flex-wrap gap-3">
        <button
          type="submit"
          :disabled="saving"
          :class="`${btn} bg-primary text-on-primary hover:bg-primary-container disabled:opacity-50`"
        >
          {{ saving ? t('settings.saving') : t('settings.save') }}
        </button>
        <button
          type="button"
          :class="outlineBtn"
          @click="editing = false"
        >
          {{ t('settings.cancel') }}
        </button>
      </div>
    </form>

    <div
      v-else-if="confirming"
      class="mt-5 pt-5 border-t border-dashed border-slate-200 flex flex-col gap-3"
      role="alertdialog"
      :aria-label="t('settings.delete')"
    >
      <p class="text-body-md text-on-surface">
        {{ t('settings.deleteConfirm', { name }) }}
      </p>
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          :class="`${btn} bg-error text-on-error`"
          @click="emit('remove'); confirming = false"
        >
          {{ t('settings.deleteYes') }}
        </button>
        <button
          type="button"
          :class="outlineBtn"
          @click="confirming = false"
        >
          {{ t('settings.cancel') }}
        </button>
      </div>
    </div>

    <div
      v-else
      class="mt-5 flex flex-wrap gap-3"
    >
      <button
        v-if="canSwitch && !current"
        type="button"
        :class="`${btn} bg-primary text-on-primary hover:bg-primary-container`"
        @click="emit('switch')"
      >
        {{ t('settings.switch') }}
      </button>
      <button
        type="button"
        :class="outlineBtn"
        @click="startEdit"
      >
        {{ t('settings.edit') }}
      </button>
      <button
        v-if="!single"
        type="button"
        :disabled="!canDelete"
        :title="canDelete ? undefined : t('settings.lastBuilding')"
        :class="`${outlineBtn} text-error disabled:opacity-40`"
        @click="confirming = true"
      >
        {{ t('settings.delete') }}
      </button>
    </div>
    <p
      v-if="!single && !canDelete && !editing"
      class="text-label-sm text-on-surface-variant mt-2"
    >
      {{ t('settings.lastBuilding') }}
    </p>
  </Card>
</template>
