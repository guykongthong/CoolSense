import { computed, onMounted, ref, watch } from 'vue';
import {
  evaluateMaintenance,
  evaluateMaintenanceUnits,
  generateMaintenanceDemoData,
  listMaintenanceAlerts,
  markServiced,
  updateMaintenanceAlert,
  type MaintenanceAlert,
  type MaintenanceEvaluation,
} from '../lib/maintenanceApi';
import { isDemoMode } from '../lib/mock/mode';
import { findUnit, floorsInScope, type DemoFloor, type DemoRoom } from '../lib/mock/rooms';
import { compareByStatus, needsAttention } from '../components/maintenance/status';
import { floorName, roomName, unitName, useSelectedFloor } from './useSelectedFloor';
import { useMaintenanceAlerts } from './useMaintenanceAlerts';
import { t } from '../lib/i18n';

// The real backend tracks one unit, it gets this id.
export const REAL_UNIT_ID = 'real';

export interface UnitEntry {
  id: string;
  floorId: string;
  roomId: string;
  evaluation: MaintenanceEvaluation;
}

export interface RoomGroup {
  room: DemoRoom;
  units: UnitEntry[];
}

export interface FloorGroup {
  floor: DemoFloor;
  rooms: RoomGroup[];
  unitCount: number;
  attention: number;
  openAlerts: number;
  // Oldest "last cleaned" date on the floor, null when a unit has none.
  oldestCleaned: string | null;
  neverCleaned: boolean;
}

