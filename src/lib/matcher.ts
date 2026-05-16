import type { BlockRule, MatchType } from './types.js';

/**
 * Pure URL-vs-rule matching. No I/O, no browser APIs.
 *
 * Semantics:
 *  - `exact`    — URL string equality after light normalisation (trailing slash, lowercase host).
 *  - `domain`   — hostname equals pattern, or is a subdomain of it. Scheme-agnostic.
 *  - `wildcard` — glob where `*` matches any sequence of characters (including `/` and `.`).
 *                 Anchored at both ends. Scheme-optional (if pattern omits scheme, any is allowed).
 */

/** Normalise a URL string for comparison. Returns null if it cannot be parsed. */
export function normaliseUrl(input: string): string | null {
  try {
    const u = new URL(input);
    // URL constructor lowercases host and resolves default ports for us.
    // Drop trailing slash on root paths so "https://x.com/" === "https://x.com".
    if (u.pathname === '/' && !u.search && !u.hash) {
      return `${u.protocol}//${u.host}`;
    }
    return u.toString();
  } catch {
    return null;
  }
}

/** Strip scheme, leading "www.", and any path from a domain-like pattern. */
export function normaliseDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.replace(/^www\./, '');
  const slash = s.indexOf('/');
  if (slash !== -1) s = s.slice(0, slash);
  return s;
}

/** True if `host` equals `domain` or is a subdomain of it. */
export function isSameOrSubdomain(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  if (h === d) return true;
  return h.endsWith('.' + d);
}

/** Convert a wildcard pattern (`*` = any chars) into an anchored RegExp. */
export function wildcardToRegExp(pattern: string): RegExp {
  return new RegExp(`^${compileWildcardBody(pattern)}$`, 'i');
}

/**
 * Compile a wildcard pattern to a regex body (no anchors).
 *
 * Semantics: `*` matches any sequence of characters. When the host portion of
 * a scheme-less pattern is a literal domain (no `*`, has at least one `.`),
 * an optional subdomain prefix is allowed implicitly — so `reddit.com/r/*`
 * also matches `www.reddit.com/r/...` the way users intuitively expect.
 * Patterns that start with `*` are taken as the author already being explicit.
 */
export function compileWildcardBody(pattern: string): string {
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(pattern);

  let prefix = '';
  let rest = pattern;
  if (hasScheme) {
    const cut = pattern.indexOf('://') + 3;
    prefix = pattern.slice(0, cut);
    rest = pattern.slice(cut);
  }

  const slashIdx = rest.indexOf('/');
  const host = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const path = slashIdx === -1 ? '' : rest.slice(slashIdx);

  const hostIsLiteralDomain = !host.includes('*') && host.includes('.');
  const hostSegment = hostIsLiteralDomain
    ? `(?:[^/]+\\.)?${compileSegment(host)}`
    : compileSegment(host);

  return `${compileSegment(prefix)}${hostSegment}${compileSegment(path)}`;
}

function compileSegment(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
}

/** True if a given URL is matched by a single rule's pattern + matchType. */
export function ruleMatches(url: string, rule: BlockRule): boolean {
  if (!rule.enabled) return false;
  if (!rule.pattern) return false;

  const normalised = normaliseUrl(url);
  if (!normalised) return false;

  switch (rule.matchType) {
    case 'exact':
      return matchExact(normalised, rule.pattern);
    case 'domain':
      return matchDomain(normalised, rule.pattern);
    case 'wildcard':
      return matchWildcard(url, normalised, rule.pattern);
    default: {
      const exhaustive: never = rule.matchType;
      void exhaustive;
      return false;
    }
  }
}

function matchExact(normalisedUrl: string, pattern: string): boolean {
  const normalisedPattern = normaliseUrl(pattern);
  if (normalisedPattern) return normalisedPattern === normalisedUrl;
  // Fallback: literal compare (lets users paste exact strings even if unparseable).
  return pattern === normalisedUrl;
}

function matchDomain(normalisedUrl: string, pattern: string): boolean {
  const domain = normaliseDomain(pattern);
  if (!domain) return false;
  let host: string;
  try {
    host = new URL(normalisedUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return isSameOrSubdomain(host, domain);
}

function matchWildcard(rawUrl: string, _normalisedUrl: string, pattern: string): boolean {
  // Build a canonical form that always preserves the path (at least "/"),
  // so patterns like "reddit.com/*" match "https://reddit.com/".
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  const path = parsed.pathname || '/';
  const withScheme = `${parsed.protocol}//${parsed.host}${path}${parsed.search}${parsed.hash}`;
  const withoutScheme = `${parsed.host}${path}${parsed.search}${parsed.hash}`;

  const patternHasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(pattern);
  const re = wildcardToRegExp(pattern);
  return patternHasScheme ? re.test(withScheme) : re.test(withoutScheme);
}

/** Return every enabled rule that matches the given URL. */
export function findMatchingRules(url: string, rules: readonly BlockRule[]): BlockRule[] {
  return rules.filter((r) => ruleMatches(url, r));
}

/** Quick boolean shortcut. */
export function isBlocked(url: string, rules: readonly BlockRule[]): boolean {
  return rules.some((r) => ruleMatches(url, r));
}

/** Human label for a match type — used in the block page metadata grid. */
export function matchTypeLabel(matchType: MatchType): string {
  switch (matchType) {
    case 'exact':
      return 'exact URL';
    case 'domain':
      return 'domain';
    case 'wildcard':
      return 'wildcard';
  }
}
