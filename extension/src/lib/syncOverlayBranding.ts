import type { ExtensionUser } from './supabase';
import { initialsFromName, writeOverlayBranding } from '../shared/overlayBranding';

export async function syncOverlayBrandingFromUser(user: ExtensionUser): Promise<void> {
  await writeOverlayBranding({
    userName: user.name || 'You',
    userEmail: user.email,
    userAvatarUrl: user.avatarUrl,
    userInitials: initialsFromName(user.name || '', user.email),
  });
}
