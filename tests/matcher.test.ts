import { describe, expect, it } from 'vitest';
import {
  findMatchingRules,
  isBlocked,
  isSameOrSubdomain,
  matchTypeLabel,
  normaliseDomain,
  normaliseUrl,
  ruleMatches,
} from '../src/lib/matcher.js';
import type { BlockRule, MatchType } from '../src/lib/types.js';

const rule = (
  overrides: Partial<BlockRule> & Pick<BlockRule, 'pattern' | 'matchType'>,
): BlockRule => ({
  id: 'r-' + Math.random().toString(36).slice(2),
  enabled: true,
  createdAt: 0,
  ...overrides,
});

describe('normaliseUrl', () => {
  it('returns null for unparseable strings', () => {
    expect(normaliseUrl('not a url')).toBeNull();
    expect(normaliseUrl('')).toBeNull();
  });

  it('lowercases the host', () => {
    expect(normaliseUrl('https://EXAMPLE.com/Path')).toBe('https://example.com/Path');
  });

  it('strips trailing slash on root path', () => {
    expect(normaliseUrl('https://example.com/')).toBe('https://example.com');
    expect(normaliseUrl('https://example.com')).toBe('https://example.com');
  });

  it('keeps non-root paths intact', () => {
    expect(normaliseUrl('https://example.com/foo/')).toBe('https://example.com/foo/');
  });

  it('preserves query and fragment', () => {
    expect(normaliseUrl('https://example.com/?q=1#x')).toBe('https://example.com/?q=1#x');
  });
});

describe('normaliseDomain', () => {
  it('strips scheme, www, and path', () => {
    expect(normaliseDomain('https://www.Reddit.com/r/foo')).toBe('reddit.com');
    expect(normaliseDomain('http://news.ycombinator.com')).toBe('news.ycombinator.com');
    expect(normaliseDomain('Reddit.COM')).toBe('reddit.com');
  });

  it('returns trimmed lowercase domain for bare input', () => {
    expect(normaliseDomain('  Example.org  ')).toBe('example.org');
  });
});

