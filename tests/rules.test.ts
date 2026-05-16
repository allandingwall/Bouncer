import { describe, expect, it } from 'vitest';
import {
  createRule,
  deserializeRules,
  filterRules,
  groupsOf,
  isDuplicate,
  MAX_GROUP_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PATTERN_LENGTH,
  MAX_WILDCARD_STARS,
  serializeRules,
  updateRule,
  validateGroup,
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

    it('rejects too many wildcards (ReDoS guard)', () => {
      const tooMany = 'a' + '*'.repeat(MAX_WILDCARD_STARS + 1) + '.com/*';
      expect(validatePattern(tooMany, 'wildcard').valid).toBe(false);
    });
  });

  describe('length bounds', () => {
    it('rejects patterns longer than the cap', () => {
      const tooLong = 'https://example.com/' + 'a'.repeat(MAX_PATTERN_LENGTH);
      expect(validatePattern(tooLong, 'exact').valid).toBe(false);
    });
  });
});

describe('note length', () => {
  it('clips notes longer than the cap on create', () => {
    const note = 'x'.repeat(MAX_NOTE_LENGTH + 50);
    const r = createRule({ pattern: 'reddit.com', matchType: 'domain', note });
    expect(r.note?.length).toBe(MAX_NOTE_LENGTH);
  });
});

describe('validateGroup', () => {
  it('accepts a typical group name', () => {
    expect(validateGroup('Social Media').valid).toBe(true);
  });

  it('rejects empty / whitespace', () => {
    expect(validateGroup('').valid).toBe(false);
    expect(validateGroup('   ').valid).toBe(false);
  });

  it('rejects names longer than the cap', () => {
    expect(validateGroup('a'.repeat(MAX_GROUP_NAME_LENGTH + 1)).valid).toBe(false);
  });

  it('rejects ASCII control characters', () => {
    // Tab and bell — characters that would mess with DOM rendering.
    expect(validateGroup('foo\tbar').valid).toBe(false);
    expect(validateGroup('foo\x07bar').valid).toBe(false);
  });
});

describe('group on createRule / updateRule', () => {
  it('stores a trimmed, valid group', () => {
    const r = createRule({ pattern: 'reddit.com', matchType: 'domain', group: '  News  ' });
    expect(r.group).toBe('News');
  });

  it('silently drops an invalid group on create', () => {
    const r = createRule({
      pattern: 'reddit.com',
      matchType: 'domain',
      group: 'a'.repeat(MAX_GROUP_NAME_LENGTH + 1),
    });
    expect(r.group).toBeUndefined();
  });

  it('omits group when blank', () => {
    const r = createRule({ pattern: 'reddit.com', matchType: 'domain', group: '   ' });
    expect(r.group).toBeUndefined();
  });

  it('sets a group via updateRule', () => {
    const original = createRule({ pattern: 'reddit.com', matchType: 'domain' });
    const next = updateRule(original, { group: 'News' });
    expect(next.group).toBe('News');
  });

  it('clears a group when patch is an empty string', () => {
    const original = createRule({ pattern: 'reddit.com', matchType: 'domain', group: 'News' });
    expect(updateRule(original, { group: '' }).group).toBeUndefined();
  });
});

describe('groupsOf', () => {
  it('returns named groups alphabetically, with ungrouped first if present', () => {
    const rules = [
      createRule({ pattern: 'a.com', matchType: 'domain', group: 'News' }),
      createRule({ pattern: 'b.com', matchType: 'domain' }), // ungrouped
      createRule({ pattern: 'c.com', matchType: 'domain', group: 'Apps' }),
      createRule({ pattern: 'd.com', matchType: 'domain', group: 'News' }),
    ];
    expect(groupsOf(rules)).toEqual([null, 'Apps', 'News']);
  });

  it('returns only named groups when every rule has a group', () => {
    const rules = [
      createRule({ pattern: 'a.com', matchType: 'domain', group: 'News' }),
      createRule({ pattern: 'b.com', matchType: 'domain', group: 'Apps' }),
    ];
    expect(groupsOf(rules)).toEqual(['Apps', 'News']);
  });

  it('returns [] for empty input', () => {
    expect(groupsOf([])).toEqual([]);
  });
});

describe('deserializeRules — top-level group default', () => {
  it('applies the top-level group to rules that lack one', () => {
    const json = JSON.stringify({
      version: 1,
      group: 'Social Media',
      rules: [
        { pattern: 'instagram.com', matchType: 'domain' },
        { pattern: 'reddit.com', matchType: 'domain' },
      ],
    });
    const { rules } = deserializeRules(json);
    expect(rules.map((r) => r.group)).toEqual(['Social Media', 'Social Media']);
  });

  it('per-rule group overrides the top-level default', () => {
    const json = JSON.stringify({
      version: 1,
      group: 'Social Media',
      rules: [
        { pattern: 'instagram.com', matchType: 'domain', group: 'Pinned' },
        { pattern: 'reddit.com', matchType: 'domain' },
      ],
    });
    const { rules } = deserializeRules(json);
    expect(rules[0]!.group).toBe('Pinned');
    expect(rules[1]!.group).toBe('Social Media');
  });

  it('ignores an invalid top-level group (rules end up ungrouped)', () => {
    const json = JSON.stringify({
      version: 1,
      group: '   ',
      rules: [{ pattern: 'reddit.com', matchType: 'domain' }],
    });
    const { rules } = deserializeRules(json);
    expect(rules[0]!.group).toBeUndefined();
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
