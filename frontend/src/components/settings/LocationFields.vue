<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { locale, t } from '../../lib/i18n';
import { formatLocation, parseLocation, provinceLabel, THAI_PROVINCES } from '../../lib/thaiProvinces';

// Two plain fields (province and district) that combine into one location
// string like "Hang Dong, Chiang Mai, Thailand".
const props = defineProps<{ modelValue: string; idPrefix: string; invalid?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const initial = parseLocation(props.modelValue);
const province = ref(initial.province);
const area = ref(initial.area);

watch([province, area], () => emit('update:modelValue', formatLocation(area.value, province.value)));
watch(
  () => props.modelValue,
  (value) => {
    if (value === formatLocation(area.value, province.value)) return;
    const next = parseLocation(value);
    province.value = next.province;
    area.value = next.area;
  },
);

const isThai = computed(() => locale.value === 'th');
const preview = computed(() => formatLocation(area.value, province.value));

const field =
  'w-full bg-surface-container-lowest border border-outline-variant rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 text-on-surface text-body-md py-3 px-4';
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-label-md text-on-surface-variant">
      {{ t('settings.locationHint') }}
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label
          class="block text-label-md text-on-surface-variant mb-1"
          :for="`${idPrefix}-province`"
        >{{ t('settings.province') }}</label>
        <div class="relative">
          <select
            :id="`${idPrefix}-province`"
            v-model="province"
            :class="[field, 'appearance-none pr-11']"
            :aria-invalid="invalid"
          >
            <option value="">
              {{ t('settings.provincePlaceholder') }}
            </option>
            <option
              v-for="[en] in THAI_PROVINCES"
              :key="en"
              :value="en"
            >
              {{ provinceLabel(en, isThai) }}
            </option>
          </select>
          <span
            class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
            aria-hidden="true"
          >expand_more</span>
        </div>
      </div>
      <div>
        <label
          class="block text-label-md text-on-surface-variant mb-1"
          :for="`${idPrefix}-area`"
        >{{ t('settings.area') }}</label>
        <input
          :id="`${idPrefix}-area`"
          v-model="area"
          type="text"
          :class="field"
          :placeholder="t('settings.areaPlaceholder')"
        >
      </div>
    </div>
    <p
      class="text-label-md"
      :class="preview ? 'text-on-surface' : 'text-on-surface-variant'"
    >
      {{ preview ? t('settings.locationPreview', { value: preview }) : t('settings.locationEmpty') }}
    </p>
  </div>
</template>
