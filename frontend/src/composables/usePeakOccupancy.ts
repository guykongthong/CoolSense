import { onMounted, onUnmounted, ref } from 'vue';
import { supabase } from '../lib/supabaseClient';
import { getPeakOccupancyToday, type OccupancyPeak } from '../lib/api';
import { withProgress } from '../lib/progress';

export function usePeakOccupancy() {
  const peak = ref<OccupancyPeak | null>(null);

  async function refresh() {
    try {
      peak.value = await getPeakOccupancyToday();
    } catch {
      // Leave whatever was last displayed rather than blanking it on a transient failure.
    }
  }

  onMounted(() => {
    // Only the initial load shows the progress bar — the Realtime-triggered
    // refetches below happen silently in the background (same reasoning as
    // useOccupancy.ts/useAcCalculation.ts: showing the bar on every
    // subscription callback would flash it continuously and defeat its
    // purpose as a "the page is doing something" signal).
    withProgress(refresh);

    // A new peak (or the day's first reading) can only ever be introduced by
    // an INSERT, so refetch on every new occupancy_readings row — same "keep
    // it live" approach useOccupancy.ts uses for the current-occupancy stat.
    const channel = supabase
      .channel('occupancy_readings_peak')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'occupancy_readings' }, refresh)
      .subscribe();

    onUnmounted(() => {
      supabase.removeChannel(channel);
    });
  });

  return { peak };
}
