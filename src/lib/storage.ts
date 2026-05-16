import {
  CURRENT_SCHEMA_VERSION,
  type BlockRule,
  type StoredState,
} from './types.js';

/**
 * Typed wrapper around browser.storage.
 *
 * Primary store is `sync` (rules follow the user across devices via Firefox Sync).
 * On quota errors or sync unavailability we transparently fall back to `local`.
 * The active store is reported back so the UI can surface a one-time warning
 * if we had to fall back.
 */

export const STORAGE_KEY = 'bouncer_state';

export type StoreName = 'sync' | 'local';

export interface LoadResult {
  state: StoredState;
  /** Which underlying store the state was read from. */
  source: StoreName;
}

export interface SaveResult {
  /** Which underlying store the state was written to. */
  target: StoreName;
  /** True if we fell back to local because sync rejected the write. */
  fellBack: boolean;
}

const EMPTY_STATE: StoredState = {
  rules: [],
  version: CURRENT_SCHEMA_VERSION,
};

type StorageArea = browser.storage.StorageArea;

/** Minimal surface of `browser.storage` we depend on — makes testing easy. */
export interface StorageBackend {
  sync?: StorageArea;
  local: StorageArea;
  onChanged: {
    addListener: (cb: (changes: Record<string, browser.storage.StorageChange>, area: string) => void) => void;
    removeListener: (cb: (changes: Record<string, browser.storage.StorageChange>, area: string) => void) => void;
  };
}

function defaultBackend(): StorageBackend {
  // `browser` is provided by the WebExtension polyfill in non-test contexts.
  return (globalThis as unknown as { browser: { storage: StorageBackend } }).browser.storage;
}

function isStoredState(value: unknown): value is StoredState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { rules?: unknown; version?: unknown };
  return Array.isArray(v.rules) && typeof v.version === 'number';
}

async function readFrom(area: StorageArea | undefined): Promise<StoredState | null> {
  if (!area) return null;
  try {
    const result = (await area.get(STORAGE_KEY)) as Record<string, unknown>;
    const raw = result[STORAGE_KEY];
    return isStoredState(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function loadState(backend: StorageBackend = defaultBackend()): Promise<LoadResult> {
  const fromSync = await readFrom(backend.sync);
  if (fromSync) return { state: fromSync, source: 'sync' };

  const fromLocal = await readFrom(backend.local);
  if (fromLocal) return { state: fromLocal, source: 'local' };

  return { state: EMPTY_STATE, source: backend.sync ? 'sync' : 'local' };
}

export async function saveState(
  state: StoredState,
  backend: StorageBackend = defaultBackend(),
): Promise<SaveResult> {
  const payload = { [STORAGE_KEY]: state };

  if (backend.sync) {
    try {
      await backend.sync.set(payload);
      // Clear stale local copy so we never read out-of-date local data later.
      await backend.local.remove(STORAGE_KEY).catch(() => undefined);
      return { target: 'sync', fellBack: false };
    } catch {
      // Quota exceeded, sync unavailable, or other transient error.
    }
  }

  await backend.local.set(payload);
  return { target: 'local', fellBack: backend.sync !== undefined };
}

export async function loadRules(backend?: StorageBackend): Promise<BlockRule[]> {
  const { state } = await loadState(backend);
  return state.rules;
}

export async function saveRules(
  rules: BlockRule[],
  backend?: StorageBackend,
): Promise<SaveResult> {
  return saveState({ rules, version: CURRENT_SCHEMA_VERSION }, backend);
}

/** Subscribe to rule changes from any source (e.g. another tab editing rules). */
export function onRulesChanged(
  callback: (rules: BlockRule[]) => void,
  backend: StorageBackend = defaultBackend(),
): () => void {
  const listener = (changes: Record<string, browser.storage.StorageChange>): void => {
    const change = changes[STORAGE_KEY];
    if (!change) return;
    const next: unknown = change.newValue;
    if (isStoredState(next)) callback(next.rules);
  };
  backend.onChanged.addListener(listener);
  return () => backend.onChanged.removeListener(listener);
}
