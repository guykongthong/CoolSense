<script setup lang="ts">
import { ref } from 'vue';
import { t } from '../lib/i18n';
import { ROOM_IDS, type RoomId } from '../lib/rooms';

// Static UI matching the design comp for now — same approach as the People
// page. Several fields here have no backing data/schema yet:
//   - "Select Room" (multi-room) — room_config is a single-room singleton today
//   - "Active Device" block — no device table exists
//   - "Cooling Capacity (BTU/h)" / "Inverter / Fixed Speed" — not modeled in
//     acCalculation.ts or room_config; BTU/hr today is derived, not entered
// Fields that DO map to real room_config columns (room_size, egat_label,
// ac_seer) are left unwired here too, so this page's behavior stays
// consistent with the People page until we decide how (or whether) to
// extend the backend for multi-room support.
const selectedRoom = ref<RoomId>(ROOM_IDS[0]);

interface DeviceSpec {
  id: number;
  roomSize: 's' | 'm' | 'l';
  starRating: string;
  seerValue: string;
  coolingCapacity: string;
  deviceType: 'inverter' | 'fixed';
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
    deviceType: 'inverter',
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
          @submit.prevent
        >
          <div class="p-6 space-y-8 flex-1">
            <div class="space-y-3">
              <label class="block font-medium text-on-surface">{{ t('information.roomSize') }}</label>
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-2">
                  <input
                    v-model="device.roomSize"
                    type="radio"
                    value="s"
                    class="accent-[#003527] w-4 h-4"
                  > S
                </label>
                <label class="flex items-center gap-2">
                  <input
                    v-model="device.roomSize"
                    type="radio"
                    value="m"
                    class="accent-[#003527] w-4 h-4"
                  > M
                </label>
                <label class="flex items-center gap-2">
                  <input
                    v-model="device.roomSize"
                    type="radio"
                    value="l"
                    class="accent-[#003527] w-4 h-4"
                  > L
                </label>
              </div>
            </div>

            <div class="space-y-2">
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
                  placeholder="e.g. 15.0"
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

            <div class="space-y-3">
              <label class="block font-medium text-on-surface">{{ t('information.inverterFixed') }}</label>
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-2">
                  <input
                    v-model="device.deviceType"
                    type="radio"
                    value="inverter"
                    class="accent-[#003527] w-4 h-4"
                  > {{ t('information.inverter') }}
                </label>
                <label class="flex items-center gap-2">
                  <input
                    v-model="device.deviceType"
                    type="radio"
                    value="fixed"
                    class="accent-[#003527] w-4 h-4"
                  > {{ t('information.fixedSpeed') }}
                </label>
              </div>
            </div>
          </div>

          <div class="px-6 py-4 bg-surface-container-low/50 border-t border-outline-variant/30 flex justify-end">
            <button
              type="submit"
              class="bg-primary text-on-primary text-label-md px-6 py-2.5 rounded-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2"
            >
              <span class="material-symbols-outlined text-sm">save</span>
              {{ t('information.save') }}
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
