/**
 * Supabase client for the MV3 service worker only (no shared chunk with side panel).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { chromeAuthStorage } from './chromeAuthStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let client: SupabaseClient | null = null;

export function getSupabaseWorker(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: chromeAuthStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
