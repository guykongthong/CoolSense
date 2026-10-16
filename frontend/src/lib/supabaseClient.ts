import { createClient } from '@supabase/supabase-js';
import { isDemoMode } from './mock/mode';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!isDemoMode && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — see .env.example');
}

// Demo mode never calls this client, but createClient throws on an empty URL,
// so give it a placeholder.
export const supabase = isDemoMode
  ? createClient('http://localhost:54321', 'demo-anon-key')
  : createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
