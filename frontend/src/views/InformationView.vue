<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getRoomConfig, ROOM_SIZE_SQM_RANGES, type RoomSize, updateRoomConfig } from '../lib/api';
import { t } from '../lib/i18n';
import { withProgress } from '../lib/progress';
import { ROOM_IDS, type RoomId } from '../lib/rooms';

// Static UI matching the design comp for now — same approach as the People
// page. Several fields here have no backing data/schema yet:
//   - "Select Room" (multi-room) — room_config is a single-room singleton today
//   - "Active Device" block — no device table exists
//   - Korean-AC grade — not modeled in acCalculation.ts or room_config, and
//     deliberately not wired (mirrors the Thailand EGAT label precedent:
//     cosmetic efficiency grades don't affect the calculation). Stays
//     local-only, never sent to the backend.
// Cooling Capacity DOES map to room_config.rated_capacity_btu_per_hr and
// actually affects the calculation now — see runCalculation.ts's
// applyCapacityCeiling: if it's lower than the computed required BTU/hr,
// the unit is capacity-constrained (runs at its own max, flagged rather
// than silently under-cooling).
// Only the first device maps to the real room_config singleton — "Add
// Device" stays decorative until multi-room/multi-device is actually
// modeled server-side.
const selectedRoom = ref<RoomId>(ROOM_IDS[0]);

const ROOM_SIZE_TO_LETTER: Record<RoomSize, 's' | 'm' | 'l'> = { small: 's', medium: 'm', large: 'l' };
const LETTER_TO_ROOM_SIZE: Record<'s' | 'm' | 'l', RoomSize> = { s: 'small', m: 'medium', l: 'large' };

interface DeviceSpec {
  id: number;
  roomSize: 's' | 'm' | 'l';
  starRating: string;
  seerValue: string;
  coolingCapacity: string;
  isKoreanAc: boolean;
  krEfficiencyGrade: string;
}

let nextDeviceId = 1;
function createDevice(): DeviceSpec {
  return {
    id: nextDeviceId++,
    roomSize: 'm',
    starRating: '',
    seerValue: '',
    coolingCapacity: '',
    isKoreanAc: false,
    krEfficiencyGrade: '',
  };
}

const devices = ref<DeviceSpec[]>([createDevice()]);

function addDevice() {
  devices.value.push(createDevice());
}
function removeDevice(id: number) {
  devices.value = devices.value.filter((d) => d.id !== id);
}

// EGAT label is Thailand-only server-side (room-config's isThailand check) —
// mirrored here so the field only shows when it'd actually be accepted.
const roomLocation = ref('');
const isThailand = computed(() => roomLocation.value.trim().toLowerCase().includes('thailand'));

const loading = ref(true);
const saving = ref(false);
const loadError = ref(false);
const saveError = ref(false);
const saveErrorMessage = ref('');
const saveSuccess = ref(false);

// Mirrors room-config's own MIN_AC_SEER/MAX_AC_SEER — real-world
// manufacturer SEER range, now that the live calculation runs CoolSense V3
// (realistic SEER + BTU/m² physics) instead of V2's placeholder-calibrated
// STANDARD_SEER=4.5.
const MIN_AC_SEER = 13;
const MAX_AC_SEER = 25;

const ROOM_SIZE_LABEL_KEY: Record<'s' | 'm' | 'l', string> = { s: 'common.small', m: 'common.medium', l: 'common.large' };
const primaryDevice = computed(() => devices.value[0]);
const savedRoomSizeLabel = computed(
  () =>
    `${t(ROOM_SIZE_LABEL_KEY[primaryDevice.value.roomSize])} (${
      ROOM_SIZE_SQM_RANGES[LETTER_TO_ROOM_SIZE[primaryDevice.value.roomSize]]
    })`,
);
const savedSeerLabel = computed(() => primaryDevice.value.seerValue || '—');
const savedCapacityLabel = computed(() =>
  primaryDevice.value.coolingCapacity ? `${primaryDevice.value.coolingCapacity} BTU/h` : '—',
);
const savedEgatLabel = computed(() =>
  isThailand.value && primaryDevice.value.starRating ? t('information.stars', { n: primaryDevice.value.starRating }) : '—',
);

