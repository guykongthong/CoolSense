import type {
  AcCalculation,
  AcMode,
  GenerateMockDataResult,
  OccupancyPeak,
  OccupancyReading,
  OccupancyVisionResult,
  OperatingHoursSchedule,
  RoomConfig,
  RoomConfigUpdate,
  RoomSize,
  SimulationHourlyRow,
  SimulationListItem,
  SimulationRun,
  SimulationRunResult,
  SimulationSummary,
  WeatherCondition,
  WeatherReading,
} from '../api';
import {
  CO2_PER_KWH,
  MS_PER_HOUR,
  MS_PER_MIN,
  isoAt,
  powerAt,
  ROOM_SQM,
  round,
  type Weather,
  weatherAt,
  weatherLabel,
} from './model';
import type { MaintenanceSeverity } from '../maintenanceApi';
import { mockListAlerts, mockUnitSeverity } from './maintenance';
import {
  ALL_FLOORS,
  floorsInScope,
  roomAverageSeer,
  roomPeakPeople,
  roomPeopleAt,
  roomsInScope,
  roomSqm,
  unitPowerAt,
  type DemoFloor,
  type DemoRoom,
  type DemoUnit,
} from './rooms';

const CONFIG_KEY = 'coolsense_demo_room_config';
const LIVE_NOISE_MS = 4000;
const LIVE_INTERVAL_MS = 4000;

// ---- Room config (in memory, mirrored to localStorage) ----

const DEFAULT_CONFIG: RoomConfig = {
  id: 1,
  building_name: 'Sathorn Office Tower, Floor 12',
  room_size: 'medium',
  location: 'Bangkok, Thailand',
  ac_seer: 15,
  egat_label: '5',
  comfort_preference: 'neutral',
  rated_capacity_btu_per_hr: 24000,
  updated_at: new Date().toISOString(),
};

function loadConfig(): RoomConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // ignore unreadable storage and use the defaults
  }
  return { ...DEFAULT_CONFIG };
}

let config = loadConfig();

export function mockGetRoomConfig(): RoomConfig {
  return { ...config };
}

export function mockUpdateRoomConfig(update: RoomConfigUpdate): RoomConfig {
  config = { ...config, ...update, updated_at: new Date().toISOString() };
  if (!config.location.toLowerCase().includes('thailand')) config.egat_label = null;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // storage may be blocked, the in-memory copy still works
  }
  return { ...config };
}

// ---- Live readings ----
// Every function below takes an optional scope: 'all' (the default) sums the
// floors, a floor id looks at that floor's rooms only.

let readingCounter = 0;

function peopleInScope(ms: number, scope: string, noiseBlockMs?: number): number {
  return roomsInScope(scope).reduce((sum, room) => sum + roomPeopleAt(room, ms, noiseBlockMs), 0);
}

function readingAt(ms: number, scope: string): OccupancyReading {
  readingCounter += 1;
  return {
    id: `demo-reading-${readingCounter}`,
    people_count: peopleInScope(ms, scope, LIVE_NOISE_MS),
    source: 'camera_gemini',
    captured_at: isoAt(ms),
  };
}

export function mockLatestReading(scope: string = ALL_FLOORS): OccupancyReading {
  return readingAt(Date.now(), scope);
}

export function mockPeak(scope: string = ALL_FLOORS): OccupancyPeak {
  const now = Date.now();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  let best = { people_count: 0, ms: 0 };
  for (let ms = start.getTime(); ms <= now; ms += 5 * MS_PER_MIN) {
    const n = peopleInScope(ms, scope);
    if (n > best.people_count) best = { people_count: n, ms };
  }
  if (best.people_count === 0) return { people_count: 0, captured_at: null };
  return { people_count: best.people_count, captured_at: isoAt(best.ms) };
}

export function mockPostReading(peopleCount: number, source: string): OccupancyReading {
  readingCounter += 1;
  return { id: `demo-reading-${readingCounter}`, people_count: peopleCount, source, captured_at: new Date().toISOString() };
}

// There is no camera analysis in demo mode, so a photo just gets the
// current simulated headcount.
export function mockPhoto(scope: string = ALL_FLOORS): OccupancyVisionResult {
  const reading = readingAt(Date.now(), scope);
  return { people_count: reading.people_count, reading };
}

