// Demo-only floors > rooms > AC units layout. The real backend is a single
// room (room_config), none of this is sent anywhere.
import { computed, ref } from 'vue';
import type { EgatLabel, RoomSize } from '../api';
import { DEMO_PEAK_PEOPLE, peopleAt, powerAt, ROOM_SQM, type PowerPoint, type Weather } from './model';

// A scope is either 'all' (every floor of the active building) or a floor id.
export const ALL_FLOORS = 'all';

// Which building the app is looking at. The buildings themselves (name,
// location) live elsewhere, floors only point at one by id. Whoever switches
// buildings calls setActiveBuilding.
export const SEED_BUILDING_ID = 'main';
export const activeBuildingId = ref<string>(SEED_BUILDING_ID);
export function setActiveBuilding(id: string) {
  activeBuildingId.value = id;
}

// The v2 keys hold the floor-aware shape. The old keys (rooms without a
// floor) are simply no longer read.
const FLOORS_KEY = 'coolsense_demo_floors_v2';
const UNITS_KEY = 'coolsense_demo_units_v2';
const ROOMS_KEY = 'coolsense_demo_rooms_v2';

export interface DemoUnit {
  id: string;
  roomId: string;
  // Used for the default name ("Unit 2") when label is empty.
  seq: number;
  label: string;
  seer: number;
  capacityBtu: number;
  egat: EgatLabel | null;
}

export interface DemoRoom {
  id: string;
  floorId: string;
  // Seeded rooms are named through the locale files, rooms added by the user
  // carry their own name.
  nameKey?: string;
  name: string;
  size: RoomSize;
  // Fraction of DEMO_PEAK_PEOPLE this room reaches at its busiest.
  peopleScale: number;
  shiftHours: number;
  seed: number;
  units: DemoUnit[];
}

export interface DemoFloor {
  id: string;
  buildingId: string;
  nameKey?: string;
  name: string;
  order: number;
  rooms: DemoRoom[];
}

type RoomDef = Omit<DemoRoom, 'units'>;
type FloorDef = Omit<DemoFloor, 'rooms'>;

const SIZE_PEOPLE_SCALE: Record<RoomSize, number> = { small: 0.4, medium: 0.9, large: 1.8 };
const SIZE_DEFAULT_BTU: Record<RoomSize, number> = { small: 12000, medium: 18000, large: 24000 };

const SEED_FLOORS: FloorDef[] = [
  { id: 'f1', buildingId: SEED_BUILDING_ID, nameKey: 'floors.1', name: '', order: 1 },
  { id: 'f2', buildingId: SEED_BUILDING_ID, nameKey: 'floors.2', name: '', order: 2 },
  { id: 'f3', buildingId: SEED_BUILDING_ID, nameKey: 'floors.3', name: '', order: 3 },
];

const SEED_ROOMS: RoomDef[] = [
  { id: 'lobby', floorId: 'f1', nameKey: 'rooms.lobby', name: '', size: 'large', peopleScale: 1.2, shiftHours: 1, seed: 303 },
  { id: 'meeting', floorId: 'f1', nameKey: 'rooms.meeting', name: '', size: 'medium', peopleScale: 0.9, shiftHours: 2, seed: 101 },
  { id: 'north', floorId: 'f2', nameKey: 'rooms.north', name: '', size: 'large', peopleScale: 1.8, shiftHours: 0, seed: 0 },
  { id: 'lab', floorId: 'f3', nameKey: 'rooms.lab', name: '', size: 'small', peopleScale: 0.4, shiftHours: -1, seed: 202 },
  { id: 'exec', floorId: 'f3', nameKey: 'rooms.executiveOffice', name: '', size: 'medium', peopleScale: 0.5, shiftHours: 1, seed: 404 },
];

function seedUnit(roomId: string, seq: number, seer: number, capacityBtu: number, egat: EgatLabel): DemoUnit {
  return { id: `${roomId}-${seq}`, roomId, seq, label: '', seer, capacityBtu, egat };
}

function seedUnits(): DemoUnit[] {
  return [
    seedUnit('lobby', 1, 16, 24000, '5'),
    seedUnit('meeting', 1, 15, 12000, '5'),
    seedUnit('meeting', 2, 13.5, 12000, '3'),
    seedUnit('north', 1, 15, 24000, '5'),
    seedUnit('north', 2, 14, 24000, '4'),
    seedUnit('lab', 1, 18, 12000, 'premium'),
    seedUnit('exec', 1, 17, 12000, '5'),
    seedUnit('exec', 2, 15.5, 12000, '4'),
  ];
}

function readArray(key: string): unknown[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // unreadable storage, use the seed
  }
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const SIZES: RoomSize[] = ['small', 'medium', 'large'];

