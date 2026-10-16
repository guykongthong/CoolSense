import { onMounted, onUnmounted, ref, watch } from 'vue';
import { supabase } from '../lib/supabaseClient';
import { withProgress } from '../lib/progress';
import { isDemoMode } from '../lib/mock/mode';
import { mockLatestReading, subscribeLive } from '../lib/mock/api';
import { useSelectedFloor } from './useSelectedFloor';

// TODO: ML JSON shape — columns will change once the teammate's
// Google Cloud service output format is known.
interface OccupancyReading {
  id: string;
  people_count: number;
  source: string;
  captured_at: string;
}

export function useOccupancy() {
  const latestReading = ref<OccupancyReading | null>(null);
  const { selectedFloor } = useSelectedFloor();
  if (isDemoMode) watch(selectedFloor, (floor) => (latestReading.value = mockLatestReading(floor)));

  onMounted(async () => {
    if (isDemoMode) {
      latestReading.value = mockLatestReading(selectedFloor.value);
      const stop = subscribeLive((reading) => {
        latestReading.value = reading;
      }, () => selectedFloor.value);
      onUnmounted(stop);
      return;
    }

    const { data } = await withProgress(() =>
      supabase
        .from('occupancy_readings')
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    );

    latestReading.value = data as OccupancyReading | null;

    const channel = supabase
      .channel('occupancy_readings_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'occupancy_readings' },
        (payload) => {
          latestReading.value = payload.new as OccupancyReading;
        },
      )
      .subscribe();

    onUnmounted(() => {
      supabase.removeChannel(channel);
    });
  });

  return { latestReading };
}
