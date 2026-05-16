import { describe, expect, it } from 'vitest';
import {
  createRule,
  deserializeRules,
  filterRules,
  isDuplicate,
  serializeRules,
  updateRule,
  validatePattern,
} from '../src/lib/rules.js';
import type { BlockRule } from '../src/lib/types.js';

const sample = (overrides: Partial<BlockRule> = {}): BlockRule => ({
  id: 'r-1',
  pattern: 'reddit.com',
  matchType: 'domain',
  enabled: true,
  createdAt: 1000,
  ...overrides,
});

describe('validatePattern', () => {
  it('rejects empty / whitespace patterns', () => {
    expect(validatePattern('', 'exact').valid).toBe(false);
    expect(validatePattern('   ', 'exact').valid).toBe(false);
    expect(validatePattern('reddit .com', 'domain').valid).toBe(false);
  });

  describe('exact', () => {
    it('accepts a full URL', () => {
      expect(validatePattern('https://example.com/foo', 'exact').valid).toBe(true);
    });

    it('rejects a bare domain', () => {
      expect(validatePattern('example.com', 'exact').valid).toBe(false);
    });

    it('rejects non-http(s) schemes', () => {
      // These all parse as URLs but never match real navigations and should
      // not be storable even as inert data.
      expect(validatePattern('javascript:alert(1)', 'exact').valid).toBe(false);
      expect(validatePattern('data:text/html,<script>x</script>', 'exact').valid).toBe(false);
      expect(validatePattern('file:///etc/passwd', 'exact').valid).toBe(false);
      expect(validatePattern('chrome://settings', 'exact').valid).toBe(false);
    });
  });

  describe('domain', () => {
    it('accepts a bare domain', () => {
      expect(validatePattern('reddit.com', 'domain').valid).toBe(true);
    });

    it('accepts a subdomain', () => {
      expect(validatePattern('news.ycombinator.com', 'domain').valid).toBe(true);
    });

    it('strips scheme and path', () => {
      expect(validatePattern('https://reddit.com/r/foo', 'domain').valid).toBe(true);
    });

    it('rejects single-label hostnames', () => {
      expect(validatePattern('localhost', 'domain').valid).toBe(false);
    });

    it('rejects wildcards', () => {
      expect(validatePattern('*.reddit.com', 'domain').valid).toBe(false);
    });
  });

  describe('wildcard', () => {
    it('requires a *', () => {
      expect(validatePattern('reddit.com', 'wildcard').valid).toBe(false);
      expect(validatePattern('*.reddit.com', 'wildcard').valid).toBe(true);
    });

    it('rejects overly broad patterns', () => {
      expect(validatePattern('*', 'wildcard').valid).toBe(false);
      expect(validatePattern('*.*', 'wildcard').valid).toBe(false);
    });
  });
});

describe('createRule', () => {
  it('assigns a unique id and timestamp', () => {
    const a = createRule({ pattern: 'reddit.com', matchType: 'domain' });
    const b = createRule({ pattern: 'reddit.com', matchType: 'domain' });
    expect(a.id).not.toBe(b.id);
    expect(typeof a.createdAt).toBe('number');
  });

  it('trims pattern and note', () => {
    const r = createRule({ pattern: '  reddit.com  ', matchType: 'domain', note: '  focus  ' });
    expect(r.pattern).toBe('reddit.com');
    expect(r.note).toBe('focus');
  });

  it('omits note when blank', () => {
    const r = createRule({ pattern: 'reddit.com', matchType: 'domain', note: '   ' });
    expect(r.note).toBeUndefined();
  });

  it('defaults to enabled', () => {
    expect(createRule({ pattern: 'reddit.com', matchType: 'domain' }).enabled).toBe(true);
  });
});

describe('updateRule', () => {
  it('returns a new rule with patched fields', () => {
    const original = sample({ enabled: true });
    const next = updateRule(original, { enabled: false });
    expect(next.enabled).toBe(false);
    expect(next.id).toBe(original.id);
    expect(original.enabled).toBe(true); // immutability
  });

  it('removes note when set to blank', () => {
    const r = sample({ note: 'hi' });
    expect(updateRule(r, { note: '   ' }).note).toBeUndefined();
  });

  it('does not touch id or createdAt', () => {
    const r = sample();
    const updated = updateRule(r, { pattern: 'new.com' });
    expect(updated.id).toBe(r.id);
    expect(updated.createdAt).toBe(r.createdAt);
  });
});

describe('isDuplicate', () => {
  it('matches on pattern + matchType only', () => {
    const a = sample({ id: 'a', pattern: 'x.com', matchType: 'domain' });
    const b = sample({ id: 'b', pattern: 'x.com', matchType: 'domain' });
    const c = sample({ id: 'c', pattern: 'x.com', matchType: 'wildcard' });
    expect(isDuplicate(a, b)).toBe(true);
    expect(isDuplicate(a, c)).toBe(false);
  });
});

describe('serialize / deserialize round-trip', () => {
  it('round-trips a typical rule set', () => {
    const rules = [
      createRule({ pattern: 'reddit.com', matchType: 'domain', note: 'focus' }),
      createRule({ pattern: '*.twitter.com/*', matchType: 'wildcard' }),
    ];
    const json = serializeRules(rules);
    const result = deserializeRules(json);
    expect(result.skipped).toBe(0);
    expect(result.rules).toHaveLength(2);
    expect(result.rules[0]!.pattern).toBe('reddit.com');
  });

  it('throws a useful error on garbage', () => {
    expect(() => deserializeRules('not json')).toThrow(/parse/i);
    expect(() => deserializeRules('[]')).toThrow(/rules/);
  });

  it('skips malformed entries and counts them', () => {
    const json = JSON.stringify({
      version: 1,
      rules: [
        { pattern: 'reddit.com', matchType: 'domain' },
        { pattern: 'missing-type' },
        { matchType: 'domain' },
        'not an object',
      ],
    });
    const result = deserializeRules(json);
    expect(result.rules).toHaveLength(1);
    expect(result.skipped).toBe(3);
  });

  it('fills in missing optional fields', () => {
    const json = JSON.stringify({
      version: 1,
      rules: [{ pattern: 'reddit.com', matchType: 'domain' }],
    });
    const r = deserializeRules(json).rules[0]!;
    expect(r.enabled).toBe(true);
    expect(typeof r.id).toBe('string');
    expect(typeof r.createdAt).toBe('number');
  });
});

describe('filterRules', () => {
  const rules = [
    sample({ id: 'a', pattern: 'reddit.com', note: 'focus' }),
    sample({ id: 'b', pattern: 'twitter.com' }),
    sample({ id: 'c', pattern: 'news.ycombinator.com', note: 'morning ritual' }),
  ];

  it('returns all rules for empty query', () => {
    expect(filterRules(rules, '')).toHaveLength(3);
  });

  it('matches pattern substring', () => {
    expect(filterRules(rules, 'twitter')).toHaveLength(1);
  });

  it('matches note substring', () => {
    expect(filterRules(rules, 'focus')).toHaveLength(1);
  });

  it('is case-insensitive', () => {
    expect(filterRules(rules, 'REDDIT')).toHaveLength(1);
  });
});
