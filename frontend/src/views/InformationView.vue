<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useBuildingLocation } from '../composables/useBuildingLocation';
import { useLocation } from '../composables/useLocation';
import {
  type EgatLabel,
  getRoomConfig,
  ROOM_SIZE_SQM_RANGES,
  type RoomSize,
  updateRoomConfig,
} from '../lib/api';
import { formatNumber } from '../lib/format';
import { t } from '../lib/i18n';
import { withProgress } from '../lib/progress';
import { isDemoMode } from '../lib/mock/mode';
import RoomManager from '../components/rooms/RoomManager.vue';

// Notes on what is and isn't backed by the backend:
// Cooling Capacity DOES map to room_config.rated_capacity_btu_per_hr and
// actually affects the calculation now, see runCalculation.ts's
// applyCapacityCeiling: if it's lower than the computed required BTU/hr,
// the unit is capacity-constrained (runs at its own max, flagged rather
// than silently under-cooling).

const ROOM_SIZE_TO_LETTER: Record<RoomSize, 's' | 'm' | 'l'> = { small: 's', medium: 'm', large: 'l' };
const LETTER_TO_ROOM_SIZE: Record<'s' | 'm' | 'l', RoomSize> = { s: 'small', m: 'medium', l: 'large' };

const device = reactive({
  roomSize: 'm' as 's' | 'm' | 'l',
  starRating: '' as EgatLabel | '',
  seerValue: '',
  coolingCapacity: '',
});

// EGAT label is Thailand-only server-side, the saved location comes from the
// shared state behind the header menu.
const { isThailand } = useBuildingLocation();
const { loadLocation } = useLocation();

const loading = ref(true);
const saving = ref(false);
const loadError = ref(false);
const saveError = ref(false);
const saveErrorMessage = ref('');
const saveSuccess = ref(false);

// Success messages fade out on their own after a few seconds.
const SUCCESS_VISIBLE_MS = 3000;
let saveSuccessTimer: ReturnType<typeof setTimeout> | null = null;
onUnmounted(() => {
  if (saveSuccessTimer) clearTimeout(saveSuccessTimer);
});

// Mirrors room-config's own MIN_AC_SEER/MAX_AC_SEER, real-world
// manufacturer SEER range, now that the live calculation runs CoolSense V3
// (realistic SEER + BTU/m² physics) instead of V2's placeholder-calibrated
// STANDARD_SEER=4.5.
const MIN_AC_SEER = 13;
const MAX_AC_SEER = 25;

const ROOM_SIZE_LABEL_KEY: Record<'s' | 'm' | 'l', string> = { s: 'common.small', m: 'common.medium', l: 'common.large' };
const savedRoomSizeLabel = computed(
  () => `${t(ROOM_SIZE_LABEL_KEY[device.roomSize])} (${ROOM_SIZE_SQM_RANGES[LETTER_TO_ROOM_SIZE[device.roomSize]]})`,
);
const savedSeerLabel = computed(() => device.seerValue || '—');
const savedCapacityLabel = computed(() => {
  const n = Number(device.coolingCapacity);
  return device.coolingCapacity && !Number.isNaN(n) ? `${formatNumber(n, 0)} BTU/h` : '—';
});
function egatText(label: EgatLabel | ''): string {
  return label === 'premium' ? t('information.premium') : t('information.stars', { n: label });
}
const savedEgatLabel = computed(() => (isThailand.value && device.starRating ? egatText(device.starRating) : '—'));

const EGAT_OPTIONS: EgatLabel[] = ['5', '4', '3', '2', '1', 'premium'];

async function loadConfig() {
  loading.value = true;
  loadError.value = false;
  try {
    const config = await withProgress(getRoomConfig);
    device.roomSize = ROOM_SIZE_TO_LETTER[config.room_size];
    device.starRating = config.egat_label ?? '';
    device.seerValue = String(config.ac_seer);
    device.coolingCapacity = config.rated_capacity_btu_per_hr !== null ? String(config.rated_capacity_btu_per_hr) : '';
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }

  await loadLocation();
}

onMounted(loadConfig);

async function extractErrorMessage(e: unknown): Promise<string> {
  // supabase-js throws a FunctionsHttpError whose `.context` is the raw
  // Response, read the edge function's actual { message } body when
  // available, so validation failures (e.g. SEER out of range) show the
  // real reason instead of a generic "try again".
  try {
    const context = (e as { context?: Response })?.context;
    if (context && typeof context.json === 'function') {
      const body = await context.json();
      if (typeof body?.message === 'string') return body.message;
    }
  } catch {
    // fall through to the generic message below
  }
  return t('information.saveError');
}

