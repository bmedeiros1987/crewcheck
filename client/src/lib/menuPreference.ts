export type MenuFavoriteId = string;

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const MENU_FAVORITES_VERSION = 1;
export const MENU_FAVORITES_LIMIT = 5;
export const DEFAULT_MENU_FAVORITES: MenuFavoriteId[] = ['roster', 'radar', 'departure'];

export function menuFavoritesKey(accountId: string | null | undefined): string | null {
  return accountId?.trim()
    ? `crewcheck:menu-favorites:v${MENU_FAVORITES_VERSION}:${encodeURIComponent(accountId.trim())}`
    : null;
}

export function normalizeMenuFavorites(
  value: unknown,
  allowedIds: readonly string[],
  fallback: readonly string[] = DEFAULT_MENU_FAVORITES,
): MenuFavoriteId[] {
  const allowed = new Set(allowedIds);
  const requested = Array.isArray(value) ? value : fallback;
  return Array.from(new Set(
    requested.filter((item): item is string => typeof item === 'string' && allowed.has(item)),
  )).slice(0, MENU_FAVORITES_LIMIT);
}

export function readMenuFavorites(
  storage: PreferenceStorage,
  accountId: string | null | undefined,
  allowedIds: readonly string[],
): MenuFavoriteId[] {
  const key = menuFavoritesKey(accountId);
  if (!key) return [];
  try {
    const raw = storage.getItem(key);
    return normalizeMenuFavorites(raw ? JSON.parse(raw) : null, allowedIds);
  } catch {
    return normalizeMenuFavorites(null, allowedIds);
  }
}

export function saveMenuFavorites(
  storage: PreferenceStorage,
  accountId: string | null | undefined,
  allowedIds: readonly string[],
  favorites: readonly string[],
): boolean {
  const key = menuFavoritesKey(accountId);
  if (!key) return false;
  try {
    storage.setItem(key, JSON.stringify(normalizeMenuFavorites(favorites, allowedIds, [])));
    return true;
  } catch {
    return false;
  }
}

export function resetMenuFavorites(
  storage: PreferenceStorage,
  accountId: string | null | undefined,
): boolean {
  const key = menuFavoritesKey(accountId);
  if (!key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function foldMenuSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

export function menuEntryMatches(query: string, ...fields: string[]): boolean {
  const normalized = foldMenuSearch(query);
  if (!normalized) return true;
  return foldMenuSearch(fields.join(' ')).includes(normalized);
}
