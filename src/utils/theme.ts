export type ThemePreference = 'light' | 'dark';

const THEME_KEY = 'theme';

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'light';

  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  if (stored === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function applyThemePreference(theme: ThemePreference) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  window.localStorage.setItem(THEME_KEY, theme);
}

export function toggleThemePreference(): ThemePreference {
  const next: ThemePreference = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  applyThemePreference(next);
  return next;
}
