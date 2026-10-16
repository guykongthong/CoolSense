import { addBuilding, demoBuildings, removeBuilding, updateBuilding, type Building } from '../lib/mock/buildings';
import { removeBuildingData, seedBuildingDefaults } from '../lib/mock/rooms';
import { selectedBuildingId, setBuilding } from './useSelectedBuilding';

// Building changes that also have to touch the floors, rooms and units.
export function useBuildings() {
  function add(name: string, location: string): Building {
    const building = addBuilding(name, location);
    // So the new building is usable straight away: Floor 1, a room, a unit.
    seedBuildingDefaults(building.id);
    return building;
  }

  function remove(id: string): boolean {
    const wasSelected = selectedBuildingId.value === id;
    if (!removeBuilding(id)) return false;
    removeBuildingData(id);
    if (wasSelected) setBuilding(demoBuildings.value[0].id);
    return true;
  }

  return { buildings: demoBuildings, selectedBuildingId, setBuilding, add, update: updateBuilding, remove };
}
