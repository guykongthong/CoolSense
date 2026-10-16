import { onMounted, onUnmounted, ref, watch } from 'vue';
import { supabase } from '../lib/supabaseClient';
import { withProgress } from '../lib/progress';
import { isDemoMode } from '../lib/mock/mode';
import { mockCalculation, subscribeLive } from '../lib/mock/api';
import type { AcMode } from '../lib/api';
import { useSelectedFloor } from './useSelectedFloor';

interface AcCalculationReading {
  id: string;
  temperature_c: number;
  ac_mode: AcMode;
  capacity_constrained: boolean;
  calculated_at: string;
}

// Mirrors useOccupancy.ts's pattern: initial fetch of the latest row, then a
// realtime subscription so it updates live as /calculation runs (each call
// inserts a fresh ac_calculations row) without polling.
export function useAcCalculation() {
  const latestCalculation = ref<AcCalculationReading | null>(null);
  const { selectedFloor } = useSelectedFloor();
  if (isDemoMode) watch(selectedFloor, (floor) => (latestCalculation.value = mockCalculation(floor) as AcCalculationReading));

  onMounted(async () => {
    if (isDemoMode) {
      latestCalculation.value = mockCalculation(selectedFloor.value) as AcCalculationReading;
      const stop = subscribeLive((_reading, calc) => {
        latestCalculation.value = calc as AcCalculationReading;
      }, () => selectedFloor.value);
      onUnmounted(stop);
      return;
    }

    const { data } = await withProgress(() =>
      supabase
        .from('ac_calculations')
        .select('id, temperature_c, ac_mode, capacity_constrained, calculated_at')
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    );

    latestCalculation.value = data as AcCalculationReading | null;

    const channel = supabase
      .channel('ac_calculations_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ac_calculations' },
        (payload) => {
          latestCalculation.value = payload.new as AcCalculationReading;
        },
      )
      .subscribe();

    onUnmounted(() => {
      supabase.removeChannel(channel);
    });
  });

  return { latestCalculation };
}
