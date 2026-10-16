// Demo mode runs the whole frontend on generated data, no Supabase needed.
// It is on when VITE_DEMO_MODE=true, or when no Supabase URL is configured.
export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === 'true' || !import.meta.env.VITE_SUPABASE_URL;