async function saveDevice() {
  saveError.value = false;
  saveErrorMessage.value = '';
  saveSuccess.value = false;

  const seer = Number(device.seerValue);
  if (!device.seerValue || Number.isNaN(seer) || seer < MIN_AC_SEER || seer > MAX_AC_SEER) {
    saveError.value = true;
    saveErrorMessage.value = t('information.seerOutOfRange', { min: MIN_AC_SEER, max: MAX_AC_SEER });
    return;
  }
  const capacity = device.coolingCapacity ? Number(device.coolingCapacity) : null;
  if (capacity !== null && (Number.isNaN(capacity) || capacity <= 0)) {
    saveError.value = true;
    saveErrorMessage.value = t('information.capacityInvalid');
    return;
  }

  saving.value = true;
  try {
    await withProgress(() =>
      updateRoomConfig({
        room_size: LETTER_TO_ROOM_SIZE[device.roomSize],
        ac_seer: seer,
        egat_label: isThailand.value && device.starRating ? device.starRating : null,
        rated_capacity_btu_per_hr: capacity,
      }),
    );
    saveSuccess.value = true;
    if (saveSuccessTimer) clearTimeout(saveSuccessTimer);
    saveSuccessTimer = setTimeout(() => (saveSuccess.value = false), SUCCESS_VISIBLE_MS);
  } catch (e) {
    saveError.value = true;
    saveErrorMessage.value = await extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

const selectClass =
  'w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md py-3 pl-4 pr-10 appearance-none';
const inputClass = 'w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md py-3 px-4';
const fieldWrapClass =
  'relative rounded-lg border border-outline-variant overflow-hidden transition-all bg-surface-container-lowest ' +
  'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20';
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Left Column: current setup -->
    <div
      v-if="!isDemoMode"
      class="lg:col-span-4"
    >
      <section
        v-if="!isDemoMode"
        class="bg-surface-container-lowest rounded-xl border border-outline-variant/50 shadow-card p-6"
      >
        <h2 class="text-headline-md text-primary mb-4 pb-2 border-b border-outline-variant/30">
          {{ t('information.roomContext') }}
        </h2>

        <div
          v-if="loading"
          class="flex flex-col gap-3"
          aria-hidden="true"
        >
          <div
            v-for="n in 4"
            :key="n"
            class="h-5 rounded bg-surface-container animate-pulse"
          />
        </div>
        <dl
          v-else
          class="grid grid-cols-2 gap-x-4 gap-y-2 text-label-md"
        >
          <dt class="text-on-surface-variant">
            {{ t('information.roomSize') }}
          </dt>
          <dd class="text-on-surface text-right">
            {{ savedRoomSizeLabel }}
          </dd>
          <dt class="text-on-surface-variant">
            {{ t('information.seerValue') }}
          </dt>
          <dd class="text-on-surface text-right">
            {{ savedSeerLabel }}
          </dd>
          <dt class="text-on-surface-variant">
            {{ t('information.coolingCapacity') }}
          </dt>
          <dd class="text-on-surface text-right">
            {{ savedCapacityLabel }}
          </dd>
          <template v-if="isThailand">
            <dt class="text-on-surface-variant">
              {{ t('information.energyLabel') }}
            </dt>
            <dd class="text-on-surface text-right">
              {{ savedEgatLabel }}
            </dd>
          </template>
        </dl>
      </section>
    </div>

    <!-- Right Column: Technical Specifications -->
    <div
      v-if="isDemoMode"
      class="lg:col-span-12"
    >
      <RoomManager />
    </div>
    <div
      v-else
      class="lg:col-span-8"
    >
      <section class="bg-surface-container-lowest rounded-xl border border-outline-variant/50 shadow-card overflow-hidden flex flex-col">
        <div class="px-6 py-5 border-b border-outline-variant/30 bg-surface-container-low/50">
          <h2 class="text-headline-md text-primary">
            {{ t('information.technicalSpecifications') }}
          </h2>
        </div>

        <form
          class="flex flex-col flex-1"
          :aria-busy="loading"
          @submit.prevent="saveDevice"
        >
          <div class="p-6 space-y-8 flex-1">
            <div
              v-if="loadError"
              class="flex flex-wrap items-center gap-3"
              role="alert"
            >
              <p class="text-label-md text-error">
                {{ t('information.loadError') }}
              </p>
              <button
                type="button"
                class="px-3 py-1.5 text-label-md rounded-lg border border-outline text-on-surface hover:bg-surface-container-low transition-colors"
                @click="loadConfig"
              >
                {{ t('common.retry') }}
              </button>
            </div>

            <div
              v-if="loading"
              class="space-y-8"
              aria-hidden="true"
            >
              <div
                v-for="n in 3"
                :key="n"
                class="space-y-2"
              >
                <div class="h-4 w-32 rounded bg-surface-container animate-pulse" />
                <div class="h-12 max-w-md rounded-lg bg-surface-container animate-pulse" />
              </div>
            </div>

            <template v-else>
              <fieldset class="space-y-3">
                <legend class="font-medium text-on-surface mb-3">
                  {{ t('information.roomSize') }}
                </legend>
                <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <label
                    v-for="opt in [
                      { v: 's', label: 'S', range: ROOM_SIZE_SQM_RANGES.small },
                      { v: 'm', label: 'M', range: ROOM_SIZE_SQM_RANGES.medium },
                      { v: 'l', label: 'L', range: ROOM_SIZE_SQM_RANGES.large },
                    ]"
                    :key="opt.v"
                    class="flex items-center gap-2 min-h-[44px] cursor-pointer"
                  >
                    <input
                      v-model="device.roomSize"
                      type="radio"
                      name="room_size"
                      :value="opt.v"
                      class="accent-primary w-4 h-4"
                    >
                    {{ opt.label }}
                    <span class="text-on-surface-variant text-label-md">({{ opt.range }})</span>
                  </label>
                </div>
              </fieldset>

              <div
                v-if="isThailand"
                class="space-y-2"
              >
                <label
                  for="info_egat"
                  class="block font-medium text-on-surface"
                >
                  {{ t('information.energyLabel') }} <span class="text-label-md font-normal text-on-surface-variant ml-1">{{ t('information.starsHint') }}</span>
                </label>
                <div
                  :class="fieldWrapClass"
                  class="relative max-w-md"
                >
                  <select
                    id="info_egat"
                    v-model="device.starRating"
                    :class="selectClass"
                  >
                    <option value="">
                      {{ t('information.selectStars') }}
                    </option>
                    <option
                      v-for="opt in EGAT_OPTIONS"
                      :key="opt"
                      :value="opt"
                    >
                      {{ egatText(opt) }}
                    </option>
                  </select>
                  <span
                    class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
                    aria-hidden="true"
                  >expand_more</span>
                </div>
              </div>

              <div class="space-y-2">
                <label
                  for="info_seer"
                  class="block font-medium text-on-surface"
                >{{ t('information.seerValue') }}</label>
                <div
                  :class="fieldWrapClass"
                  class="max-w-md"
                >
                  <input
                    id="info_seer"
                    v-model="device.seerValue"
                    type="text"
                    inputmode="decimal"
                    placeholder="e.g. 16.0"
                    :aria-invalid="saveError && !!saveErrorMessage"
                    :class="inputClass"
                  >
                </div>
              </div>

              <div class="space-y-2">
                <label
                  for="info_capacity"
                  class="block font-medium text-on-surface"
                >
                  {{ t('information.coolingCapacity') }} <span class="text-label-md font-normal text-on-surface-variant ml-1">{{ t('information.btuHint') }}</span>
                </label>
                <div
                  :class="fieldWrapClass"
                  class="max-w-md"
                >
                  <input
                    id="info_capacity"
                    v-model="device.coolingCapacity"
                    type="text"
                    inputmode="decimal"
                    placeholder="e.g. 12000"
                    :class="inputClass"
                  >
                </div>
              </div>
            </template>
          </div>

          <div class="px-6 py-4 bg-surface-container-low/50 border-t border-outline-variant/30 flex flex-wrap items-center justify-end gap-3">
            <span
              v-if="saveError"
              class="text-label-md text-error flex items-center gap-1"
              role="alert"
            >
              <span
                class="material-symbols-outlined text-[18px]"
                aria-hidden="true"
              >error</span>
              {{ saveErrorMessage }}
            </span>
            <span
              v-if="saveSuccess"
              class="text-label-md text-success flex items-center gap-1"
              role="status"
            >
              <span
                class="material-symbols-outlined text-[18px]"
                aria-hidden="true"
              >check_circle</span>
              {{ t('information.saveSuccess') }}
            </span>
            <button
              type="submit"
              :disabled="loading || saving"
              class="bg-primary text-on-primary text-label-md px-6 py-2.5 rounded-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <span
                class="material-symbols-outlined text-sm"
                aria-hidden="true"
              >save</span>
              {{ saving ? t('information.saving') : t('information.save') }}
            </button>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>
