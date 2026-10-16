<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AddBuildingForm from '../components/settings/AddBuildingForm.vue';
import BuildingCard, { type WeatherView } from '../components/settings/BuildingCard.vue';
import { useBuildings } from '../composables/useBuildings';
import { useLocation } from '../composables/useLocation';
import { t } from '../lib/i18n';
import { buildingWeather } from '../lib/mock/buildings';
import { isDemoMode } from '../lib/mock/mode';
import { withProgress } from '../lib/progress';

const { buildings, selectedBuildingId, setBuilding, add, update, remove } = useBuildings();
const real = useLocation();

const notice = ref('');
const savingId = ref('');
const errorText = ref('');
const cards = ref<Record<string, InstanceType<typeof BuildingCard> | null>>({});

function weatherFor(location: string): WeatherView | null {
  if (!location.trim()) return null;
  const w = buildingWeather(location);
  return { temp: w.temp_c, humidity: w.humidity_pct, label: t(`building.cond.${w.kind}`) };
}

function onSave(id: string, name: string, location: string) {
  update(id, { name, location });
  cards.value[id]?.closeEdit();
}

function onCreate(name: string, location: string) {
  add(name, location);
}

function onSwitch(id: string, name: string) {
  setBuilding(id);
  notice.value = t('settings.switched', { name });
}

const realWeather = computed<WeatherView | null>(() => {
  const w = real.weather.value;
  return w ? { temp: w.temp_c, humidity: w.humidity_pct, label: w.condition } : null;
});
const realState = computed(() =>
  real.weatherLoading.value ? 'loading' : real.weatherError.value ? 'error' : realWeather.value ? 'ok' : 'none',
);

async function saveReal(_name: string, location: string) {
  savingId.value = 'real';
  errorText.value = '';
  try {
    await withProgress(() => real.saveLocation(location));
    cards.value.real?.closeEdit();
  } catch {
    errorText.value = t('settings.saveError');
  } finally {
    savingId.value = '';
  }
}

onMounted(() => {
  if (!isDemoMode) real.loadLocation();
});
</script>

<template>
  <section
    class="flex flex-col gap-4"
    aria-labelledby="buildings_heading"
  >
    <div>
      <h3
        id="buildings_heading"
        class="text-headline-md text-on-surface"
      >
        {{ t('settings.buildings') }}
      </h3>
      <p class="text-body-md text-on-surface-variant">
        {{ isDemoMode ? t('settings.buildingsHelp') : t('settings.realHelp') }}
      </p>
    </div>

    <p
      v-if="notice"
      class="text-label-md text-success flex items-center gap-1"
      role="status"
    >
      <span
        class="material-symbols-outlined text-[18px]"
        aria-hidden="true"
      >check_circle</span>
      {{ notice }}
    </p>

    <template v-if="isDemoMode">
      <BuildingCard
        v-for="b in buildings"
        :key="b.id"
        :ref="(el) => (cards[b.id] = el as InstanceType<typeof BuildingCard> | null)"
        :name="b.name"
        :location="b.location"
        :current="b.id === selectedBuildingId"
        :can-delete="buildings.length > 1"
        :can-switch="true"
        :weather="weatherFor(b.location)"
        :weather-state="b.location.trim() ? 'ok' : 'none'"
        @save="(name, location) => onSave(b.id, name, location)"
        @remove="remove(b.id)"
        @switch="onSwitch(b.id, b.name)"
      />
      <AddBuildingForm @create="onCreate" />
    </template>

    <BuildingCard
      v-else
      :ref="(el) => (cards.real = el as InstanceType<typeof BuildingCard> | null)"
      name=""
      :location="real.location.value"
      single
      :weather="realWeather"
      :weather-state="realState"
      :saving="savingId === 'real'"
      :error="errorText"
      @save="saveReal"
    />
  </section>
</template>
