import { ref, watch } from 'vue';
import { ALL_FLOORS, demoFloors, demoRooms, getFloor, isFloorId } from '../lib/mock/rooms';
import { isDemoMode } from '../lib/mock/mode';
import { t } from '../lib/i18n';

// Demo mode only: which floor the pages are looking at. 'all' sums every
// floor. The real backend has one room, so outside demo mode this stays at
// 'all' and the API wrappers ignore it.
const STORAGE_KEY = 'coolsense_demo_selected_floor';

function initial(): string {
  if (!isDemoMode) return ALL_FLOORS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isFloorId(stored)) return stored;
  } catch {
    // storage blocked, start on all floors
  }
  return ALL_FLOORS;
}

const selectedFloor = ref<string>(initial());

function setFloor(id: string) {
  selectedFloor.value = id === ALL_FLOORS || isFloorId(id) ? id : ALL_FLOORS;
  try {
    localStorage.setItem(STORAGE_KEY, selectedFloor.value);
  } catch {
    // keep the in-memory choice
  }
}

// A removed floor drops the selection back to all floors.
watch(demoFloors, () => {
  if (selectedFloor.value !== ALL_FLOORS && !isFloorId(selectedFloor.value)) setFloor(ALL_FLOORS);
});

export function useSelectedFloor() {
  return { selectedFloor, setFloor, ALL_FLOORS };
}

export function floorName(floorId: string): string {
  const floor = getFloor(floorId);
  if (!floor) return t('floors.all');
  return floor.nameKey ? t(floor.nameKey) : floor.name;
}

export function roomName(roomId: string): string {
  const room = demoRooms.value.find((r) => r.id === roomId);
  if (!room) return '';
  return room.nameKey ? t(room.nameKey) : room.name;
}

export function unitName(unit: { seq: number; label: string }): string {
  return unit.label.trim() || t('rooms.unitDefault', { n: unit.seq });
}
