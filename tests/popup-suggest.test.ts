import { describe, expect, it } from 'vitest';
import { suggestPattern } from '../src/popup/suggest.js';
import { ruleMatches } from '../src/lib/matcher.js';
import type { BlockRule } from '../src/lib/types.js';

describe('suggestPattern', () => {
  it('returns the bare host for domain', () => {
    expect(suggestPattern('https://old.reddit.com/r/cats', 'domain')).toBe('old.reddit.com');
  });

  it('strips leading www. for domain', () => {
    expect(suggestPattern('https://www.reddit.com', 'domain')).toBe('reddit.com');
  });

  it('returns the full URL for exact', () => {
    expect(suggestPattern('https://reddit.com/foo?x=1', 'exact')).toBe(
      'https://reddit.com/foo?x=1',
    );
  });

  it('wraps the host in a wildcard pattern', () => {
    expect(suggestPattern('https://reddit.com/r/foo', 'wildcard')).toBe('reddit.com/*');
  });

  it('returns "" for unparseable URLs', () => {
    expect(suggestPattern('not a url', 'domain')).toBe('');
  });

  // Regression: the suggested wildcard must match the URL it was suggested
  // for. `*.host/*` requires a leading subdomain and so missed the source URL.
  it('suggested wildcard matches the source URL', () => {
    const url = 'https://reddit.com/foo';
    const suggested = suggestPattern(url, 'wildcard');
    const rule: BlockRule = {
      id: 'r',
      pattern: suggested,
      matchType: 'wildcard',
      enabled: true,
      createdAt: 0,
    };
    expect(ruleMatches(url, rule)).toBe(true);
    // ...and still covers subdomains.
    expect(ruleMatches('https://old.reddit.com/foo', rule)).toBe(true);
  });
});