// Stored data is checked piece by piece, so a hand-edited or half-written
// entry gets dropped (or reattached to the first floor) instead of crashing.
function loadFloors(): FloorDef[] {
  const list = (readArray(FLOORS_KEY) ?? []).filter(
    (f): f is FloorDef => isObj(f) && typeof f.id === 'string' && typeof f.order === 'number' && typeof f.name === 'string',
  );
  // Floors saved without a building belong to the first one.
  const fixed = list.map((f) => ({ ...f, buildingId: typeof f.buildingId === 'string' ? f.buildingId : SEED_BUILDING_ID }));
  return fixed.length > 0 ? fixed : SEED_FLOORS.map((f) => ({ ...f }));
}

function loadRoomDefs(floors: FloorDef[]): RoomDef[] {
  const stored = readArray(ROOMS_KEY) ?? [];
  const ids = new Set(floors.map((f) => f.id));
  const firstFloor = [...floors].sort((a, b) => a.order - b.order)[0].id;
  const list = stored
    .filter((r): r is RoomDef => isObj(r) && typeof r.id === 'string' && SIZES.includes(r.size as RoomSize))
    .map((r) => ({
      ...r,
      name: typeof r.name === 'string' ? r.name : '',
      floorId: typeof r.floorId === 'string' && ids.has(r.floorId) ? r.floorId : firstFloor,
      peopleScale: typeof r.peopleScale === 'number' ? r.peopleScale : SIZE_PEOPLE_SCALE[r.size],
      shiftHours: typeof r.shiftHours === 'number' ? r.shiftHours : 0,
      seed: typeof r.seed === 'number' ? r.seed : 0,
    }));
  return list.length > 0 ? list : SEED_ROOMS.map((r) => ({ ...r }));
}

function loadUnits(rooms: RoomDef[]): DemoUnit[] {
  const stored = readArray(UNITS_KEY);
  // Seeded rooms with nothing stored for them fall back to the seed units.
  const roomIds = new Set(rooms.map((r) => r.id));
  const seed = seedUnits();
  const units = stored
    ? stored.filter(
        (u): u is DemoUnit =>
          isObj(u) &&
          typeof u.id === 'string' &&
          typeof u.roomId === 'string' &&
          roomIds.has(u.roomId) &&
          typeof u.seq === 'number' &&
          typeof u.seer === 'number' &&
          typeof u.capacityBtu === 'number',
      )
    : seed.filter((u) => roomIds.has(u.roomId));
  // Every room keeps at least one unit.
  for (const room of rooms) {
    if (!units.some((u) => u.roomId === room.id)) {
      units.push({ id: `${room.id}-1`, roomId: room.id, seq: 1, label: '', seer: 15, capacityBtu: SIZE_DEFAULT_BTU[room.size], egat: '5' });
    }
  }
  return units.map((u) => ({ ...u, label: typeof u.label === 'string' ? u.label : '', egat: u.egat ?? null }));
}

const floorDefs = ref<FloorDef[]>(loadFloors());
const roomDefs = ref<RoomDef[]>(loadRoomDefs(floorDefs.value));
export const demoUnits = ref<DemoUnit[]>(loadUnits(roomDefs.value));

function persist() {
  try {
    localStorage.setItem(FLOORS_KEY, JSON.stringify(floorDefs.value));
    localStorage.setItem(UNITS_KEY, JSON.stringify(demoUnits.value));
    localStorage.setItem(ROOMS_KEY, JSON.stringify(roomDefs.value));
  } catch {
    // storage may be blocked, the in-memory copy still works
  }
}

// Floors by their order, each with its rooms (in creation order) and units.
export const demoFloors = computed<DemoFloor[]>(() =>
  floorDefs.value
    .filter((f) => f.buildingId === activeBuildingId.value)
    .sort((a, b) => a.order - b.order)
    .map((floor) => ({
      ...floor,
      rooms: roomDefs.value
        .filter((r) => r.floorId === floor.id)
        .map((def) => ({
          ...def,
          units: demoUnits.value.filter((u) => u.roomId === def.id).sort((a, b) => a.seq - b.seq),
        })),
    })),
);

export const demoRooms = computed<DemoRoom[]>(() => demoFloors.value.flatMap((f) => f.rooms));

export function getFloor(floorId: string): DemoFloor | undefined {
  return demoFloors.value.find((f) => f.id === floorId);
}

export function isFloorId(value: string): boolean {
  return demoFloors.value.some((f) => f.id === value);
}

export function getRoom(roomId: string): DemoRoom | undefined {
  return demoRooms.value.find((r) => r.id === roomId);
}

