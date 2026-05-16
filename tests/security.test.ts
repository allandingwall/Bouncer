import { describe, expect, it } from 'vitest';
import {
  deserializeRules,
  MAX_PATTERN_LENGTH,
  MAX_WILDCARD_STARS,
  parseRule,
  serializeRules,
  validatePattern,
} from '../src/lib/rules.js';
import { findMatchingRules, ruleMatches } from '../src/lib/matcher.js';
import { buildDnrRules } from '../src/background/rule-engine.js';
import { readOriginalUrlFrom } from '../src/blocked/url.js';
import type { BlockRule } from '../src/lib/types.js';

/**
 * Adversarial input tests. These exercise the boundary between
 * untrusted strings (user input, imported JSON, redirected URLs) and
 * the parts of Bouncer that act on them.
 */

const BLOCK = 'moz-extension://abc/blocked/blocked.html';

const rule = (
  overrides: Partial<BlockRule> & Pick<BlockRule, 'pattern' | 'matchType'>,
): BlockRule => ({
  id: 'r',
  enabled: true,
  createdAt: 0,
  ...overrides,
});

// Build the redirect URL the way Firefox would resolve a DNR regexSubstitution
// against a matched URL.
function simulateRedirect(originalUrl: string): string {
  const [r] = buildDnrRules([rule({ pattern: 'a.com', matchType: 'domain' })], {
    blockPageUrl: BLOCK,
  });
  return r!.action.redirect.regexSubstitution!.replace(/\\0/g, originalUrl);
}

function readBack(redirectUrl: string): string | null {
  const u = new URL(redirectUrl);
  return readOriginalUrlFrom({ search: u.search, hash: u.hash });
}

describe('block-page URL recovery survives attacker-controlled URLs', () => {
  // Each input is a URL that survives `new URL()` normalisation, then the
  // assertion is that the redirect substitution + fragment-based recovery
  // does not corrupt it further. (Inputs that contain raw control chars or
  // are otherwise rewritten by the URL parser before DNR sees them are out
  // of scope — by the time `\0` is substituted, they've already been
  // normalised by the browser.)
  const attacks: ReadonlyArray<[label: string, url: string]> = [
    [
      'percent-encoded XSS payload',
      'https://attacker.example/?q=%3Cscript%3Ealert(1)%3C/script%3E',
    ],
    [
      'percent-encoded attribute-break',
      'https://attacker.example/?q=%22%3E%3Cimg%20src=x%20onerror=alert(1)%3E',
    ],
    ['javascript: lookalike in path', 'https://attacker.example/javascript:alert(1)'],
    ['URL with many ampersands', 'https://attacker.example/?a=1&b=2&c=3&d=4'],
    ['URL with percent-encoded zero', 'https://attacker.example/%00admin'],
    ['URL with embedded //', 'https://attacker.example//etc/passwd'],
    ['URL ending with multiple = and ?', 'https://attacker.example/?=?=?'],
  ];

  it.each(attacks)('%s round-trips intact through redirect+recovery', (_label, url) => {
    const redirect = simulateRedirect(url);
    const recovered = readBack(redirect);
    expect(recovered).toBe(url);
  });

  // Regression: this is the exact shape that broke under the previous
  // `?url=\0` substitution — URLs with `&` were truncated at the first one.
  it('a URL with & does not get truncated', () => {
    const url = 'https://attacker.example/?evil=1&rule=injected';
    const recovered = readBack(simulateRedirect(url));
    expect(recovered).toContain('&rule=injected');
  });
});

describe('block-page URL recovery (legacy ?url= compat shim)', () => {
  it('still works with the old query-string format', () => {
    const recovered = readOriginalUrlFrom({ search: '?url=https://x.com/y', hash: '' });
    expect(recovered).toBe('https://x.com/y');
  });

  it('returns null when neither hash nor query has a URL', () => {
    expect(readOriginalUrlFrom({ search: '', hash: '' })).toBeNull();
    expect(readOriginalUrlFrom({ search: '', hash: '#' })).toBeNull();
  });
});

describe('import rejects malformed rule entries', () => {
  it('rejects oversize patterns', () => {
    const huge = 'https://example.com/' + 'a'.repeat(MAX_PATTERN_LENGTH);
    const json = JSON.stringify({
      version: 1,
      rules: [{ pattern: huge, matchType: 'exact', enabled: true, createdAt: 1 }],
    });
    const result = deserializeRules(json);
    expect(result.rules).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it('rejects wildcards with too many stars', () => {
    const tooMany = 'a' + '*'.repeat(MAX_WILDCARD_STARS + 5) + '.com/*';
    const json = JSON.stringify({
      version: 1,
      rules: [{ pattern: tooMany, matchType: 'wildcard', enabled: true, createdAt: 1 }],
    });
    const result = deserializeRules(json);
    expect(result.rules).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it('rejects non-http(s) exact-URL patterns', () => {
    const json = JSON.stringify({
      version: 1,
      rules: [
        { pattern: 'javascript:alert(1)', matchType: 'exact', enabled: true, createdAt: 1 },
        { pattern: 'data:text/html,<x>', matchType: 'exact', enabled: true, createdAt: 1 },
      ],
    });
    const result = deserializeRules(json);
    expect(result.rules).toHaveLength(0);
    expect(result.skipped).toBe(2);
  });

  it('round-trips a well-formed rule unchanged', () => {
    const json = serializeRules([rule({ pattern: 'reddit.com', matchType: 'domain' })]);
    expect(deserializeRules(json).rules).toHaveLength(1);
  });

  it('parseRule on a primitive returns null without throwing', () => {
    expect(parseRule(null)).toBeNull();
    expect(parseRule(42)).toBeNull();
    expect(parseRule('reddit.com')).toBeNull();
    expect(parseRule({})).toBeNull();
  });
});

describe('matcher complexity is bounded', () => {
  // A pattern that would catastrophically backtrack if unbounded — kept under
  // the cap so it still parses. Asserts the matcher returns quickly on a
  // worst-case URL that does not match.
  it('does not backtrack catastrophically on near-miss URLs', () => {
    const pattern = '*a'.repeat(MAX_WILDCARD_STARS / 2) + '/x';
    expect(validatePattern(pattern, 'wildcard').valid).toBe(true);
    const r = rule({ pattern, matchType: 'wildcard' });
    // A URL that ALMOST matches but ends with `/y` instead of `/x`.
    const url = 'https://example.com/' + 'a'.repeat(64) + '/y';

    const start = performance.now();
    const matched = ruleMatches(url, r);
    const elapsed = performance.now() - start;

    expect(matched).toBe(false);
    // Generous bound — on a healthy machine this should be sub-millisecond.
    // The point is to fail loudly if a regression introduces unbounded
    // backtracking, not to assert a tight wall-clock budget.
    expect(elapsed).toBeLessThan(100);
  });
});

describe('findMatchingRules tolerates a tampered rule list', () => {
  it('disabled rules and missing patterns do not match', () => {
    const rules: BlockRule[] = [
      rule({ pattern: 'reddit.com', matchType: 'domain', enabled: false }),
      // An empty pattern would short-circuit ruleMatches without throwing.
      rule({ pattern: '', matchType: 'domain' }),
    ];
    expect(findMatchingRules('https://reddit.com', rules)).toEqual([]);
  });
});
