import { supabase } from '../lib/supabase';

export const HINA_USERS_TABLE = 'HINA_users';
const LEGACY_USERS_TABLE = 'users';

export interface HinaUserRow {
  id: string;
  name: string;
  email: string | null;
  role: string;
  avatar_url: string | null;
  enrolled_course_ids: string[];
  twofa_secret: string | null;
  twofa_enabled: boolean;
  twofa_enrolled_at: string | null;
  created_at: string;
  updated_at: string;
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /HINA_users|schema cache/i.test(error.message || '');
}

function asRow(data: Record<string, unknown> | null | undefined): HinaUserRow | null {
  if (!data?.id) return null;
  return {
    id: String(data.id),
    name: String(data.name ?? ''),
    email: data.email ? String(data.email) : null,
    role: String(data.role ?? 'student'),
    avatar_url: data.avatar_url ? String(data.avatar_url) : null,
    enrolled_course_ids: Array.isArray(data.enrolled_course_ids)
      ? data.enrolled_course_ids.map((id) => String(id))
      : [],
    twofa_secret: data.twofa_secret ? String(data.twofa_secret) : null,
    twofa_enabled: Boolean(data.twofa_enabled),
    twofa_enrolled_at: data.twofa_enrolled_at ? String(data.twofa_enrolled_at) : null,
    created_at: String(data.created_at ?? new Date().toISOString()),
    updated_at: String(data.updated_at ?? data.created_at ?? new Date().toISOString()),
  };
}

async function readTable(table: string, userId: string): Promise<{ row: HinaUserRow | null; missing: boolean }> {
  if (!supabase) return { row: null, missing: true };
  const { data, error } = await supabase.from(table).select('*').eq('id', userId).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return { row: null, missing: true };
    console.error(`[HinaUserStore] Failed to read ${table}:`, error.message);
    return { row: null, missing: false };
  }
  return { row: asRow(data as Record<string, unknown> | null), missing: false };
}

async function copyLegacyRow(row: HinaUserRow): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from(HINA_USERS_TABLE).upsert(
    {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      avatar_url: row.avatar_url,
      enrolled_course_ids: row.enrolled_course_ids,
      twofa_secret: row.twofa_secret,
      twofa_enabled: row.twofa_enabled,
      twofa_enrolled_at: row.twofa_enrolled_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );
  if (error && !isMissingRelation(error)) {
    console.warn('[HinaUserStore] Could not copy legacy account into HINA_users:', error.message);
  }
}

/** Read the login profile from HINA_users, copying the old users row when needed. */
export async function fetchHinaUser(userId: string): Promise<HinaUserRow | null> {
  const primary = await readTable(HINA_USERS_TABLE, userId);
  if (primary.row) return primary.row;

  const legacy = await readTable(LEGACY_USERS_TABLE, userId);
  if (!legacy.row) return null;
  if (!primary.missing) await copyLegacyRow(legacy.row);
  return legacy.row;
}

export async function saveHinaUser(row: HinaUserRow): Promise<HinaUserRow | null> {
  if (!supabase) return null;
  const payload = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role || 'student',
    avatar_url: row.avatar_url,
    enrolled_course_ids: row.enrolled_course_ids,
    twofa_secret: row.twofa_secret,
    twofa_enabled: row.twofa_enabled,
    twofa_enrolled_at: row.twofa_enrolled_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  const { data, error } = await supabase
    .from(HINA_USERS_TABLE)
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .maybeSingle();
  if (!error) return asRow(data as Record<string, unknown> | null) ?? row;
  if (!isMissingRelation(error)) {
    console.error('[HinaUserStore] Failed to save HINA_users row:', error.message);
  }
  return null;
}

export async function fetchHinaUsersByIds(
  userIds: string[],
  columns = 'id, name, email, role, avatar_url, created_at, updated_at'
): Promise<HinaUserRow[]> {
  if (!supabase || userIds.length === 0) return [];
  const mapRows = (data: unknown): HinaUserRow[] =>
    ((data || []) as Record<string, unknown>[]).map((row) => asRow(row)).filter((row): row is HinaUserRow => !!row);

  const primary = await supabase.from(HINA_USERS_TABLE).select(columns).in('id', userIds);
  const primaryRows = primary.error ? [] : mapRows(primary.data);
  if (primary.error && !isMissingRelation(primary.error)) {
    console.warn('[HinaUserStore] Failed to load HINA_users profiles:', primary.error.message);
  }

  const found = new Set(primaryRows.map((row) => row.id));
  const missingIds = userIds.filter((id) => !found.has(id));
  if (!primary.error && missingIds.length === 0) return primaryRows;

  const legacy = await supabase.from(LEGACY_USERS_TABLE).select(columns).in('id', missingIds.length ? missingIds : userIds);
  if (legacy.error) {
    console.warn('[HinaUserStore] Failed to load legacy user profiles:', legacy.error.message);
    return primaryRows;
  }
  const legacyRows = mapRows(legacy.data);
  if (!primary.error) {
    await Promise.all(legacyRows.map((row) => copyLegacyRow(row)));
  }
  return [...primaryRows, ...legacyRows];
}

export async function updateHinaUser(
  userId: string,
  updates: Record<string, unknown>
): Promise<{ data: HinaUserRow | null; error: Error | null }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase is not configured. Please set up your Supabase project first.') };
  }

  const primary = await supabase
    .from(HINA_USERS_TABLE)
    .update(updates)
    .eq('id', userId)
    .select('*')
    .maybeSingle();

  if (!primary.error) {
    return { data: asRow(primary.data as Record<string, unknown> | null), error: null };
  }

  if (!isMissingRelation(primary.error)) {
    return { data: null, error: new Error(primary.error.message) };
  }

  const legacy = await supabase
    .from(LEGACY_USERS_TABLE)
    .update(updates)
    .eq('id', userId)
    .select('*')
    .maybeSingle();
  if (legacy.error) return { data: null, error: new Error(legacy.error.message) };
  return { data: asRow(legacy.data as Record<string, unknown> | null), error: null };
}