export function isRoomId(value: string): boolean {
  return roomDefs.value.some((d) => d.id === value);
}

// 'all' (or anything unknown) means every floor.
export function floorsInScope(scope: string = ALL_FLOORS): DemoFloor[] {
  const one = getFloor(scope);
  return one ? [one] : demoFloors.value;
}

export function roomsInScope(scope: string = ALL_FLOORS): DemoRoom[] {
  return floorsInScope(scope).flatMap((f) => f.rooms);
}

export function unitsInScope(scope: string = ALL_FLOORS): { room: DemoRoom; unit: DemoUnit }[] {
  return roomsInScope(scope).flatMap((room) => room.units.map((unit) => ({ room, unit })));
}

export function findUnit(unitId: string): { room: DemoRoom; unit: DemoUnit } | undefined {
  for (const room of demoRooms.value) {
    const unit = room.units.find((u) => u.id === unitId);
    if (unit) return { room, unit };
  }
  return undefined;
}

// ---- Floors ----

// A new floor starts without rooms, add them from the Device page.
export function addFloor(name: string): DemoFloor {
  return addFloorTo(activeBuildingId.value, { name: name.trim() });
}

function addFloorTo(buildingId: string, label: { name: string; nameKey?: string }): FloorDef & { rooms: DemoRoom[] } {
  const id = `floor-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const order = Math.max(0, ...floorDefs.value.filter((f) => f.buildingId === buildingId).map((f) => f.order)) + 1;
  const def: FloorDef = { id, buildingId, name: label.name, nameKey: label.nameKey, order };
  floorDefs.value = [...floorDefs.value, def];
  persist();
  return { ...def, rooms: [] };
}

// A new building starts with one floor, one room and one air conditioner so
// it is usable right away.
export function seedBuildingDefaults(buildingId: string): DemoFloor {
  const floor = addFloorTo(buildingId, { name: '', nameKey: 'floors.1' });
  const roomId = `room-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  roomDefs.value = [
    ...roomDefs.value,
    {
      id: roomId,
      floorId: floor.id,
      nameKey: 'rooms.defaultName',
      name: '',
      size: 'medium',
      peopleScale: SIZE_PEOPLE_SCALE.medium,
      shiftHours: 0,
      seed: roomDefs.value.length * 97 + 11,
    },
  ];
  demoUnits.value = [
    ...demoUnits.value,
    { id: `${roomId}-1`, roomId, seq: 1, label: '', seer: 15, capacityBtu: SIZE_DEFAULT_BTU.medium, egat: '5' },
  ];
  persist();
  return getFloor(floor.id) ?? { ...floor, rooms: [] };
}

// Drops a building's floors with their rooms and units.
export function removeBuildingData(buildingId: string) {
  const floorIds = floorDefs.value.filter((f) => f.buildingId === buildingId).map((f) => f.id);
  const roomIds = roomDefs.value.filter((r) => floorIds.includes(r.floorId)).map((r) => r.id);
  floorDefs.value = floorDefs.value.filter((f) => f.buildingId !== buildingId);
  roomDefs.value = roomDefs.value.filter((r) => !floorIds.includes(r.floorId));
  demoUnits.value = demoUnits.value.filter((u) => !roomIds.includes(u.roomId));
  persist();
}

// A rename replaces the translated name of a seeded floor with the typed one.
export function renameFloor(floorId: string, name: string) {
  const next = name.trim();
  if (!next) return;
  floorDefs.value = floorDefs.value.map((f) => (f.id === floorId ? { ...f, name: next, nameKey: undefined } : f));
  persist();
}

export type RemoveFloorResult = 'ok' | 'last-floor' | 'last-room' | 'unknown';

// The last floor stays, and so does the last room of the whole building.
// A floor takes its rooms and their units with it.
export function removeFloor(floorId: string): RemoveFloorResult {
  if (!isFloorId(floorId)) return 'unknown';
  if (demoFloors.value.length <= 1) return 'last-floor';
  const doomed = roomDefs.value.filter((r) => r.floorId === floorId).map((r) => r.id);
  // A building that has rooms keeps at least one.
  if (doomed.length > 0 && doomed.length >= demoRooms.value.length) return 'last-room';
  floorDefs.value = floorDefs.value.filter((f) => f.id !== floorId);
  roomDefs.value = roomDefs.value.filter((r) => r.floorId !== floorId);
  demoUnits.value = demoUnits.value.filter((u) => !doomed.includes(u.roomId));
  persist();
  return 'ok';
}

// ---- Units ----

export type UnitInput = Omit<DemoUnit, 'id' | 'roomId' | 'seq'>;

