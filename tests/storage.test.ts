import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadRules,
  loadState,
  onRulesChanged,
  saveRules,
  saveState,
  STORAGE_KEY,
  type StorageBackend,
} from '../src/lib/storage.js';
import type { BlockRule, StoredState } from '../src/lib/types.js';

interface FakeArea {
  data: Record<string, unknown>;
  failOnSet?: Error;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function fakeArea(initial: Record<string, unknown> = {}): FakeArea {
  const area: FakeArea = {
    data: { ...initial },
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  };
  area.get.mockImplementation((key: string) => Promise.resolve({ [key]: area.data[key] }));
  area.set.mockImplementation((items: Record<string, unknown>) => {
    if (area.failOnSet) return Promise.reject(area.failOnSet);
    Object.assign(area.data, items);
    return Promise.resolve();
  });
  area.remove.mockImplementation((key: string) => {
    delete area.data[key];
    return Promise.resolve();
  });
  return area;
}

interface FakeBackend {
  sync: FakeArea | undefined;
  local: FakeArea;
  listeners: Array<(c: Record<string, browser.storage.StorageChange>, area: string) => void>;
  asBackend(): StorageBackend;
}

function fakeBackend(opts: { withSync?: boolean } = {}): FakeBackend {
  const sync = opts.withSync !== false ? fakeArea() : undefined;
  const local = fakeArea();
  const listeners: FakeBackend['listeners'] = [];
  return {
    sync,
    local,
    listeners,
    asBackend(): StorageBackend {
      const base: StorageBackend = {
        local: local as unknown as browser.storage.StorageArea,
        onChanged: {
          addListener: (cb): void => {
            listeners.push(cb);
          },
          removeListener: (cb): void => {
            const i = listeners.indexOf(cb);
            if (i >= 0) listeners.splice(i, 1);
          },
        },
      };
      if (sync) base.sync = sync as unknown as browser.storage.StorageArea;
      return base;
    },
  };
}

const sampleRule: BlockRule = {
  id: 'r1',
  pattern: 'reddit.com',
  matchType: 'domain',
  enabled: true,
  createdAt: 1234,
};

const sampleState: StoredState = { rules: [sampleRule], version: 1 };

describe('loadState', () => {
  let be: FakeBackend;
  beforeEach(() => {
    be = fakeBackend();
  });

  it('returns empty state when neither store has data', async () => {
    const result = await loadState(be.asBackend());
    expect(result.state.rules).toEqual([]);
    expect(result.state.version).toBe(1);
    expect(result.source).toBe('sync');
  });

  it('reads from sync when available', async () => {
    be.sync!.data[STORAGE_KEY] = sampleState;
    const result = await loadState(be.asBackend());
    expect(result.state).toEqual(sampleState);
    expect(result.source).toBe('sync');
  });

  it('falls back to local if sync is empty', async () => {
    be.local.data[STORAGE_KEY] = sampleState;
    const result = await loadState(be.asBackend());
    expect(result.state).toEqual(sampleState);
    expect(result.source).toBe('local');
  });

  it('falls back to local if sync.get throws', async () => {
    be.sync!.get.mockRejectedValueOnce(new Error('sync unavailable'));
    be.local.data[STORAGE_KEY] = sampleState;
    const result = await loadState(be.asBackend());
    expect(result.source).toBe('local');
  });

  it('ignores malformed stored data', async () => {
    be.sync!.data[STORAGE_KEY] = { not: 'a valid state' };
    const result = await loadState(be.asBackend());
    expect(result.state.rules).toEqual([]);
  });
});

describe('saveState', () => {
  it('writes to sync on success and clears stale local', async () => {
    const be = fakeBackend();
    be.local.data[STORAGE_KEY] = { rules: [], version: 1 };
    const result = await saveState(sampleState, be.asBackend());
    expect(result.target).toBe('sync');
    expect(result.fellBack).toBe(false);
    expect(be.sync!.data[STORAGE_KEY]).toEqual(sampleState);
    expect(be.local.data[STORAGE_KEY]).toBeUndefined();
  });

  it('falls back to local when sync.set rejects (quota exceeded)', async () => {
    const be = fakeBackend();
    be.sync!.failOnSet = new Error('QUOTA_BYTES exceeded');
    const result = await saveState(sampleState, be.asBackend());
    expect(result.target).toBe('local');
    expect(result.fellBack).toBe(true);
    expect(be.local.data[STORAGE_KEY]).toEqual(sampleState);
  });

  it('writes only to local when sync is absent', async () => {
    const be = fakeBackend({ withSync: false });
    const result = await saveState(sampleState, be.asBackend());
    expect(result.target).toBe('local');
    expect(result.fellBack).toBe(false);
    expect(be.local.data[STORAGE_KEY]).toEqual(sampleState);
  });
});

describe('loadRules / saveRules', () => {
  it('round-trips through sync', async () => {
    const be = fakeBackend();
    await saveRules([sampleRule], be.asBackend());
    const rules = await loadRules(be.asBackend());
    expect(rules).toEqual([sampleRule]);
  });

  it('returns [] when nothing stored', async () => {
    const be = fakeBackend();
    expect(await loadRules(be.asBackend())).toEqual([]);
  });
});

describe('onRulesChanged', () => {
  it('invokes the callback with new rules when storage changes', () => {
    const be = fakeBackend();
    const cb = vi.fn();
    onRulesChanged(cb, be.asBackend());
    be.listeners[0]!(
      { [STORAGE_KEY]: { newValue: sampleState, oldValue: undefined } },
      'sync',
    );
    expect(cb).toHaveBeenCalledWith([sampleRule]);
  });

  it('ignores unrelated key changes', () => {
    const be = fakeBackend();
    const cb = vi.fn();
    onRulesChanged(cb, be.asBackend());
    be.listeners[0]!({ other_key: { newValue: 'x', oldValue: undefined } }, 'sync');
    expect(cb).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe function', () => {
    const be = fakeBackend();
    const cb = vi.fn();
    const off = onRulesChanged(cb, be.asBackend());
    expect(be.listeners).toHaveLength(1);
    off();
    expect(be.listeners).toHaveLength(0);
  });
});
