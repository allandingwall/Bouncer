import { describe, expect, it } from 'vitest';
import {
  buildDnrRules,
  domainToRegexFilter,
  exactToRegexFilter,
  wildcardToRegexFilter,
} from '../src/background/rule-engine.js';
import type { BlockRule } from '../src/lib/types.js';

const rule = (
  overrides: Partial<BlockRule> & Pick<BlockRule, 'pattern' | 'matchType'>,
): BlockRule => ({
  id: 'r-' + overrides.pattern,
  enabled: true,
  createdAt: 0,
  ...overrides,
});

const OPTS = { blockPageUrl: 'moz-extension://abc/blocked/blocked.html' };

describe('exactToRegexFilter', () => {
  it('anchors and escapes the URL', () => {
    expect(exactToRegexFilter('https://example.com/foo?x=1')).toBe(
      '^https://example\\.com/foo\\?x=1/?$',
    );
  });

  it('matches via the produced regex', () => {
    const re = new RegExp(exactToRegexFilter('https://example.com/foo'));
    expect(re.test('https://example.com/foo')).toBe(true);
    expect(re.test('https://example.com/foo/')).toBe(true);
    expect(re.test('https://example.com/foobar')).toBe(false);
  });
});

describe('wildcardToRegexFilter', () => {
  it('allows http or https when pattern has no scheme', () => {
    const re = new RegExp(wildcardToRegexFilter('*.reddit.com/r/*'));
    expect(re.test('https://old.reddit.com/r/cats')).toBe(true);
    expect(re.test('http://old.reddit.com/r/cats')).toBe(true);
    expect(re.test('ftp://old.reddit.com/r/cats')).toBe(false);
  });

  it('respects an explicit scheme', () => {
    const re = new RegExp(wildcardToRegexFilter('https://*.example.com/*'));
    expect(re.test('https://api.example.com/v1')).toBe(true);
    expect(re.test('http://api.example.com/v1')).toBe(false);
  });
});

describe('domainToRegexFilter', () => {
  it('matches the bare domain', () => {
    const re = new RegExp(domainToRegexFilter('reddit.com'));
    expect(re.test('https://reddit.com')).toBe(true);
    expect(re.test('https://reddit.com/r/cats')).toBe(true);
  });

  it('matches subdomains', () => {
    const re = new RegExp(domainToRegexFilter('reddit.com'));
    expect(re.test('https://old.reddit.com/r/foo')).toBe(true);
    expect(re.test('https://a.b.reddit.com')).toBe(true);
  });

  it('matches both http and https', () => {
    const re = new RegExp(domainToRegexFilter('reddit.com'));
    expect(re.test('http://reddit.com')).toBe(true);
    expect(re.test('ftp://reddit.com')).toBe(false);
  });

  it('rejects suffix-attack hosts', () => {
    const re = new RegExp(domainToRegexFilter('reddit.com'));
    expect(re.test('https://evilreddit.com')).toBe(false);
    expect(re.test('https://reddit.com.evil.com')).toBe(false);
  });

  it('tolerates a port', () => {
    const re = new RegExp(domainToRegexFilter('reddit.com'));
    expect(re.test('https://reddit.com:8443/x')).toBe(true);
  });

  it('normalises scheme/path/www out of the pattern', () => {
    expect(domainToRegexFilter('https://www.Reddit.com/path')).toBe(
      '^https?://(?:[^/]+\\.)?reddit\\.com(?::\\d+)?(?:/.*)?$',
    );
  });
});

