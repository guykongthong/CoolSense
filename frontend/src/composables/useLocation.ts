import { computed, ref } from 'vue';
import { fetchWeather, getRoomConfig, updateRoomConfig, type WeatherReading } from '../lib/api';

// The building location and the live weather for it. Shared so the header
// menu and the pages (EGAT label is Thailand-only) read the same values.
const location = ref('');
const loaded = ref(false);
const weather = ref<WeatherReading | null>(null);
const weatherLoading = ref(false);
const weatherError = ref(false);

// Mirrors room-config's server-side isThailand check, so the EGAT field only
// shows when it would be accepted.
const isThailand = computed(() => location.value.trim().toLowerCase().includes('thailand'));

async function loadWeather() {
  weatherError.value = false;
  weatherLoading.value = true;
  try {
    weather.value = await fetchWeather();
  } catch {
    weatherError.value = true;
  } finally {
    weatherLoading.value = false;
  }
}

let loading: Promise<void> | null = null;

// Reads the saved location once, then fetches the weather for it.
function loadLocation(): Promise<void> {
  if (loaded.value) return Promise.resolve();
  if (!loading) {
    loading = getRoomConfig()
      .then(async (config) => {
        location.value = config.location;
        loaded.value = true;
        if (config.location.trim()) await loadWeather();
      })
      .catch(() => undefined)
      .finally(() => (loading = null));
  }
  return loading;
}

// weatherapi.com is queried by the SAVED location, so the weather is fetched
// again once the save has landed.
async function saveLocation(next: string) {
  await updateRoomConfig({ location: next.trim() });
  location.value = next.trim();
  if (location.value) await loadWeather();
  else weather.value = null;
}

export function useLocation() {
  return { location, loaded, weather, weatherLoading, weatherError, isThailand, loadLocation, loadWeather, saveLocation };
}