export function mockWeather(): WeatherReading {
  const now = Date.now();
  const w = weatherAt(now);
  return {
    id: `demo-weather-${Math.floor(now / MS_PER_HOUR)}`,
    location: config.location,
    temp_c: w.temp_c,
    humidity_pct: w.humidity_pct,
    condition: w.temp_c >= 34 ? 'Sunny' : w.humidity_pct >= 78 ? 'Partly cloudy, humid' : 'Partly cloudy',
    condition_icon_url: null,
    fetched_at: isoAt(now),
  };
}

const MODE_BASE_TEMP = { eco: 26, moderate: 24, full: 21 } as const;
const MODE_RANK = { eco: 0, moderate: 1, full: 2 } as const;
const MODES = ['eco', 'moderate', 'full'] as const;

interface RoomPoint {
  people: number;
  mode: (typeof MODES)[number];
  setpointC: number;
  kw: number;
  baselineKw: number;
  btu: number;
  constrained: boolean;
}

// One room at one moment: unit powers add up to the room's power.
function roomPointAt(room: DemoRoom, ms: number, w: Weather, noiseBlockMs?: number): RoomPoint {
  const people = roomPeopleAt(room, ms, noiseBlockMs);
  // Mode and setpoint do not depend on the SEER, so any value works here.
  const ref = powerAt(people, w, roomSqm(room), 15, roomPeakPeople(room));
  let kw = 0;
  let baselineKw = 0;
  let btu = 0;
  let constrained = false;
  for (const unit of room.units) {
    const p = unitPowerAt(room, unit, people, w);
    kw += p.coolsenseKw;
    baselineKw += p.baselineKw;
    btu += p.btu;
    if (p.btu > unit.capacityBtu) constrained = true;
  }
  return { people, mode: ref.mode, setpointC: ref.setpointC, kw, baselineKw, btu, constrained };
}

function calculationAt(ms: number, scope: string, noiseBlockMs?: number) {
  return calculationForRooms(ms, roomsInScope(scope), noiseBlockMs);
}

function calculationForRooms(
  ms: number,
  rooms: DemoRoom[],
  noiseBlockMs?: number,
): { calc: AcCalculation; baselineKw: number } {
  const w = weatherAt(ms);
  const points = rooms.map((room) => roomPointAt(room, ms, w, noiseBlockMs));
  const rank = Math.max(0, ...points.map((p) => MODE_RANK[p.mode]));
  const mode = MODES[rank];
  const setpoint = points.length ? points.reduce((sum, p) => sum + p.setpointC, 0) / points.length : MODE_BASE_TEMP[mode];
  const calc: AcCalculation = {
    id: `demo-calc-${Math.floor(ms / MS_PER_MIN)}`,
    occupancy_reading_id: null,
    weather_reading_id: null,
    weather: weatherLabel(w),
    outside_temp_c: w.temp_c,
    humidity_pct: w.humidity_pct,
    weather_condition_icon_url: null,
    ac_mode: mode,
    temperature_c: round(setpoint, 1),
    base_temp_c: MODE_BASE_TEMP[mode],
    comfort_preference: config.comfort_preference,
    fan_speed: rank + 1,
    power_kw: round(points.reduce((sum, p) => sum + p.kw, 0), 3),
    btu_per_hr: Math.round(points.reduce((sum, p) => sum + p.btu, 0)),
    capacity_constrained: points.some((p) => p.constrained),
    calculated_at: isoAt(ms),
  };
  return { calc, baselineKw: round(points.reduce((sum, p) => sum + p.baselineKw, 0), 3) };
}

export function mockCalculation(scope: string = ALL_FLOORS): AcCalculation {
  return calculationAt(Date.now(), scope, LIVE_NOISE_MS).calc;
}

export interface MockRoomSummary {
  room: DemoRoom;
  people: number;
  mode: AcMode;
  temperatureC: number;
  powerKw: number;
}

export interface MockUnitTile {
  unit: DemoUnit;
  setpointC: number;
  powerKw: number;
  // Today so far, against the always-on baseline.
  savedKg: number;
  savedPct: number;
  severity: MaintenanceSeverity | null;
}

export interface MockRoomTiles extends MockRoomSummary {
  savedKg: number;
  tiles: MockUnitTile[];
}

