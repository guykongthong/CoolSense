<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { t } from '../../lib/i18n';
import Card from '../ui/Card.vue';
import LocationFields from './LocationFields.vue';

const emit = defineEmits<{ create: [name: string, location: string] }>();

const open = ref(false);
const name = ref('');
const location = ref('');
const error = ref('');
const locationError = ref(false);
const nameInput = ref<HTMLInputElement | null>(null);
const addButton = ref<HTMLButtonElement | null>(null);

const field = 'w-full bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 text-on-surface text-body-md py-3 px-4';

async function show() {
  open.value = true;
  await nextTick();
  nameInput.value?.focus();
}

function close() {
  open.value = false;
  name.value = '';
  location.value = '';
  error.value = '';
  locationError.value = false;
  nextTick(() => addButton.value?.focus());
}

function submit() {
  if (!name.value.trim()) {
    error.value = t('settings.nameRequired');
    return;
  }
  if (!location.value) {
    locationError.value = true;
    return;
  }
  emit('create', name.value, location.value);
  close();
}

// Drop the province warning as soon as one is picked.
watch(location, (value) => {
  if (value) locationError.value = false;
});
</script>

<template>
  <button
    v-if="!open"
    ref="addButton"
    type="button"
    class="self-start min-h-11 px-5 rounded-lg bg-primary text-on-primary text-label-md hover:bg-primary-container transition-colors inline-flex items-center gap-2"
    @click="show"
  >
    <span
      class="material-symbols-outlined"
      aria-hidden="true"
    >add</span>
    {{ t('settings.add') }}
  </button>
  <Card v-else>
    <form
      class="flex flex-col gap-4"
      @submit.prevent="submit"
    >
      <div>
        <label
          class="block text-label-md text-on-surface-variant mb-1"
          for="new_building_name"
        >{{ t('settings.name') }}</label>
        <input
          id="new_building_name"
          ref="nameInput"
          v-model="name"
          type="text"
          :class="field"
          :aria-invalid="!!error"
          :placeholder="t('settings.namePlaceholder')"
        >
        <p
          v-if="error"
          class="text-label-md text-error mt-1"
          role="alert"
        >
          {{ error }}
        </p>
      </div>
      <div>
        <LocationFields
          v-model="location"
          id-prefix="new_building"
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
      <div class="flex flex-wrap gap-3">
        <button
          type="submit"
          class="min-h-11 px-5 rounded-lg bg-primary text-on-primary text-label-md hover:bg-primary-container"
        >
          {{ t('settings.create') }}
        </button>
        <button
          type="button"
          class="min-h-11 px-5 rounded-lg border border-outline text-on-surface text-label-md hover:bg-surface-container-low"
          @click="close"
        >
          {{ t('settings.cancel') }}
        </button>
      </div>
    </form>
  </Card>
</template>
