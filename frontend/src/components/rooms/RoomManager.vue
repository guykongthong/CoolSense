<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBuildingLocation } from '../../composables/useBuildingLocation';
import { floorName, roomName, unitName, useSelectedFloor } from '../../composables/useSelectedFloor';
import { ROOM_SIZE_SQM_RANGES, type EgatLabel, type RoomSize } from '../../lib/api';
import { t } from '../../lib/i18n';
import { mockFloorTiles } from '../../lib/mock/api';
import {
  addFloor,
  addRoom,
  addUnit,
  demoFloors,
  findUnit,
  getFloor,
  getRoom,
  removeFloor,
  removeRoom,
  removeUnit,
  renameFloor,
  updateRoom,
  updateUnit,
  type DemoUnit,
} from '../../lib/mock/rooms';

// Demo-only editor, one level at a time: floors > rooms > air conditioners >
// one air conditioner. Everything lives in memory and localStorage (see
// lib/mock/rooms.ts).
const MIN_AC_SEER = 13;
const MAX_AC_SEER = 25;
const SIZES: RoomSize[] = ['small', 'medium', 'large'];
const EGAT_OPTIONS: EgatLabel[] = ['5', '4', '3', '2', '1', 'premium'];

interface UnitForm {
  label: string;
  seer: string;
  capacity: string;
  egat: EgatLabel | '';
}

const route = useRoute();
const router = useRouter();
const { selectedFloor, ALL_FLOORS } = useSelectedFloor();
// The EGAT label only applies to Thai buildings.
const { isThailand } = useBuildingLocation();

// Where we are. Worked out here, in setup, so the first render already shows
// the right level (a ?unit= link must not flash the floor list first).
function startingPlace(): { floor: string; room: string; unit: string } {
  const q = route.query;
  if (typeof q.unit === 'string') {
    const found = findUnit(q.unit);
    if (found) return { floor: found.room.floorId, room: found.room.id, unit: found.unit.id };
  }
  if (typeof q.room === 'string') {
    const room = getRoom(q.room);
    if (room) return { floor: room.floorId, room: room.id, unit: '' };
  }
  if (typeof q.floor === 'string' && getFloor(q.floor)) return { floor: q.floor, room: '', unit: '' };
  if (getFloor(selectedFloor.value)) return { floor: selectedFloor.value, room: '', unit: '' };
  return { floor: '', room: '', unit: '' };
}
const start = startingPlace();
const floorId = ref(start.floor);
const roomId = ref(start.room);
// A unit id, 'new' while adding one, or '' when no unit is open.
const unitId = ref(start.unit);

const NEW_UNIT = 'new';

const floor = computed(() => getFloor(floorId.value));
const room = computed(() => floor.value?.rooms.find((r) => r.id === roomId.value));
const unit = computed(() => room.value?.units.find((u) => u.id === unitId.value));
const level = computed(() => {
  if (floor.value && room.value && (unit.value || unitId.value === NEW_UNIT)) return 4;
  if (floor.value && room.value) return 3;
  if (floor.value) return 2;
  return 1;
});

// ---- Forms ----

const unitForm = reactive<UnitForm>({ label: '', seer: '15', capacity: '12000', egat: '5' });
const floorForm = reactive({ name: '' });
const roomForm = reactive({ name: '', size: 'medium' as RoomSize, floorId: '' });
const newFloorName = ref('');
const newRoom = reactive({ name: '', size: 'medium' as RoomSize });

const addingFloor = ref(false);
const addingRoom = ref(false);
const showFloorSettings = ref(false);
const showRoomSettings = ref(false);
const confirming = ref<'floor' | 'room' | 'unit' | null>(null);

const message = ref('');
const errorMessage = ref('');
let messageTimer: ReturnType<typeof setTimeout> | null = null;
onUnmounted(() => {
  if (messageTimer) clearTimeout(messageTimer);
});
function flash(text: string) {
  errorMessage.value = '';
  message.value = text;
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (message.value = ''), 3000);
}
function fail(text: string) {
  message.value = '';
  errorMessage.value = text;
}