describe('buildDnrRules', () => {
  it('skips disabled rules and empty patterns', () => {
    const result = buildDnrRules(
      [
        rule({ pattern: 'reddit.com', matchType: 'domain', enabled: false }),
        rule({ pattern: '', matchType: 'domain' }),
      ],
      OPTS,
    );
    expect(result).toEqual([]);
  });

  it('produces regexFilter for domain rules (not requestDomains)', () => {
    const [r] = buildDnrRules([rule({ pattern: 'reddit.com', matchType: 'domain' })], OPTS);
    expect(r!.condition.regexFilter).toBe('^https?://(?:[^/]+\\.)?reddit\\.com(?::\\d+)?(?:/.*)?$');
    expect(r!.condition.resourceTypes).toEqual(['main_frame']);
    expect(r!.action.type).toBe('redirect');
  });

  it('produces regexFilter for wildcard rules', () => {
    const [r] = buildDnrRules([rule({ pattern: '*.reddit.com/r/*', matchType: 'wildcard' })], OPTS);
    expect(r!.condition.regexFilter).toBe('^https?://.*\\.reddit\\.com/r/.*$');
  });

  it('auto-allows subdomain prefix for wildcard rules with a literal host', () => {
    const [r] = buildDnrRules([rule({ pattern: 'reddit.com/r/*', matchType: 'wildcard' })], OPTS);
    expect(r!.condition.regexFilter).toBe('^https?://(?:[^/]+\\.)?reddit\\.com/r/.*$');
    const re = new RegExp(r!.condition.regexFilter);
    expect(re.test('https://www.reddit.com/r/melbourne/')).toBe(true);
    expect(re.test('https://reddit.com/r/cats')).toBe(true);
    expect(re.test('https://reddit.com/u/cats')).toBe(false);
  });

  it('produces regexFilter for exact rules', () => {
    const [r] = buildDnrRules(
      [rule({ pattern: 'https://example.com/foo', matchType: 'exact' })],
      OPTS,
    );
    expect(r!.condition.regexFilter).toBe('^https://example\\.com/foo/?$');
  });

  it('always emits regexSubstitution (never paired with requestDomains)', () => {
    const result = buildDnrRules(
      [
        rule({ pattern: 'reddit.com', matchType: 'domain' }),
        rule({ pattern: '*.twitter.com/*', matchType: 'wildcard' }),
        rule({ pattern: 'https://x.com/y', matchType: 'exact' }),
      ],
      OPTS,
    );
    for (const r of result) {
      expect(r.condition.regexFilter).toBeTruthy();
      expect(r.action.redirect.regexSubstitution).toBeTruthy();
    }
  });

  it('embeds the block page URL and the matched URL in the redirect substitution', () => {
    const [r] = buildDnrRules(
      [rule({ id: 'r-1', pattern: 'reddit.com', matchType: 'domain' })],
      OPTS,
    );
    expect(r!.action.redirect.regexSubstitution).toBe(
      'moz-extension://abc/blocked/blocked.html#\\0',
    );
  });

  // Regression: a URL containing `&` used to be truncated by the block page
  // when the substitution put it in the query string. With the URL in the
  // fragment, the whole string round-trips through URL parsing.
  it('the matched URL survives a fragment round-trip even with & in it', () => {
    const [r] = buildDnrRules([rule({ pattern: 'reddit.com', matchType: 'domain' })], OPTS);
    const sub = r!.action.redirect.regexSubstitution!;
    const matched = 'https://reddit.com/r/foo?a=1&b=2&c=3';
    const final = sub.replace(/\\0/g, matched);
    const recovered = new URL(final).hash.slice(1);
    expect(recovered).toBe(matched);
  });

  it('assigns unique sequential IDs', () => {
    const result = buildDnrRules(
      [
        rule({ pattern: 'a.com', matchType: 'domain' }),
        rule({ pattern: 'b.com', matchType: 'domain' }),
        rule({ pattern: 'c.com', matchType: 'domain' }),
      ],
      OPTS,
    );
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('only matches main_frame requests', () => {
    const result = buildDnrRules(
      [rule({ pattern: '*.reddit.com/*', matchType: 'wildcard' })],
      OPTS,
    );
    for (const r of result) {
      expect(r.condition.resourceTypes).toEqual(['main_frame']);
    }
  });
});
