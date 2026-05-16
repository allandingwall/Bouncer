import { describe, expect, it } from 'vitest';
import {
  buildDnrRules,
  exactToRegexFilter,
  wildcardToRegexFilter,
} from '../src/background/rule-engine.js';
import type { BlockRule } from '../src/lib/types.js';

const rule = (overrides: Partial<BlockRule> & Pick<BlockRule, 'pattern' | 'matchType'>): BlockRule => ({
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

  it('produces requestDomains for domain rules', () => {
    const [r] = buildDnrRules([rule({ pattern: 'reddit.com', matchType: 'domain' })], OPTS);
    expect(r!.condition.requestDomains).toEqual(['reddit.com']);
    expect(r!.condition.resourceTypes).toEqual(['main_frame']);
    expect(r!.action.type).toBe('redirect');
  });

  it('normalises domain patterns before emitting them', () => {
    const [r] = buildDnrRules(
      [rule({ pattern: 'https://www.Reddit.com/path', matchType: 'domain' })],
      OPTS,
    );
    expect(r!.condition.requestDomains).toEqual(['reddit.com']);
  });

  it('produces regexFilter for wildcard rules', () => {
    const [r] = buildDnrRules(
      [rule({ pattern: '*.reddit.com/r/*', matchType: 'wildcard' })],
      OPTS,
    );
    expect(r!.condition.regexFilter).toBe('^https?://.*\\.reddit\\.com/r/.*$');
  });

  it('produces regexFilter for exact rules', () => {
    const [r] = buildDnrRules(
      [rule({ pattern: 'https://example.com/foo', matchType: 'exact' })],
      OPTS,
    );
    expect(r!.condition.regexFilter).toBe('^https://example\\.com/foo/?$');
  });

  it('embeds the block page URL and rule id in the redirect substitution', () => {
    const [r] = buildDnrRules(
      [rule({ id: 'r-1', pattern: 'reddit.com', matchType: 'domain' })],
      OPTS,
    );
    expect(r!.action.redirect.regexSubstitution).toContain('moz-extension://abc/blocked/blocked.html');
    expect(r!.action.redirect.regexSubstitution).toContain('url=\\0');
    expect(r!.action.redirect.regexSubstitution).toContain('rule=r-1');
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