onMounted(async () => {
  try {
    const config = await withProgress(getRoomConfig);
    roomLocation.value = config.location;
    const primary = devices.value[0];
    primary.roomSize = ROOM_SIZE_TO_LETTER[config.room_size];
    primary.starRating = config.egat_label && config.egat_label !== 'premium' ? config.egat_label : '';
    primary.seerValue = String(config.ac_seer);
    primary.coolingCapacity = config.rated_capacity_btu_per_hr !== null ? String(config.rated_capacity_btu_per_hr) : '';
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
});

async function extractErrorMessage(e: unknown): Promise<string> {
  // supabase-js throws a FunctionsHttpError whose `.context` is the raw
  // Response — read the edge function's actual { message } body when
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

async function saveDevice(idx: number) {
  // Only the first device is real (see note above) — others are local UI
  // state only, nothing to save.
  if (idx !== 0) return;

  const device = devices.value[0];
  saveError.value = false;
  saveErrorMessage.value = '';
  saveSuccess.value = false;

  const seer = Number(device.seerValue);
  if (!device.seerValue || Number.isNaN(seer) || seer < MIN_AC_SEER || seer > MAX_AC_SEER) {
    saveError.value = true;
    saveErrorMessage.value = t('information.seerOutOfRange', { min: MIN_AC_SEER, max: MAX_AC_SEER });
    return;
  }

  saving.value = true;
  try {
    await withProgress(() =>
      updateRoomConfig({
        room_size: LETTER_TO_ROOM_SIZE[device.roomSize],
        ac_seer: seer,
        egat_label: isThailand.value && device.starRating ? (device.starRating as '3' | '4' | '5') : null,
        rated_capacity_btu_per_hr: device.coolingCapacity ? Number(device.coolingCapacity) : null,
      }),
    );
    saveSuccess.value = true;
  } catch (e) {
    saveError.value = true;
    saveErrorMessage.value = await extractErrorMessage(e);
  } finally {
    saving.value = false;
  }
}

const selectClass =
  'w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md py-3 pl-4 pr-10 appearance-none';
const fieldWrapClass =
  'relative rounded-lg border border-outline-variant overflow-hidden transition-all bg-white ' +
  'focus-within:border-[#10B981] focus-within:shadow-[0_0_0_2px_rgba(16,185,129,0.2)]';
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Left Column: Room Context -->
    <div class="lg:col-span-4">
      <section class="bg-white rounded-xl border border-outline-variant/50 shadow-[0_4px_20px_rgba(6,78,59,0.05)] p-6">
        <h2 class="text-headline-md text-primary mb-4 pb-2 border-b border-outline-variant/30">
          {{ t('information.roomContext') }}
        </h2>

        <label class="block text-label-md text-on-surface-variant mb-2">{{ t('information.selectRoom') }}</label>
        <div class="flex flex-col gap-1.5">
          <button
            v-for="id in ROOM_IDS"
            :key="id"
            type="button"
            class="w-full text-left px-4 py-2.5 rounded-lg text-label-md transition-colors"
            :class="
              selectedRoom === id
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
            "
            @click="selectedRoom = id"
          >
            {{ t(`rooms.${id}`) }}
          </button>
        </div>

        <div class="mt-6 pt-6 border-t border-outline-variant/30">
          <div class="flex items-center justify-between mb-2">
            <span class="text-label-sm text-on-surface-variant uppercase tracking-wider">{{ t('information.activeDevice') }}</span>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-tertiary-container text-on-tertiary-container">
              {{ t('information.online') }}
            </span>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary">
              <span class="material-symbols-outlined text-2xl">air</span>
            </div>
            <div>
              <h3 class="text-label-md text-on-surface">
                {{ t('information.hvacUnit') }}
              </h3>
              <p class="text-label-sm text-on-surface-variant">
                {{ t('information.lastSynced') }}
              </p>
            </div>
          </div>

          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-label-sm">
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
        </div>
      </section>
    </div>

    <!-- Right Column: Technical Specifications (one box per registered AC unit) -->
    <div class="lg:col-span-8 flex flex-col gap-6">
      <section
        v-for="(device, idx) in devices"
        :key="device.id"
        class="bg-white rounded-xl border border-outline-variant/50 shadow-[0_4px_20px_rgba(6,78,59,0.05)] overflow-hidden flex flex-col"
      >
        <div class="px-6 py-5 border-b border-outline-variant/30 bg-surface-container-low/50 flex items-center justify-between">
          <h2 class="text-headline-md text-primary">
            {{ t('information.technicalSpecifications') }}
            <span
              v-if="devices.length > 1"
              class="text-label-md text-on-surface-variant font-normal ml-2"
            >{{ t('information.device', { n: idx + 1 }) }}</span>
          </h2>
          <button
            v-if="devices.length > 1"
            type="button"
            class="text-label-sm text-error hover:underline"
            @click="removeDevice(device.id)"
          >
            {{ t('information.remove') }}
          </button>
        </div>

        <form
          class="flex flex-col flex-1"
          @submit.prevent="saveDevice(idx)"
        >
          <div class="p-6 space-y-8 flex-1">
            <p
              v-if="idx === 0 && loadError"
              class="text-label-sm text-error"
            >
              {{ t('information.loadError') }}
            </p>
            <div class="space-y-3">
              <label class="block font-medium text-on-surface">{{ t('information.roomSize') }}</label>
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-2">
                  <input
                    v-model="device.roomSize"
                    type="radio"
                    value="s"
                    class="accent-[#003527] w-4 h-4"
                  > S <span class="text-on-surface-variant text-label-sm">({{ ROOM_SIZE_SQM_RANGES.small }})</span>
                </label>
                <label class="flex items-center gap-2">
                  <input
                    v-model="device.roomSize"
                    type="radio"
                    value="m"
                    class="accent-[#003527] w-4 h-4"
                  > M <span class="text-on-surface-variant text-label-sm">({{ ROOM_SIZE_SQM_RANGES.medium }})</span>
                </label>
                <label class="flex items-center gap-2">
                  <input
                    v-model="device.roomSize"
                    type="radio"
                    value="l"
                    class="accent-[#003527] w-4 h-4"
                  > L <span class="text-on-surface-variant text-label-sm">({{ ROOM_SIZE_SQM_RANGES.large }})</span>
                </label>
              </div>
            </div>

            <div
              v-if="isThailand"
              class="space-y-2"
            >
              <label class="block font-medium text-on-surface">
                {{ t('information.energyLabel') }} <span class="text-sm font-normal text-on-surface-variant ml-1">{{ t('information.starsHint') }}</span>
              </label>
              <div
                :class="fieldWrapClass"
                class="relative max-w-md"
              >
                <select
                  v-model="device.starRating"
                  :class="selectClass"
                >
                  <option value="">
                    {{ t('information.selectStars') }}
                  </option>
                  <option value="5">
                    {{ t('information.stars', { n: 5 }) }}
                  </option>
                  <option value="4">
                    {{ t('information.stars', { n: 4 }) }}
                  </option>
                  <option value="3">
                    {{ t('information.stars', { n: 3 }) }}
                  </option>
                </select>
                <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">expand_more</span>
              </div>
            </div>

            <div class="space-y-2">
              <label class="flex items-center gap-2 font-medium text-on-surface">
                <input
                  v-model="device.isKoreanAc"
                  type="checkbox"
                  class="accent-[#003527] w-4 h-4 rounded"
                >
                {{ t('information.koreanAc') }}
              </label>
              <div
                v-if="device.isKoreanAc"
                class="pt-1"
              >
                <label class="block font-medium text-on-surface mb-2">{{ t('information.krEfficiencyGrade') }}</label>
                <div
                  :class="fieldWrapClass"
                  class="relative max-w-md"
                >
                  <select
                    v-model="device.krEfficiencyGrade"
                    :class="selectClass"
                  >
                    <option value="">
                      {{ t('information.selectGrade') }}
                    </option>
                    <option
                      v-for="grade in ['1', '2', '3', '4', '5']"
                      :key="grade"
                      :value="grade"
                    >
                      {{ t('information.grade', { n: grade }) }}
                    </option>
                  </select>
                  <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">expand_more</span>
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <label class="block font-medium text-on-surface">{{ t('information.seerValue') }}</label>
              <div
                :class="fieldWrapClass"
                class="max-w-md"
              >
                <input
                  v-model="device.seerValue"
                  type="number"
                  step="0.1"
                  min="13"
                  max="25"
                  placeholder="e.g. 16.0"
                  class="w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md py-3 px-4"
                >
              </div>
            </div>

            <div class="space-y-2">
              <label class="block font-medium text-on-surface">
                {{ t('information.coolingCapacity') }} <span class="text-sm font-normal text-on-surface-variant ml-1">{{ t('information.btuHint') }}</span>
              </label>
              <div
                :class="fieldWrapClass"
                class="max-w-md"
              >
                <input
                  v-model="device.coolingCapacity"
                  type="number"
                  placeholder="e.g. 12000"
                  class="w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md py-3 px-4"
                >
              </div>
            </div>
          </div>

          <div class="px-6 py-4 bg-surface-container-low/50 border-t border-outline-variant/30 flex items-center justify-end gap-3">
            <span
              v-if="idx === 0 && saveError"
              class="text-label-sm text-error"
            >{{ saveErrorMessage }}</span>
            <span
              v-if="idx === 0 && saveSuccess"
              class="text-label-sm text-primary"
            >{{ t('information.saveSuccess') }}</span>
            <button
              type="submit"
              :disabled="idx === 0 && (loading || saving)"
              class="bg-primary text-on-primary text-label-md px-6 py-2.5 rounded-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <span class="material-symbols-outlined text-sm">save</span>
              {{ idx === 0 && saving ? t('information.saving') : t('information.save') }}
            </button>
          </div>
        </form>
      </section>

      <div class="flex justify-end">
        <button
          type="button"
          class="border border-dashed border-primary text-primary text-label-md px-6 py-2.5 rounded-lg hover:bg-secondary-fixed transition-colors flex items-center gap-2"
          @click="addDevice"
        >
          <span class="material-symbols-outlined text-sm">add</span>
          {{ t('information.addDevice') }}
        </button>
      </div>
    </div>
  </div>
</template>