function fillUnitForm(u: DemoUnit | undefined) {
  unitForm.label = u?.label ?? '';
  unitForm.seer = u ? String(u.seer) : '15';
  unitForm.capacity = u ? String(u.capacityBtu) : '12000';
  unitForm.egat = u ? (u.egat ?? '') : '5';
}
fillUnitForm(unit.value);
floorForm.name = floor.value ? floorName(floor.value.id) : '';
roomForm.name = room.value ? roomName(room.value.id) : '';
roomForm.size = room.value?.size ?? 'medium';
roomForm.floorId = room.value?.floorId ?? '';

// Whenever the place changes: fresh forms, closed panels, back to the top.
watch([floorId, roomId, unitId], () => {
  confirming.value = null;
  addingFloor.value = false;
  addingRoom.value = false;
  showFloorSettings.value = false;
  showRoomSettings.value = false;
  errorMessage.value = '';
  floorForm.name = floor.value ? floorName(floor.value.id) : '';
  roomForm.name = room.value ? roomName(room.value.id) : '';
  roomForm.size = room.value?.size ?? 'medium';
  roomForm.floorId = room.value?.floorId ?? '';
  fillUnitForm(unit.value);
  window.scrollTo(0, 0);
});

// Something was deleted underneath us: step up to what still exists.
watch(demoFloors, () => {
  if (floorId.value && !floor.value) go('', '', '');
  else if (roomId.value && !room.value) go(floorId.value, '', '');
  else if (unitId.value && unitId.value !== NEW_UNIT && !unit.value) go(floorId.value, roomId.value, '');
});

// Picking a floor in the header opens that floor, 'All floors' the list.
watch(selectedFloor, (id) => go(id === ALL_FLOORS ? '' : id, '', ''));

function go(f: string, r: string, u: string) {
  floorId.value = f;
  roomId.value = r;
  unitId.value = u;
}

onMounted(() => {
  // The link did its job, keep the address clean.
  if (route.query.unit || route.query.room || route.query.floor) router.replace({ path: route.path });
});

// ---- Texts ----

const title = computed(() => {
  if (level.value === 4) return unitId.value === NEW_UNIT ? t('rooms.addUnit') : unitName(unit.value as DemoUnit);
  if (level.value === 3) return roomName(roomId.value);
  if (level.value === 2) return floorName(floorId.value);
  return t('floors.title');
});
const helper = computed(() => t(`device.help.${level.value}`));

const crumbs = computed(() => {
  const list: { label: string; action: () => void }[] = [{ label: t('floors.title'), action: () => go('', '', '') }];
  if (floor.value) list.push({ label: floorName(floor.value.id), action: () => go(floorId.value, '', '') });
  if (room.value) list.push({ label: roomName(room.value.id), action: () => go(floorId.value, roomId.value, '') });
  if (level.value === 4) list.push({ label: title.value, action: () => undefined });
  return list;
});

function back() {
  if (level.value === 4) go(floorId.value, roomId.value, '');
  else if (level.value === 3) go(floorId.value, '', '');
  else go('', '', '');
}

// 1 gets its own wording ('1 room'), everything else the plain one.
function countText(key: string, n: number): string {
  return n === 1 ? t(`${key}One`) : t(key, { n });
}

function egatText(label: EgatLabel | null): string {
  if (!label) return '-';
  return label === 'premium' ? t('information.premium') : t('information.stars', { n: label });
}

// Live set temperature and status for the unit cards.
const tiles = computed(() => {
  const map = new Map<string, { setpointC: number; severity: string | null }>();
  if (!room.value) return map;
  for (const group of mockFloorTiles(floorId.value)) {
    for (const r of group.rooms) {
      if (r.room.id !== roomId.value) continue;
      for (const tile of r.tiles) map.set(tile.unit.id, { setpointC: tile.setpointC, severity: tile.severity });
    }
  }
  return map;
});