function roomTilesAt(room: DemoRoom, now: number, start: Date, w: Weather): MockRoomTiles {
  const live = roomPointAt(room, now, w, LIVE_NOISE_MS);
  const tiles = room.units.map((unit) => {
    const p = unitPowerAt(room, unit, live.people, w);
    let actual = 0;
    let baseline = 0;
    for (let ms = start.getTime(); ms <= now; ms += 5 * MS_PER_MIN) {
      const up = unitPowerAt(room, unit, roomPeopleAt(room, ms), weatherAt(ms));
      actual += up.coolsenseKw * (5 / 60);
      baseline += up.baselineKw * (5 / 60);
    }
    const saved = baseline - actual;
    return {
      unit,
      setpointC: round(p.setpointC, 1),
      powerKw: round(p.coolsenseKw, 2),
      savedKg: saved * CO2_PER_KWH,
      savedPct: baseline > 0 ? (saved / baseline) * 100 : 0,
      severity: mockUnitSeverity(unit.id),
    };
  });
  return {
    room,
    people: live.people,
    mode: live.mode,
    temperatureC: round(live.setpointC, 1),
    powerKw: round(live.kw, 2),
    savedKg: tiles.reduce((sum, t) => sum + t.savedKg, 0),
    tiles,
  };
}

export interface MockFloorTiles {
  floor: DemoFloor;
  people: number;
  unitCount: number;
  // Units in a room somebody is in right now.
  unitsRunning: number;
  savedKg: number;
  openAlerts: number;
  rooms: MockRoomTiles[];
}

// Live floors for the Overview page: every room of the floors in scope with
// a tile per AC unit, plus the totals of each floor.
export function mockFloorTiles(scope: string = ALL_FLOORS): MockFloorTiles[] {
  const now = Date.now();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const w = weatherAt(now);
  return floorsInScope(scope).map((floor) => {
    const rooms = floor.rooms.map((room) => roomTilesAt(room, now, start, w));
    return {
      floor,
      people: rooms.reduce((sum, r) => sum + r.people, 0),
      unitCount: rooms.reduce((sum, r) => sum + r.tiles.length, 0),
      unitsRunning: rooms.reduce((sum, r) => sum + (r.people > 0 ? r.tiles.length : 0), 0),
      savedKg: rooms.reduce((sum, r) => sum + r.savedKg, 0),
      openAlerts: mockListAlerts('open', floor.id).length,
      rooms,
    };
  });
}

// Pushes a fresh reading and calculation every few seconds so the live
// cards move, standing in for the Realtime channels.
type LiveListener = (reading: OccupancyReading, calc: AcCalculation) => void;
const listeners = new Map<LiveListener, () => string>();
let liveTimer: ReturnType<typeof setInterval> | null = null;

export function subscribeLive(listener: LiveListener, getScope: () => string = () => ALL_FLOORS): () => void {
  listeners.set(listener, getScope);
  if (liveTimer === null) {
    liveTimer = setInterval(() => {
      listeners.forEach((scopeOf, fn) => {
        const scope = scopeOf();
        fn(mockLatestReading(scope), mockCalculation(scope));
      });
    }, LIVE_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && liveTimer !== null) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  };
}

// ---- History rows (fed through the real bucketing code) ----

function stepFor(from: Date, now: number): number {
  return now - from.getTime() > 36 * MS_PER_HOUR ? 15 * MS_PER_MIN : MS_PER_MIN;
}

export function mockPeopleRows(from: Date, scope: string = ALL_FLOORS): { people_count: number; captured_at: string }[] {
  const now = Date.now();
  const step = stepFor(from, now);
  const rows = [];
  for (let ms = Math.ceil(from.getTime() / step) * step; ms <= now; ms += step) {
    rows.push({ people_count: peopleInScope(ms, scope), captured_at: isoAt(ms) });
  }
  return rows;
}

export interface MockCalcRow {
  power_kw: number;
  baseline_power_kw: number;
  temperature_c: number;
  calculated_at: string;
}

export function mockCalcRows(from: Date, scope: string = ALL_FLOORS): MockCalcRow[] {
  return rowsForRooms(from, roomsInScope(scope));
}

export interface MockBreakdownGroup {
  id: string;
  kind: 'floor' | 'room';
  rows: MockCalcRow[];
}

function rowsForRooms(from: Date, rooms: DemoRoom[]): MockCalcRow[] {
  const now = Date.now();
  const step = stepFor(from, now);
  const rows: MockCalcRow[] = [];
  for (let ms = Math.ceil(from.getTime() / step) * step; ms <= now; ms += step) {
    const { calc, baselineKw } = calculationForRooms(ms, rooms);
    rows.push({
      power_kw: calc.power_kw,
      baseline_power_kw: baselineKw,
      temperature_c: calc.temperature_c,
      calculated_at: isoAt(ms),
    });
  }
  return rows;
}

