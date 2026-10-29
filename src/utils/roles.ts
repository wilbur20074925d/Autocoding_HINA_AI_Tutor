import type { User } from '../lib/supabase';

type AppRole = 'student' | 'teacher' | 'admin' | null | undefined;

export const isStaffRole = (role?: AppRole): boolean =>
  role === 'teacher' || role === 'admin';

export const courseListVariant = (user: User | null): 'student' | 'teacher' | 'admin' => {
  const role = (user?.role as AppRole) ?? null;
  if (role === 'admin') return 'admin';
  if (role === 'teacher') return 'teacher';
  return 'student';
};