const floorCards = computed(() =>
  demoFloors.value.map((f) => ({
    id: f.id,
    rooms: f.rooms.length,
    units: f.rooms.reduce((sum, r) => sum + r.units.length, 0),
  })),
);

// ---- Actions ----

function createFloor() {
  if (!newFloorName.value.trim()) return fail(t('floors.nameRequired'));
  const created = addFloor(newFloorName.value);
  newFloorName.value = '';
  go(created.id, '', '');
}

function saveFloor() {
  const f = floor.value;
  if (!f) return;
  if (!floorForm.name.trim()) return fail(t('floors.nameRequired'));
  if (floorForm.name.trim() !== floorName(f.id)) renameFloor(f.id, floorForm.name);
  showFloorSettings.value = false;
  flash(t('information.saveSuccess'));
}

function deleteFloor() {
  const f = floor.value;
  if (!f) return;
  const result = removeFloor(f.id);
  confirming.value = null;
  if (result === 'ok') {
    go('', '', '');
    flash(t('floors.removed'));
  } else {
    fail(result === 'last-floor' ? t('floors.lastFloor') : t('floors.lastRoomOnly'));
  }
}

function createRoom() {
  const f = floor.value;
  if (!f) return;
  if (!newRoom.name.trim()) return fail(t('rooms.nameRequired'));
  const created = addRoom(f.id, newRoom.name, newRoom.size);
  newRoom.name = '';
  go(f.id, created.id, '');
}

function saveRoom() {
  const r = room.value;
  if (!r) return;
  if (!roomForm.name.trim()) return fail(t('rooms.nameRequired'));
  const changedName = roomForm.name.trim() !== roomName(r.id);
  updateRoom(r.id, { size: roomForm.size, name: changedName ? roomForm.name : undefined, floorId: roomForm.floorId });
  // Follow the room if it moved to another floor.
  floorId.value = roomForm.floorId;
  showRoomSettings.value = false;
  flash(t('information.saveSuccess'));
}

function deleteRoom() {
  const r = room.value;
  if (!r) return;
  const f = floorId.value;
  confirming.value = null;
  if (removeRoom(r.id)) {
    go(f, '', '');
    flash(t('rooms.roomRemoved'));
  } else {
    fail(t('rooms.lastRoom'));
  }
}

function saveUnit() {
  const r = room.value;
  if (!r) return;
  const seer = Number(unitForm.seer);
  if (!unitForm.seer || Number.isNaN(seer) || seer < MIN_AC_SEER || seer > MAX_AC_SEER) {
    return fail(t('information.seerOutOfRange', { min: MIN_AC_SEER, max: MAX_AC_SEER }));
  }
  const capacity = Number(unitForm.capacity);
  if (!unitForm.capacity || Number.isNaN(capacity) || capacity <= 0) return fail(t('information.capacityInvalid'));
  const input = {
    label: unitForm.label.trim(),
    seer,
    capacityBtu: capacity,
    egat: unitForm.egat === '' ? null : unitForm.egat,
  };
  if (unit.value) updateUnit(unit.value.id, input);
  else addUnit(r.id, input);
  go(floorId.value, roomId.value, '');
  flash(t('information.saveSuccess'));
}

function deleteUnit() {
  const u = unit.value;
  confirming.value = null;
  if (!u) return;
  if (removeUnit(u.id)) {
    go(floorId.value, roomId.value, '');
    flash(t('rooms.unitRemoved'));
  } else {
    fail(t('rooms.lastUnit'));
  }
}

const selectClass =
  'w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md py-3 pl-4 pr-10 appearance-none';
const inputClass = 'w-full bg-transparent border-none focus:ring-0 text-on-surface text-body-md py-3 px-4';
const fieldWrapClass =
  'relative rounded-lg border border-outline-variant overflow-hidden transition-all bg-surface-container-lowest ' +
  'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20';