export function addUnit(roomId: string, input: UnitInput): DemoUnit {
  const seq = Math.max(0, ...demoUnits.value.filter((u) => u.roomId === roomId).map((u) => u.seq)) + 1;
  const unit: DemoUnit = { ...input, id: `${roomId}-${seq}-${Date.now().toString(36)}`, roomId, seq };
  demoUnits.value = [...demoUnits.value, unit];
  persist();
  return unit;
}

export function updateUnit(unitId: string, input: UnitInput) {
  demoUnits.value = demoUnits.value.map((u) => (u.id === unitId ? { ...u, ...input } : u));
  persist();
}

// A room always keeps at least one unit, to drop the last one remove the room.
export function removeUnit(unitId: string): boolean {
  const found = findUnit(unitId);
  if (!found || found.room.units.length <= 1) return false;
  demoUnits.value = demoUnits.value.filter((u) => u.id !== unitId);
  persist();
  return true;
}

// ---- Rooms ----

// A new room starts with one unit, so no room is ever empty.
export function addRoom(floorId: string, name: string, size: RoomSize): DemoRoom {
  const id = `room-${Date.now().toString(36)}`;
  const floor = isFloorId(floorId) ? floorId : demoFloors.value[0].id;
  roomDefs.value = [
    ...roomDefs.value,
    { id, floorId: floor, name: name.trim(), size, peopleScale: SIZE_PEOPLE_SCALE[size], shiftHours: 0, seed: roomDefs.value.length * 97 + 11 },
  ];
  demoUnits.value = [
    ...demoUnits.value,
    { id: `${id}-1`, roomId: id, seq: 1, label: '', seer: 15, capacityBtu: SIZE_DEFAULT_BTU[size], egat: '5' },
  ];
  persist();
  return getRoom(id) as DemoRoom;
}

// A rename replaces the translated name of a seeded room with the typed one.
// A new floorId moves the room (and its units) to that floor.
export function updateRoom(roomId: string, patch: { name?: string; size?: RoomSize; floorId?: string }) {
  roomDefs.value = roomDefs.value.map((d) => {
    if (d.id !== roomId) return d;
    const size = patch.size ?? d.size;
    const renamed = patch.name !== undefined && patch.name.trim() !== '';
    return {
      ...d,
      size,
      floorId: patch.floorId && isFloorId(patch.floorId) ? patch.floorId : d.floorId,
      name: renamed ? (patch.name as string).trim() : d.name,
      nameKey: renamed ? undefined : d.nameKey,
      // The busiest headcount follows the room size when the size changes.
      peopleScale: size !== d.size ? SIZE_PEOPLE_SCALE[size] : d.peopleScale,
    };
  });
  persist();
}

// The last room of the active building cannot be removed. Its units go with it.
export function removeRoom(roomId: string): boolean {
  if (demoRooms.value.length <= 1 || !getRoom(roomId)) return false;
  roomDefs.value = roomDefs.value.filter((d) => d.id !== roomId);
  demoUnits.value = demoUnits.value.filter((u) => u.roomId !== roomId);
  persist();
  return true;
}

// ---- Numbers derived from the layout ----

export function roomPeopleAt(room: DemoRoom, ms: number, noiseBlockMs?: number): number {
  return peopleAt(ms, room.peopleScale, noiseBlockMs, { shiftHours: room.shiftHours, seed: room.seed });
}

export function roomPeakPeople(room: DemoRoom): number {
  return DEMO_PEAK_PEOPLE * room.peopleScale;
}

export function roomSqm(room: DemoRoom): number {
  return ROOM_SQM[room.size];
}

export function roomCapacityBtu(room: DemoRoom): number {
  return room.units.reduce((sum, u) => sum + u.capacityBtu, 0);
}

// Capacity-weighted average SEER, falls back to 15 for an empty room.
export function roomAverageSeer(room: DemoRoom): number {
  const total = roomCapacityBtu(room);
  if (total <= 0) return 15;
  return room.units.reduce((sum, u) => sum + u.seer * u.capacityBtu, 0) / total;
}

// Each unit carries a slice of its room's load, proportional to capacity.
export function unitShare(room: DemoRoom, unit: DemoUnit): number {
  const total = roomCapacityBtu(room);
  return total > 0 ? unit.capacityBtu / total : 1 / Math.max(1, room.units.length);
}

// Power for one unit: the same model as a whole room, fed its share of the
// people and floor area so density (and so the AC mode) matches the room.
export function unitPowerAt(room: DemoRoom, unit: DemoUnit, people: number, w: Weather): PowerPoint {
  const s = unitShare(room, unit);
  return powerAt(people * s, w, roomSqm(room) * s, unit.seer, roomPeakPeople(room) * s);
}
