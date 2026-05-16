import { describe, expect, it } from 'vitest';
import { suggestPattern } from '../src/popup/suggest.js';

describe('suggestPattern', () => {
  it('returns the bare host for domain', () => {
    expect(suggestPattern('https://old.reddit.com/r/cats', 'domain')).toBe('old.reddit.com');
  });

  it('strips leading www. for domain', () => {
    expect(suggestPattern('https://www.reddit.com', 'domain')).toBe('reddit.com');
  });

  it('returns the full URL for exact', () => {
    expect(suggestPattern('https://reddit.com/foo?x=1', 'exact')).toBe('https://reddit.com/foo?x=1');
  });

  it('wraps the host in a wildcard pattern', () => {
    expect(suggestPattern('https://reddit.com/r/foo', 'wildcard')).toBe('*.reddit.com/*');
  });

  it('returns "" for unparseable URLs', () => {
    expect(suggestPattern('not a url', 'domain')).toBe('');
  });
});
