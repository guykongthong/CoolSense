<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useBuildings } from '../../composables/useBuildings';
import { useLocation } from '../../composables/useLocation';
import { currentBuilding } from '../../composables/useSelectedBuilding';
import { formatNumber } from '../../lib/format';
import { t } from '../../lib/i18n';
import { buildingWeather } from '../../lib/mock/buildings';
import { isDemoMode } from '../../lib/mock/mode';

const router = useRouter();
const { buildings, selectedBuildingId, setBuilding } = useBuildings();
const real = useLocation();

const root = ref<HTMLElement | null>(null);
const chip = ref<HTMLButtonElement | null>(null);
const open = ref(false);

const label = computed(() => (isDemoMode ? currentBuilding.value.name : real.location.value || t('building.setLocation')));
const temp = computed(() => {
  if (isDemoMode) return buildingWeather(currentBuilding.value.location).temp_c;
  return real.location.value && real.weather.value ? real.weather.value.temp_c : null;
});
const hasSwitcher = computed(() => isDemoMode && buildings.value.length > 1);

function pick(id: string) {
  setBuilding(id);
  open.value = false;
  chip.value?.focus();
}

function manage() {
  open.value = false;
  router.push('/settings');
}

function onDocClick(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (open.value && e.key === 'Escape') {
    open.value = false;
    chip.value?.focus();
  }
}

onMounted(() => {
  if (!isDemoMode) real.loadLocation();
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKey);
});

const chipClass = 'min-h-11 min-w-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-label-md text-on-surface max-w-56';
</script>

<template>
  <div
    ref="root"
    class="relative"
  >
    <button
      v-if="hasSwitcher"
      ref="chip"
      type="button"
      :class="chipClass"
      :aria-expanded="open"
      aria-haspopup="true"
      aria-controls="building-switcher"
      :aria-label="`${t('building.chipLabel')}: ${label}`"
      @click="open = !open"
    >
      <span
        class="material-symbols-outlined text-primary text-[20px] shrink-0"
        aria-hidden="true"
      >location_on</span>
      <span class="hidden sm:inline truncate">{{ label }}<template v-if="temp !== null"> · {{ formatNumber(temp, 0) }}°C</template></span>
    </button>
    <RouterLink
      v-else
      to="/settings"
      :class="chipClass"
      :aria-label="`${t('building.chipLabel')}: ${label}`"
    >
      <span
        class="material-symbols-outlined text-primary text-[20px] shrink-0"
        aria-hidden="true"
      >location_on</span>
      <span class="hidden sm:inline truncate">{{ label }}<template v-if="temp !== null"> · {{ formatNumber(temp, 0) }}°C</template></span>
    </RouterLink>

    <div
      v-if="open"
      id="building-switcher"
      role="group"
      :aria-label="t('building.switcherLabel')"
      class="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] z-50 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-card p-2 flex flex-col"
    >
      <button
        v-for="b in buildings"
        :key="b.id"
        type="button"
        class="min-h-11 px-3 rounded-lg text-left flex items-center gap-2 text-label-md hover:bg-surface-container-low"
        :class="b.id === selectedBuildingId ? 'text-primary font-bold' : 'text-on-surface'"
        :aria-current="b.id === selectedBuildingId ? 'true' : undefined"
        @click="pick(b.id)"
      >
        <span
          class="material-symbols-outlined text-[20px]"
          aria-hidden="true"
        >{{ b.id === selectedBuildingId ? 'check' : 'apartment' }}</span>
        <span class="flex-1 min-w-0">
          <span class="block truncate">{{ b.name }}</span>
          <span class="block truncate text-label-sm text-on-surface-variant font-normal">{{ b.location }}</span>
        </span>
      </button>
      <button
        type="button"
        class="min-h-11 px-3 mt-1 border-t border-outline-variant/40 text-left text-label-md text-primary hover:bg-surface-container-low rounded-b-lg"
        @click="manage"
      >
        {{ t('building.manage') }}
      </button>
    </div>
  </div>
</template>
