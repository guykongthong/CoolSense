import { computed } from 'vue';
import { isDemoMode } from '../lib/mock/mode';
import { useLocation } from './useLocation';
import { currentBuilding } from './useSelectedBuilding';

// The location text of whatever building is current: the selected demo
// building, or the single saved room_config location in real mode.
export function useBuildingLocation() {
  const real = useLocation();
  const location = computed(() => (isDemoMode ? currentBuilding.value.location : real.location.value));
  // Same check the room-config function does server side.
  const isThailand = computed(() => location.value.trim().toLowerCase().includes('thailand'));
  return { location, isThailand };
}