// For 'all' one group per floor, for a single floor one group per room.
export function mockBreakdownRows(from: Date, scope: string = ALL_FLOORS): MockBreakdownGroup[] {
  const floors = floorsInScope(scope);
  if (floors.length === 1 && scope !== ALL_FLOORS) {
    return floors[0].rooms.map((room) => ({ id: room.id, kind: 'room', rows: rowsForRooms(from, [room]) }));
  }
  return floors.map((floor) => ({ id: floor.id, kind: 'floor', rows: rowsForRooms(from, floor.rooms) }));
}

// ---- Simulation ----

const STATIC_APP_KW = 0.01;
const BAHT_PER_KWH = 5;

interface StoredRun {
  scope: string;
  run: SimulationRun;
  hourly: SimulationHourlyRow[];
}

const runs: StoredRun[] = [];
let runCounter = 0;

function flatWeather(condition: WeatherCondition, ms: number): Weather {
  if (condition === 'hot') return { temp_c: 35, humidity_pct: 75 };
  if (condition === 'warm') return { temp_c: 30, humidity_pct: 65 };
  if (condition === 'cool') return { temp_c: 24, humidity_pct: 55 };
  return weatherAt(ms);
}

function insideSchedule(hour: number, schedule?: OperatingHoursSchedule): boolean {
  if (!schedule) return true;
  const { startHour, endHour } = schedule;
  return startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}

interface RunOverrides {
  roomSize?: RoomSize;
  acSeer?: number;
}

// A scope that covers exactly one room can be run with the form's size and
// SEER. Anything else runs each room as it is set up on the Device page and
// adds the results up.
function buildRun(
  durationHours: number,
  scope: string,
  overrides: RunOverrides,
  weatherCondition: WeatherCondition,
  schedule: OperatingHoursSchedule | undefined,
  staticTempC: number,
  createdAt: number,
): StoredRun {
  const id = `demo-sim-${++runCounter}`;
  const rooms = roomsInScope(scope);
  const single = rooms.length === 1;
  const parts = rooms.map((room) => ({
    room,
    sqm: single && overrides.roomSize ? ROOM_SQM[overrides.roomSize] : roomSqm(room),
    seer: single && overrides.acSeer ? overrides.acSeer : roomAverageSeer(room),
  }));
  const staticEffectiveTemp = Math.min(staticTempC, 21);
  const staticFactor = 1 + 0.05 * (21 - staticEffectiveTemp);

  const hourly: SimulationHourlyRow[] = [];
  let staticKwh = 0;
  let smartKwh = 0;
  for (let i = 0; i < durationHours; i++) {
    const ms = createdAt - (durationHours - i) * MS_PER_HOUR;
    const w = flatWeather(weatherCondition, ms);
    const on = insideSchedule(new Date(ms).getHours(), schedule);
    let staticKw = 0;
    let smartKw = 0;
    let setpoint = 0;
    for (const part of parts) {
      const p = powerAt(roomPeopleAt(part.room, ms), w, part.sqm, part.seer, roomPeakPeople(part.room));
      if (on) {
        staticKw += p.baselineKw * staticFactor;
        smartKw += p.coolsenseKw;
      }
      setpoint += p.setpointC / parts.length;
    }
    staticKwh += staticKw;
    smartKwh += smartKw;
    hourly.push({
      id: `${id}-h${i}`,
      simulation_run_id: id,
      hour_index: i,
      current_power_kw: round(staticKw, 3),
      smart_power_kw: round(smartKw, 3),
      current_cumulative_kwh: round(staticKwh, 3),
      smart_cumulative_kwh: round(smartKwh, 3),
      current_cumulative_co2: round(staticKwh * CO2_PER_KWH, 3),
      smart_cumulative_co2: round(smartKwh * CO2_PER_KWH, 3),
      static_v3_power_kw: round(staticKw, 3),
      coolsense_v3_power_kw: round(smartKw, 3),
      static_v3_cumulative_kwh: round(staticKwh, 3),
      coolsense_v3_cumulative_kwh: round(smartKwh, 3),
      static_v3_cumulative_co2: round(staticKwh * CO2_PER_KWH, 3),
      coolsense_v3_cumulative_co2: round(smartKwh * CO2_PER_KWH, 3),
      static_v3_temperature_c: staticEffectiveTemp,
      coolsense_v3_temperature_c: round(setpoint, 1),
    });
  }

  const appKwh = STATIC_APP_KW * durationHours;
  const saved = staticKwh - smartKwh;
  const netSaved = saved - appKwh;
  const pct = staticKwh > 0 ? (saved / staticKwh) * 100 : 0;
  const summary: SimulationSummary = {
    duration_hours: durationHours,
    current_energy_kwh: round(staticKwh),
    smart_energy_kwh: round(smartKwh),
    current_co2_kg: round(staticKwh * CO2_PER_KWH),
    smart_co2_kg: round(smartKwh * CO2_PER_KWH),
    current_cost_baht: round(staticKwh * BAHT_PER_KWH),
    smart_cost_baht: round(smartKwh * BAHT_PER_KWH),
    pct_reduction: round(pct),
    static_v3_energy_kwh: round(staticKwh),
    coolsense_v3_energy_kwh: round(smartKwh),
    static_v3_co2_kg: round(staticKwh * CO2_PER_KWH),
    coolsense_v3_co2_kg: round(smartKwh * CO2_PER_KWH),
    static_v3_cost_baht: round(staticKwh * BAHT_PER_KWH),
    coolsense_v3_cost_baht: round(smartKwh * BAHT_PER_KWH),
    v3_pct_reduction: round(pct),
    app_energy_kwh: round(appKwh, 3),
    net_energy_saved_kwh: round(netSaved),
    net_co2_saved_kg: round(netSaved * CO2_PER_KWH),
    net_cost_saved_baht: round(netSaved * BAHT_PER_KWH),
  };
  return { scope, run: { ...summary, id, created_at: isoAt(createdAt) }, hourly };
}