// Demo mode: the evaluation of every unit in scope, grouped floor > room > unit.
// Real mode: one unit, no grouping.
export function useMaintenancePage() {
  const { selectedFloor, ALL_FLOORS } = useSelectedFloor();
  const { refreshOpenCount } = useMaintenanceAlerts();

  const loading = ref(true);
  const loadError = ref(false);
  const actionError = ref(false);
  const busy = ref<'evaluate' | 'service' | 'demo' | null>(null);

  const entries = ref<UnitEntry[]>([]);
  const alerts = ref<MaintenanceAlert[]>([]);
  const selectedId = ref<string | null>(null);
  const openFloors = ref<string[]>([]);
  let closedByUser = false;
  let floorsInitialised = false;

  const allFloors = computed(() => selectedFloor.value === ALL_FLOORS);

  const groups = computed<FloorGroup[]>(() => {
    if (!isDemoMode) return [];
    const byId = new Map(entries.value.map((e) => [e.id, e]));
    return floorsInScope(selectedFloor.value).map((floor) => {
      const rooms = floor.rooms.map((room) => ({
        room,
        units: room.units
          .map((u) => byId.get(u.id))
          .filter((e): e is UnitEntry => !!e)
          .sort((a, b) => compareByStatus(a.evaluation, b.evaluation)),
      }));
      const all = rooms.flatMap((r) => r.units);
      const ids = new Set(all.map((u) => u.id));
      const dates = all.map((u) => u.evaluation.last_serviced_at);
      const known = dates.filter((d): d is string => !!d).sort();
      return {
        floor,
        rooms,
        unitCount: all.length,
        attention: all.filter((u) => needsAttention(u.evaluation)).length,
        openAlerts: alerts.value.filter((a) => a.status === 'open' && a.unit_id && ids.has(a.unit_id)).length,
        oldestCleaned: known[0] ?? null,
        neverCleaned: dates.some((d) => !d),
      };
    });
  });

  const selected = computed(() => entries.value.find((e) => e.id === selectedId.value) ?? null);

  // "Floor 2 > Open Office North > Unit 2", empty in real mode.
  function unitPath(unitId: string): string[] {
    if (!isDemoMode) return [];
    const found = findUnit(unitId);
    if (!found) return [];
    return [floorName(found.room.floorId), roomName(found.room.id), unitName(found.unit)];
  }
  function unitTitle(unitId: string): string {
    const p = unitPath(unitId);
    return p.length ? p.join(' > ') : t('maintenance.realUnit');
  }

  async function loadAlerts() {
    alerts.value = await listMaintenanceAlerts(undefined, selectedFloor.value);
  }

  function applyDefaults() {
    const ids = new Set(entries.value.map((e) => e.id));
    if (selectedId.value && !ids.has(selectedId.value)) selectedId.value = null;
    if (!isDemoMode) {
      selectedId.value = REAL_UNIT_ID;
      return;
    }
    if (!selectedId.value && !closedByUser) {
      const worst = [...entries.value].sort((a, b) => compareByStatus(a.evaluation, b.evaluation))[0];
      if (worst && needsAttention(worst.evaluation)) selectedId.value = worst.id;
    }
    if (!floorsInitialised && groups.value.length) {
      floorsInitialised = true;
      openFloors.value = groups.value.filter((g) => g.attention > 0).map((g) => g.floor.id);
    }
    const sel = selected.value;
    if (sel && !openFloors.value.includes(sel.floorId)) openFloors.value = [...openFloors.value, sel.floorId];
  }

  async function load(runEvaluation = true) {
    loadError.value = false;
    try {
      if (runEvaluation) {
        if (isDemoMode) {
          const list = await evaluateMaintenanceUnits(selectedFloor.value);
          entries.value = list.map((u) => ({
            id: u.unit_id,
            roomId: u.room_id,
            floorId: findUnit(u.unit_id)?.room.floorId ?? '',
            evaluation: u.evaluation,
          }));
        } else {
          const result = await evaluateMaintenance();
          entries.value = [{ id: REAL_UNIT_ID, floorId: '', roomId: '', evaluation: result.evaluation }];
        }
      }
      await loadAlerts();
      applyDefaults();
      refreshOpenCount();
    } catch (e) {
      console.error(e);
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => load());

  watch(selectedFloor, () => {
    selectedId.value = null;
    closedByUser = false;
    floorsInitialised = false;
    load();
  });

  async function run(kind: 'evaluate' | 'service' | 'demo', fn: () => Promise<unknown>) {
    busy.value = kind;
    actionError.value = false;
    try {
      await fn();
      await load(true);
    } catch (e) {
      console.error(e);
      actionError.value = true;
    } finally {
      busy.value = null;
    }
  }

  const evaluateAll = () => run('evaluate', async () => {});
  const markCleaned = (unitId: string) => run('service', () => markServiced(unitId === REAL_UNIT_ID ? undefined : unitId));
  const generateDemo = () => run('demo', generateMaintenanceDemoData);

  async function respond(alert: MaintenanceAlert, status: 'acknowledged' | 'dismissed', note?: string) {
    actionError.value = false;
    try {
      await updateMaintenanceAlert(alert.id, status, note);
      await load(false);
    } catch (e) {
      console.error(e);
      actionError.value = true;
    }
  }

  function select(id: string) {
    closedByUser = false;
    selectedId.value = id;
    const entry = entries.value.find((e) => e.id === id);
    if (entry && !openFloors.value.includes(entry.floorId)) openFloors.value = [...openFloors.value, entry.floorId];
  }
  function clearSelection() {
    closedByUser = true;
    selectedId.value = null;
  }

  function toggleFloor(id: string) {
    openFloors.value = openFloors.value.includes(id) ? openFloors.value.filter((f) => f !== id) : [...openFloors.value, id];
  }
  const everyFloorOpen = computed(() => groups.value.every((g) => openFloors.value.includes(g.floor.id)));
  function toggleAll() {
    openFloors.value = everyFloorOpen.value ? [] : groups.value.map((g) => g.floor.id);
  }

  return {
    loading, loadError, actionError, busy, entries, alerts, groups, selected, selectedId, allFloors,
    openFloors, everyFloorOpen, unitPath, unitTitle, load, evaluateAll, markCleaned, generateDemo,
    respond, select, clearSelection, toggleFloor, toggleAll,
  };
}
