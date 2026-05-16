import { describe, expect, it } from 'vitest';
import { BLOCK_MESSAGES, pickMessage } from '../src/blocked/messages.js';

describe('BLOCK_MESSAGES', () => {
  it('has at least a few entries so the rotation feels varied', () => {
    expect(BLOCK_MESSAGES.length).toBeGreaterThanOrEqual(5);
  });

  it('every entry has a non-empty headline and lede', () => {
    for (const m of BLOCK_MESSAGES) {
      expect(m.headline.trim()).not.toBe('');
      expect(m.lede.trim()).not.toBe('');
    }
  });

  it('does not duplicate any headline (each load should feel distinct)', () => {
    const headlines = new Set(BLOCK_MESSAGES.map((m) => m.headline));
    expect(headlines.size).toBe(BLOCK_MESSAGES.length);
  });
});

describe('pickMessage', () => {
  it('returns the first entry when the rng returns 0', () => {
    expect(pickMessage(() => 0)).toBe(BLOCK_MESSAGES[0]);
  });

  it('returns the last entry when the rng returns just under 1', () => {
    const last = BLOCK_MESSAGES[BLOCK_MESSAGES.length - 1];
    expect(pickMessage(() => 0.9999999)).toBe(last);
  });

  it('clamps an out-of-spec rng value to a valid entry', () => {
    // Math.random is documented as [0, 1) but we don't trust it.
    expect(BLOCK_MESSAGES).toContain(pickMessage(() => 1));
    expect(BLOCK_MESSAGES).toContain(pickMessage(() => 1.5));
    expect(BLOCK_MESSAGES).toContain(pickMessage(() => -0.5));
  });

  it('default rng (Math.random) always returns an entry from the pool', () => {
    for (let i = 0; i < 50; i++) {
      expect(BLOCK_MESSAGES).toContain(pickMessage());
    }
  });
});