// Each scope starts with one finished 7-day run so the Analytics carbon tab
// has a "latest simulation" to show before anyone runs the simulator.
function ensureSeeded(scope: string) {
  if (runs.some((r) => r.scope === scope)) return;
  runs.push(buildRun(168, scope, {}, 'diurnal', undefined, 21, Date.now() - 2 * MS_PER_HOUR));
}

export function mockGenerateData(durationHours: number, roomSize: RoomSize, scope: string = ALL_FLOORS): GenerateMockDataResult {
  const end = Date.now();
  const counts: number[] = [];
  const weekday: number[] = [];
  const weekend: number[] = [];
  for (let i = 0; i < durationHours; i++) {
    const ms = end - (durationHours - i) * MS_PER_HOUR;
    const n = peopleInScope(ms, scope);
    counts.push(n);
    const day = new Date(ms).getDay();
    (day === 0 || day === 6 ? weekend : weekday).push(n);
  }
  const avg = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, 1) : 0);
  return {
    occupancy_reading_ids: counts.map((_, i) => `demo-mock-${i}`),
    room_size: roomSize,
    duration_hours: durationHours,
    summary: {
      avg_people_count: avg(counts),
      min_people_count: counts.length ? Math.min(...counts) : 0,
      max_people_count: counts.length ? Math.max(...counts) : 0,
      weekday_avg_people_count: avg(weekday),
      weekend_avg_people_count: avg(weekend),
    },
  };
}

export function mockRunSimulation(
  durationHours: number,
  roomSize: RoomSize,
  acSeer: number,
  weatherCondition: WeatherCondition,
  schedule?: OperatingHoursSchedule,
  staticTempC = 21,
  scope: string = ALL_FLOORS,
): SimulationRunResult {
  ensureSeeded(scope);
  const stored = buildRun(durationHours, scope, { roomSize, acSeer }, weatherCondition, schedule, staticTempC, Date.now());
  runs.unshift(stored);
  const summary = { ...stored.run } as Partial<SimulationRun>;
  delete summary.id;
  delete summary.created_at;
  return { simulation_run_id: stored.run.id, summary: summary as SimulationSummary };
}

export function mockGetSimulationRun(id: string): SimulationRun {
  const found = runs.find((r) => r.run.id === id);
  if (!found) throw new Error('Simulation run not found');
  return found.run;
}

export function mockGetSimulationHourly(id: string): SimulationHourlyRow[] {
  const found = runs.find((r) => r.run.id === id);
  if (!found) throw new Error('Simulation run not found');
  return found.hourly;
}

export function mockListSimulations(scope: string = ALL_FLOORS): SimulationListItem[] {
  ensureSeeded(scope);
  return runs.filter((r) => r.scope === scope).slice(0, 10).map(({ run }) => ({
    id: run.id,
    duration_hours: run.duration_hours,
    pct_reduction: run.pct_reduction,
    current_energy_kwh: run.current_energy_kwh,
    smart_energy_kwh: run.smart_energy_kwh,
    created_at: run.created_at,
  }));
}
