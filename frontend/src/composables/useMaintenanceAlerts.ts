import { ref, watch } from 'vue';
import { supabase } from '../lib/supabaseClient';
import { evaluateMaintenance } from '../lib/maintenanceApi';
import { isDemoMode } from '../lib/mock/mode';
import { mockOpenAlertCount } from '../lib/mock/maintenance';
import { demoUnits } from '../lib/mock/rooms';

// Shared across the app so the nav badge and the Maintenance page agree.
const openCount = ref(0);
let started = false;

async function refreshOpenCount() {
  if (isDemoMode) {
    openCount.value = mockOpenAlertCount();
    return;
  }
  const { count, error } = await supabase
    .from('maintenance_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (!error) openCount.value = count ?? 0;
}

// Evaluates once on app start, then follows alert changes through Realtime.
function start() {
  if (started) return;
  started = true;
  if (isDemoMode) {
    refreshOpenCount();
    // Adding or removing a unit changes which alerts count.
    watch(demoUnits, refreshOpenCount);
    return;
  }
  evaluateMaintenance()
    .catch((e) => console.error('Maintenance evaluation failed', e))
    .finally(refreshOpenCount);
  supabase
    .channel('maintenance_alerts_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_alerts' }, () => {
      refreshOpenCount();
    })
    .subscribe();
}

export function useMaintenanceAlerts() {
  start();
  return { openCount, refreshOpenCount };
}
