import { computed, ref, watch } from 'vue';
import { demoBuildings, getBuilding } from '../lib/mock/buildings';
import { setActiveBuilding } from '../lib/mock/rooms';

// Demo mode only: which building the pages are looking at. Falls back to the
// first building when the saved one is gone.
const STORAGE_KEY = 'coolsense_demo_selected_building';

function initial(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && getBuilding(stored)) return stored;
  } catch {
    // storage blocked, start on the first building
  }
  return demoBuildings.value[0].id;
}

export const selectedBuildingId = ref<string>(initial());

// rooms.ts can't import this file (it would be a cycle), so it is told.
watch(selectedBuildingId, setActiveBuilding, { immediate: true });

export const currentBuilding = computed(() => getBuilding(selectedBuildingId.value) ?? demoBuildings.value[0]);

export function setBuilding(id: string) {
  selectedBuildingId.value = getBuilding(id) ? id : demoBuildings.value[0].id;
  try {
    localStorage.setItem(STORAGE_KEY, selectedBuildingId.value);
  } catch {
    // keep the in-memory choice
  }
}

// A removed building drops the selection back to the first one.
watch(demoBuildings, () => {
  if (!getBuilding(selectedBuildingId.value)) setBuilding(demoBuildings.value[0].id);
});

export function useSelectedBuilding() {
  return { selectedBuildingId, currentBuilding, setBuilding };
}