describe('isSameOrSubdomain', () => {
  it('matches identical hosts', () => {
    expect(isSameOrSubdomain('reddit.com', 'reddit.com')).toBe(true);
  });

  it('matches subdomains', () => {
    expect(isSameOrSubdomain('old.reddit.com', 'reddit.com')).toBe(true);
    expect(isSameOrSubdomain('a.b.reddit.com', 'reddit.com')).toBe(true);
  });

  it('rejects unrelated hosts', () => {
    expect(isSameOrSubdomain('notreddit.com', 'reddit.com')).toBe(false);
    expect(isSameOrSubdomain('reddit.com.evil.com', 'reddit.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSameOrSubdomain('Old.Reddit.COM', 'reddit.com')).toBe(true);
  });
});

describe('ruleMatches — exact', () => {
  const url = 'https://example.com/foo';

  it('matches identical URL', () => {
    expect(ruleMatches(url, rule({ pattern: 'https://example.com/foo', matchType: 'exact' }))).toBe(
      true,
    );
  });

  it('does not match different paths', () => {
    expect(ruleMatches(url, rule({ pattern: 'https://example.com/bar', matchType: 'exact' }))).toBe(
      false,
    );
  });

  it('treats trailing slash on root as equivalent', () => {
    const root = 'https://example.com/';
    expect(ruleMatches(root, rule({ pattern: 'https://example.com', matchType: 'exact' }))).toBe(
      true,
    );
  });

  it('is case-sensitive on path', () => {
    expect(
      ruleMatches(
        'https://example.com/Foo',
        rule({ pattern: 'https://example.com/foo', matchType: 'exact' }),
      ),
    ).toBe(false);
  });

  it('returns false for unparseable input URL', () => {
    expect(
      ruleMatches('garbage', rule({ pattern: 'https://example.com', matchType: 'exact' })),
    ).toBe(false);
  });
});

describe('ruleMatches — domain', () => {
  it('matches the domain itself', () => {
    expect(
      ruleMatches('https://reddit.com/r/foo', rule({ pattern: 'reddit.com', matchType: 'domain' })),
    ).toBe(true);
  });

  it('matches subdomains', () => {
    expect(
      ruleMatches(
        'https://old.reddit.com/r/foo',
        rule({ pattern: 'reddit.com', matchType: 'domain' }),
      ),
    ).toBe(true);
  });

  it('does not match unrelated hosts', () => {
    expect(
      ruleMatches('https://example.com', rule({ pattern: 'reddit.com', matchType: 'domain' })),
    ).toBe(false);
  });

  it('treats www. as the apex domain', () => {
    expect(
      ruleMatches('https://www.reddit.com', rule({ pattern: 'reddit.com', matchType: 'domain' })),
    ).toBe(true);
  });

  it('accepts patterns with scheme and path (strips them)', () => {
    expect(
      ruleMatches(
        'https://reddit.com/x',
        rule({ pattern: 'https://reddit.com/anything', matchType: 'domain' }),
      ),
    ).toBe(true);
  });

  it('is scheme-agnostic', () => {
    expect(
      ruleMatches('http://reddit.com', rule({ pattern: 'reddit.com', matchType: 'domain' })),
    ).toBe(true);
  });

  it('rejects host suffixes that are not subdomains (suffix attack)', () => {
    expect(
      ruleMatches('https://evilreddit.com', rule({ pattern: 'reddit.com', matchType: 'domain' })),
    ).toBe(false);
    expect(
      ruleMatches(
        'https://reddit.com.evil.com',
        rule({ pattern: 'reddit.com', matchType: 'domain' }),
      ),
    ).toBe(false);
  });
});

describe('ruleMatches — wildcard', () => {
  it('matches scheme-less pattern with star', () => {
    const r = rule({ pattern: '*.reddit.com/r/*', matchType: 'wildcard' });
    expect(ruleMatches('https://old.reddit.com/r/cats', r)).toBe(true);
    expect(ruleMatches('https://www.reddit.com/r/foo/bar', r)).toBe(true);
  });

  it('does not match outside path scope', () => {
    const r = rule({ pattern: '*.reddit.com/r/*', matchType: 'wildcard' });
    expect(ruleMatches('https://old.reddit.com/u/cats', r)).toBe(false);
  });

  it('matches pattern with scheme', () => {
    const r = rule({ pattern: 'https://*.example.com/*', matchType: 'wildcard' });
    expect(ruleMatches('https://api.example.com/v1/x', r)).toBe(true);
    expect(ruleMatches('http://api.example.com/v1/x', r)).toBe(false);
  });

  it('star can match empty', () => {
    const r = rule({ pattern: 'reddit.com/*', matchType: 'wildcard' });
    expect(ruleMatches('https://reddit.com/', r)).toBe(true);
  });

  it('is case-insensitive', () => {
    const r = rule({ pattern: '*.reddit.com/*', matchType: 'wildcard' });
    expect(ruleMatches('https://OLD.REDDIT.COM/r/X', r)).toBe(true);
  });

  it('auto-allows subdomain prefix when the host is a literal domain', () => {
    const r = rule({ pattern: 'reddit.com/r/*', matchType: 'wildcard' });
    expect(ruleMatches('https://reddit.com/r/cats', r)).toBe(true);
    expect(ruleMatches('https://www.reddit.com/r/melbourne/', r)).toBe(true);
    expect(ruleMatches('https://old.reddit.com/r/foo/bar', r)).toBe(true);
  });

  it('still rejects unrelated paths under the auto-subdomain rule', () => {
    const r = rule({ pattern: 'reddit.com/r/*', matchType: 'wildcard' });
    expect(ruleMatches('https://reddit.com/u/cats', r)).toBe(false);
    expect(ruleMatches('https://www.reddit.com/u/cats', r)).toBe(false);
  });

  it('does not auto-prefix when the user wrote * in the host', () => {
    const r = rule({ pattern: '*.reddit.com/*', matchType: 'wildcard' });
    // bare reddit.com (no leading subdomain) does NOT match a `*.` prefix
    expect(ruleMatches('https://reddit.com/r/cats', r)).toBe(false);
  });
});

describe('ruleMatches — disabled rules', () => {
  it('never matches when disabled', () => {
    const r = rule({ pattern: 'reddit.com', matchType: 'domain', enabled: false });
    expect(ruleMatches('https://reddit.com', r)).toBe(false);
  });
});

describe('findMatchingRules', () => {
  const rules: BlockRule[] = [
    rule({ pattern: 'reddit.com', matchType: 'domain' }),
    rule({ pattern: '*.reddit.com/r/*', matchType: 'wildcard' }),
    rule({ pattern: 'https://example.com/exact', matchType: 'exact' }),
    rule({ pattern: 'twitter.com', matchType: 'domain', enabled: false }),
  ];

  it('returns all matching enabled rules', () => {
    const matches = findMatchingRules('https://old.reddit.com/r/cats', rules);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.matchType)).toEqual(['domain', 'wildcard']);
  });

  it('skips disabled rules', () => {
    expect(findMatchingRules('https://twitter.com', rules)).toHaveLength(0);
  });

  it('returns empty when nothing matches', () => {
    expect(findMatchingRules('https://nytimes.com', rules)).toHaveLength(0);
  });
});

describe('isBlocked', () => {
  it('returns true on any match', () => {
    expect(
      isBlocked('https://reddit.com', [rule({ pattern: 'reddit.com', matchType: 'domain' })]),
    ).toBe(true);
  });

  it('returns false when no rules match', () => {
    expect(
      isBlocked('https://nytimes.com', [rule({ pattern: 'reddit.com', matchType: 'domain' })]),
    ).toBe(false);
  });
});

describe('matchTypeLabel', () => {
  it.each<[MatchType, string]>([
    ['exact', 'exact URL'],
    ['domain', 'domain'],
    ['wildcard', 'wildcard'],
  ])('%s → %s', (type, label) => {
    expect(matchTypeLabel(type)).toBe(label);
  });
});
