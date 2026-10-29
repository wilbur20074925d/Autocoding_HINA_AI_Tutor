import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { chromeAuthStorage } from './chromeAuthStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env from project root.');
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

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export interface ExtensionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

function mapUserRow(row: {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  avatar_url?: string | null;
}): ExtensionUser {
  return {
    id: row.id,
    name: row.name || 'User',
    email: row.email || '',
    role: row.role || 'student',
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
  };
}

export async function fetchExtensionUser(userId: string): Promise<ExtensionUser | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('HINA_users')
    .select('id, name, email, role, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    const legacy = await supabase
      .from('users')
      .select('id, name, email, role, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (legacy.error || !legacy.data) return null;
    return mapUserRow(legacy.data as { id: string; name?: string; email?: string; role?: string; avatar_url?: string | null });
  }
  return mapUserRow(data as { id: string; name?: string; email?: string; role?: string; avatar_url?: string | null });
}
