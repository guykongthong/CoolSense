// Demo-only buildings. The real backend has one room_config location, so none
// of this is sent anywhere.
import { ref } from 'vue';

export const DEFAULT_BUILDING_ID = 'main';

const STORAGE_KEY = 'coolsense_demo_buildings_v1';

export interface Building {
  id: string;
  name: string;
  location: string;
}

const SEED: Building[] = [{ id: DEFAULT_BUILDING_ID, name: 'Main Building', location: 'Bangkok, Thailand' }];

function load(): Building[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const list = parsed
          .filter((b): b is Building => typeof b === 'object' && b !== null && typeof b.id === 'string' && typeof b.name === 'string')
          .map((b) => ({ id: b.id, name: b.name, location: typeof b.location === 'string' ? b.location : '' }));
        if (list.length > 0) return list;
      }
    }
  } catch {
    // unreadable storage, use the seed
  }
  return SEED.map((b) => ({ ...b }));
}

export const demoBuildings = ref<Building[]>(load());

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoBuildings.value));
  } catch {
    // storage may be blocked, the in-memory copy still works
  }
}

export function getBuilding(id: string): Building | undefined {
  return demoBuildings.value.find((b) => b.id === id);
}

export function addBuilding(name: string, location: string): Building {
  const building: Building = {
    id: `bld-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    name: name.trim(),
    location: location.trim(),
  };
  demoBuildings.value = [...demoBuildings.value, building];
  persist();
  return building;
}

export function updateBuilding(id: string, patch: { name?: string; location?: string }) {
  demoBuildings.value = demoBuildings.value.map((b) =>
    b.id === id
      ? { ...b, name: patch.name !== undefined ? patch.name.trim() || b.name : b.name, location: patch.location !== undefined ? patch.location.trim() : b.location }
      : b,
  );
  persist();
}

// The last building stays.
export function removeBuilding(id: string): boolean {
  if (demoBuildings.value.length <= 1 || !getBuilding(id)) return false;
  demoBuildings.value = demoBuildings.value.filter((b) => b.id !== id);
  persist();
  return true;
}

// ---- Mock weather per building ----

export type WeatherKind = 'sunny' | 'cloudy' | 'humid' | 'mild' | 'cool';

export interface BuildingWeather {
  temp_c: number;
  humidity_pct: number;
  kind: WeatherKind;
}

// Known cities get a believable climate, anything else is spread out from a
// hash of the text so the same location always shows the same weather.
const CITY_CLIMATES: [string, number, number][] = [
  ['bangkok', 32, 72],
  ['phuket', 31, 78],
  ['chiang mai', 29, 62],
  ['pattaya', 31, 74],
  ['singapore', 31, 80],
  ['tokyo', 19, 60],
  ['seoul', 16, 55],
  ['london', 12, 78],
  ['new york', 17, 60],
  ['dubai', 39, 45],
];

const THAI_PROVINCE_CLIMATES: [string, number, number][] = [
  ['bangkok', 32, 72],
  ['chiang mai', 29, 62],
  ['chiang rai', 28, 64],
  ['phuket', 31, 78],
  ['chon buri', 31, 74],
  ['khon kaen', 31, 65],
  ['songkhla', 31, 76],
  ['nakhon ratchasima', 31, 63],
];

function hashText(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 100003;
  return h;
}

export function buildingWeather(location: string): BuildingWeather {
  const text = location.trim().toLowerCase();
  const inThailand = text.includes('thailand');
  const city = inThailand ? undefined : CITY_CLIMATES.find(([name]) => text.includes(name));
  let temp: number;
  let humidity: number;
  if (city) {
    temp = city[1];
    humidity = city[2];
  } else if (inThailand) {
    // "District, Province, Thailand": the province sets the climate, the
    // district nudges it a couple of degrees so nearby areas differ.
    const parts = text.split(',').map((p) => p.trim());
    const province = parts.length >= 2 ? parts[parts.length - 2] : '';
    const area = parts.length >= 3 ? parts.slice(0, -2).join(',') : '';
    const base = THAI_PROVINCE_CLIMATES.find(([name]) => name === province);
    const seed = hashText(province);
    temp = base ? base[1] : 29 + (seed % 4);
    humidity = base ? base[2] : 62 + (seed % 14);
    if (area) {
      const h = hashText(area);
      temp += (h % 5) - 2 + ((h >> 4) % 2);
      humidity += ((h >> 2) % 9) - 4;
    }
  } else {
    const h = hashText(text);
    temp = 14 + (h % 20);
    humidity = 45 + ((h >> 3) % 40);
  }
  const kind: WeatherKind =
    temp >= 34 ? 'sunny' : temp >= 28 ? (humidity >= 75 ? 'humid' : 'cloudy') : temp >= 20 ? 'mild' : 'cool';
  return { temp_c: temp, humidity_pct: humidity, kind };
}
