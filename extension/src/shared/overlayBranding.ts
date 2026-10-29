export const OVERLAY_BRANDING_KEY = 'hina_overlay_branding';

export interface OverlayBranding {
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  userInitials: string;
}

export function initialsFromName(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  if (parts.length === 1 && parts[0].length >= 1) return parts[0].slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

export function tutorIconUrl(): string {
  return chrome.runtime.getURL('hina-icon.png');
}

export async function readOverlayBranding(): Promise<OverlayBranding> {
  const stored = await chrome.storage.local.get(OVERLAY_BRANDING_KEY);
  const bag = stored[OVERLAY_BRANDING_KEY] as OverlayBranding | undefined;
  if (bag?.userName) return bag;
  return {
    userName: 'You',
    userEmail: '',
    userAvatarUrl: null,
    userInitials: 'U',
  };
}

export async function writeOverlayBranding(branding: OverlayBranding): Promise<void> {
  await chrome.storage.local.set({ [OVERLAY_BRANDING_KEY]: branding });
}