const buttonBase = 'px-5 min-h-12 text-label-md rounded-lg transition-colors disabled:opacity-60';
const primaryButton = `${buttonBase} bg-primary text-on-primary hover:bg-primary-container`;
const outlineButton = `${buttonBase} border border-outline text-on-surface hover:bg-surface-container-low`;
const dangerButton = `${buttonBase} bg-error text-on-error hover:opacity-90`;
const cardClass =
  'w-full text-left rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-card p-5 min-h-20 flex items-center justify-between gap-4 transition-colors hover:border-primary hover:bg-surface-container-low';
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Where you are -->
    <div class="flex flex-col gap-3">
      <nav
        v-if="level > 1"
        :aria-label="t('device.where')"
        class="flex flex-wrap items-center gap-x-1 gap-y-1 text-label-md"
      >
        <template
          v-for="(crumb, i) in crumbs"
          :key="i"
        >
          <span
            v-if="i > 0"
            class="text-on-surface-variant"
            aria-hidden="true"
          >&gt;</span>
          <span
            v-if="i === crumbs.length - 1"
            class="text-on-surface px-1"
            aria-current="page"
          >{{ crumb.label }}</span>
          <button
            v-else
            type="button"
            class="text-primary underline underline-offset-2 px-1 min-h-11 min-w-11"
            @click="crumb.action"
          >
            {{ crumb.label }}
          </button>
        </template>
      </nav>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-headline-lg text-on-surface">
            {{ title }}
          </h3>
          <p class="text-body-md text-on-surface-variant">
            {{ helper }}
          </p>
        </div>
        <button
          v-if="level > 1"
          type="button"
          :class="outlineButton"
          @click="back"
        >
          {{ t('device.back') }}
        </button>
      </div>
    </div>

    <p
      v-if="errorMessage"
      class="text-label-md text-error flex items-center gap-1"
      role="alert"
    >
      <span
        class="material-symbols-outlined text-[18px]"
        aria-hidden="true"
      >error</span>
      {{ errorMessage }}
    </p>
    <p
      v-if="message"
      class="text-label-md text-success flex items-center gap-1"
      role="status"
    >
      <span
        class="material-symbols-outlined text-[18px]"
        aria-hidden="true"
      >check_circle</span>
      {{ message }}
    </p>

    <!-- Level 1: floors -->
    <template v-if="level === 1">
      <div>
        <button
          v-if="!addingFloor"
          type="button"
          :class="primaryButton"
          @click="addingFloor = true"
        >
          {{ t('floors.add') }}
        </button>
        <form
          v-else
          class="flex flex-col gap-4 max-w-md"
          @submit.prevent="createFloor"
        >
          <div class="flex flex-col gap-1.5">
            <label
              for="new_floor_name"
              class="text-label-md text-on-surface-variant"
            >{{ t('floors.name') }}</label>
            <div :class="fieldWrapClass">
              <input
                id="new_floor_name"
                v-model="newFloorName"
                type="text"
                maxlength="40"
                :class="inputClass"
              >
            </div>
          </div>
          <div class="flex gap-3">
            <button
              type="submit"
              :class="primaryButton"
            >
              {{ t('floors.create') }}
            </button>
            <button
              type="button"
              :class="outlineButton"
              @click="addingFloor = false"
            >
              {{ t('maintenance.cancel') }}
            </button>
          </div>
        </form>
      </div>
      <ul class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <li
          v-for="card in floorCards"
          :key="card.id"
        >
          <button
            type="button"
            :class="cardClass"
            @click="go(card.id, '', '')"
          >
            <span class="min-w-0">
              <span class="block text-headline-md text-on-surface">{{ floorName(card.id) }}</span>
              <span class="block text-label-md text-on-surface-variant">
                {{ countText('floors.roomCount', card.rooms) }}, {{ countText('rooms.unitCount', card.units) }}
              </span>
            </span>
            <span
              class="material-symbols-outlined text-on-surface-variant shrink-0"
              aria-hidden="true"
            >chevron_right</span>
          </button>
        </li>
      </ul>
    </template>

    <!-- Level 2: rooms of a floor -->
    <template v-else-if="level === 2 && floor">
      <div class="flex flex-wrap gap-3">
        <button
          v-if="!addingRoom"
          type="button"
          :class="primaryButton"
          @click="addingRoom = true"
        >
          {{ t('rooms.addRoom') }}
        </button>
        <button
          type="button"
          :class="outlineButton"
          :aria-expanded="showFloorSettings"
          @click="showFloorSettings = !showFloorSettings"
        >
          {{ t('floors.settings') }}
        </button>
      </div>

      <form
        v-if="addingRoom"
        class="flex flex-col gap-4 max-w-md"
        @submit.prevent="createRoom"
      >
        <div class="flex flex-col gap-1.5">
          <label
            for="new_room_name"
            class="text-label-md text-on-surface-variant"
          >{{ t('rooms.roomName') }}</label>
          <div :class="fieldWrapClass">
            <input
              id="new_room_name"
              v-model="newRoom.name"
              type="text"
              maxlength="60"
              :class="inputClass"
            >
          </div>
        </div>
        <fieldset class="flex flex-wrap gap-x-6 gap-y-1">
          <legend class="text-label-md text-on-surface-variant mb-1">
            {{ t('information.roomSize') }}
          </legend>
          <label
            v-for="size in SIZES"
            :key="size"
            class="flex items-center gap-2 min-h-11 cursor-pointer"
          >
            <input
              v-model="newRoom.size"
              type="radio"
              name="new_room_size"
              :value="size"
              class="accent-primary w-4 h-4"
            >
            {{ t(`common.${size}`) }}
            <span class="text-on-surface-variant text-label-md">({{ ROOM_SIZE_SQM_RANGES[size] }})</span>
          </label>
        </fieldset>
        <p class="text-label-sm text-on-surface-variant">
          {{ t('rooms.newRoomHint') }}
        </p>
        <div class="flex gap-3">
          <button
            type="submit"
            :class="primaryButton"
          >
            {{ t('rooms.createRoom') }}
          </button>
          <button
            type="button"
            :class="outlineButton"
            @click="addingRoom = false"
          >
            {{ t('maintenance.cancel') }}
          </button>
        </div>
      </form>

      <form
        v-if="showFloorSettings"
        class="flex flex-col gap-4 max-w-md rounded-xl border border-outline-variant/60 p-5"
        @submit.prevent="saveFloor"
      >
        <div class="flex flex-col gap-1.5">
          <label
            for="floor_name"
            class="text-label-md text-on-surface-variant"
          >{{ t('floors.name') }}</label>
          <div :class="fieldWrapClass">
            <input
              id="floor_name"
              v-model="floorForm.name"
              type="text"
              maxlength="40"
              :class="inputClass"
            >
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            :class="primaryButton"
          >
            {{ t('floors.save') }}
          </button>
          <button
            v-if="confirming !== 'floor'"
            type="button"
            :class="outlineButton"
            @click="confirming = 'floor'"
          >
            {{ t('floors.delete') }}
          </button>
        </div>
        <div
          v-if="confirming === 'floor'"
          class="flex flex-col gap-3"
          role="group"
        >
          <p class="text-label-md text-on-surface-variant">
            {{ floor.rooms.length > 0 ? t('floors.deleteConfirm', { name: floorName(floor.id), n: floor.rooms.length }) : t('floors.deleteConfirmEmpty', { name: floorName(floor.id) }) }}
          </p>
          <div class="flex gap-3">
            <button
              type="button"
              :class="dangerButton"
              @click="deleteFloor"
            >
              {{ t('floors.deleteYes') }}
            </button>
            <button
              type="button"
              :class="outlineButton"
              @click="confirming = null"
            >
              {{ t('maintenance.cancel') }}
            </button>
          </div>
        </div>
      </form>

      <p
        v-if="floor.rooms.length === 0"
        class="text-body-md text-on-surface-variant"
      >
        {{ t('floors.empty') }}
      </p>
      <ul
        v-else
        class="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <li
          v-for="r in floor.rooms"
          :key="r.id"
        >
          <button
            type="button"
            :class="cardClass"
            @click="go(floorId, r.id, '')"
          >
            <span class="min-w-0">
              <span class="block text-headline-md text-on-surface">{{ roomName(r.id) }}</span>
              <span class="block text-label-md text-on-surface-variant">
                {{ t(`common.${r.size}`) }} ({{ ROOM_SIZE_SQM_RANGES[r.size] }}), {{ countText('rooms.unitCount', r.units.length) }}
              </span>
            </span>
            <span
              class="material-symbols-outlined text-on-surface-variant shrink-0"
              aria-hidden="true"
            >chevron_right</span>
          </button>
        </li>
      </ul>
    </template>

    <!-- Level 3: air conditioners of a room -->
    <template v-else-if="level === 3 && room">
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          :class="primaryButton"
          @click="go(floorId, roomId, NEW_UNIT)"
        >
          {{ t('rooms.addUnit') }}
        </button>
        <button
          type="button"
          :class="outlineButton"
          :aria-expanded="showRoomSettings"
          @click="showRoomSettings = !showRoomSettings"
        >
          {{ t('rooms.settings') }}
        </button>
      </div>

      <form
        v-if="showRoomSettings"
        class="flex flex-col gap-4 max-w-md rounded-xl border border-outline-variant/60 p-5"
        @submit.prevent="saveRoom"
      >
        <div class="flex flex-col gap-1.5">
          <label
            for="room_name"
            class="text-label-md text-on-surface-variant"
          >{{ t('rooms.roomName') }}</label>
          <div :class="fieldWrapClass">
            <input
              id="room_name"
              v-model="roomForm.name"
              type="text"
              maxlength="60"
              :class="inputClass"
            >
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            for="room_floor"
            class="text-label-md text-on-surface-variant"
          >{{ t('rooms.floor') }}</label>
          <div :class="fieldWrapClass">
            <select
              id="room_floor"
              v-model="roomForm.floorId"
              :class="selectClass"
            >
              <option
                v-for="f in demoFloors"
                :key="f.id"
                :value="f.id"
              >
                {{ floorName(f.id) }}
              </option>
            </select>
            <span
              class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
              aria-hidden="true"
            >expand_more</span>
          </div>
        </div>
        <fieldset class="flex flex-wrap gap-x-6 gap-y-1">
          <legend class="text-label-md text-on-surface-variant mb-1">
            {{ t('information.roomSize') }}
          </legend>
          <label
            v-for="size in SIZES"
            :key="size"
            class="flex items-center gap-2 min-h-11 cursor-pointer"
          >
            <input
              v-model="roomForm.size"
              type="radio"
              name="room_size"
              :value="size"
              class="accent-primary w-4 h-4"
            >
            {{ t(`common.${size}`) }}
            <span class="text-on-surface-variant text-label-md">({{ ROOM_SIZE_SQM_RANGES[size] }})</span>
          </label>
        </fieldset>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            :class="primaryButton"
          >
            {{ t('rooms.saveRoom') }}
          </button>
          <button
            v-if="confirming !== 'room'"
            type="button"
            :class="outlineButton"
            @click="confirming = 'room'"
          >
            {{ t('rooms.deleteRoom') }}
          </button>
        </div>
        <div
          v-if="confirming === 'room'"
          class="flex flex-col gap-3"
          role="group"
        >
          <p class="text-label-md text-on-surface-variant">
            {{ t('rooms.deleteRoomConfirm', { name: roomName(room.id), n: room.units.length }) }}
          </p>
          <div class="flex gap-3">
            <button
              type="button"
              :class="dangerButton"
              @click="deleteRoom"
            >
              {{ t('rooms.deleteRoomYes') }}
            </button>
            <button
              type="button"
              :class="outlineButton"
              @click="confirming = null"
            >
              {{ t('maintenance.cancel') }}
            </button>
          </div>
        </div>
      </form>

      <ul class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <li
          v-for="u in room.units"
          :key="u.id"
        >
          <button
            type="button"
            :class="cardClass"
            @click="go(floorId, roomId, u.id)"
          >
            <span class="min-w-0">
              <span class="block text-headline-md text-on-surface">{{ unitName(u) }}</span>
              <span class="block text-label-md text-on-surface-variant">
                {{ tiles.get(u.id) ? `${tiles.get(u.id)?.setpointC}°C, ` : '' }}{{ t(`maintenance.status.${tiles.get(u.id)?.severity ?? 'healthy'}`) }}
              </span>
            </span>
            <span
              class="material-symbols-outlined text-on-surface-variant shrink-0"
              aria-hidden="true"
            >chevron_right</span>
          </button>
        </li>
      </ul>
    </template>

    <!-- Level 4: one air conditioner -->
    <form
      v-else-if="level === 4"
      class="flex flex-col gap-5 max-w-2xl"
      @submit.prevent="saveUnit"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="flex flex-col gap-1.5">
          <label
            for="unit_label"
            class="text-label-md text-on-surface-variant"
          >{{ t('rooms.unitName') }}</label>
          <div :class="fieldWrapClass">
            <input
              id="unit_label"
              v-model="unitForm.label"
              type="text"
              maxlength="40"
              :placeholder="t('rooms.unitNameHint')"
              :class="inputClass"
            >
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            for="unit_seer"
            class="text-label-md text-on-surface-variant"
          >{{ t('information.seerValue') }}</label>
          <div :class="fieldWrapClass">
            <input
              id="unit_seer"
              v-model="unitForm.seer"
              type="text"
              inputmode="decimal"
              :class="inputClass"
            >
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            for="unit_capacity"
            class="text-label-md text-on-surface-variant"
          >{{ t('information.coolingCapacity') }} <span class="font-normal text-on-surface-variant">{{ t('information.btuHint') }}</span></label>
          <div :class="fieldWrapClass">
            <input
              id="unit_capacity"
              v-model="unitForm.capacity"
              type="text"
              inputmode="decimal"
              :class="inputClass"
            >
          </div>
        </div>
        <div
          v-if="isThailand"
          class="flex flex-col gap-1.5"
        >
          <label
            for="unit_egat"
            class="text-label-md text-on-surface-variant"
          >{{ t('information.energyLabel') }}</label>
          <div :class="fieldWrapClass">
            <select
              id="unit_egat"
              v-model="unitForm.egat"
              :class="selectClass"
            >
              <option value="">
                {{ t('information.selectStars') }}
              </option>
              <option
                v-for="opt in EGAT_OPTIONS"
                :key="opt"
                :value="opt"
              >
                {{ egatText(opt) }}
              </option>
            </select>
            <span
              class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
              aria-hidden="true"
            >expand_more</span>
          </div>
        </div>
      </div>
      <div class="flex gap-3">
        <button
          type="submit"
          :class="primaryButton"
        >
          {{ t('information.save') }}
        </button>
        <button
          type="button"
          :class="outlineButton"
          @click="back"
        >
          {{ t('maintenance.cancel') }}
        </button>
      </div>

      <section
        v-if="unit"
        class="rounded-xl border border-error/40 p-5 flex flex-col gap-3"
      >
        <h4 class="text-label-md text-on-surface">
          {{ t('device.dangerTitle') }}
        </h4>
        <p class="text-label-md text-on-surface-variant">
          {{ room && room.units.length <= 1 ? t('rooms.lastUnitHint') : t('device.dangerHelp') }}
        </p>
        <div class="flex gap-3">
          <button
            v-if="confirming !== 'unit'"
            type="button"
            :class="outlineButton"
            :disabled="!!room && room.units.length <= 1"
            @click="confirming = 'unit'"
          >
            {{ t('rooms.remove') }}
          </button>
          <template v-else>
            <button
              type="button"
              :class="dangerButton"
              @click="deleteUnit"
            >
              {{ t('rooms.removeYes') }}
            </button>
            <button
              type="button"
              :class="outlineButton"
              @click="confirming = null"
            >
              {{ t('maintenance.cancel') }}
            </button>
          </template>
        </div>
      </section>
    </form>
  </div>
</template>
