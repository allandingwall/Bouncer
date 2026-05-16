import type { BlockRule } from '../lib/types.js';
import { compileWildcardBody, normaliseDomain } from '../lib/matcher.js';

/**
 * Translate BlockRule[] into declarativeNetRequest dynamic rules and apply them.
 *
 * Each enabled BlockRule becomes one DNR rule that matches main-frame
 * navigations and redirects to the in-extension block page. The block page
 * re-runs the JS matcher against stored rules to display the full list of
 * matching rules — DNR only needs to fire the redirect.
 *
 * All match types compile to `regexFilter` so we can use `regexSubstitution`
 * uniformly to carry the original URL into the redirect target. (DNR only
 * allows regexSubstitution when the condition uses regexFilter — pairing it
 * with `requestDomains` causes Firefox to silently reject the rule.)
 */

const BLOCK_PAGE_PATH = 'blocked/blocked.html';
const RESOURCE_TYPES_MAIN_FRAME: browser.declarativeNetRequest.ResourceType[] = ['main_frame'];

interface DNRRule {
  id: number;
  priority: number;
  action: {
    type: 'redirect';
    redirect: { regexSubstitution?: string; url?: string };
  };
  condition: {
    regexFilter: string;
    resourceTypes: browser.declarativeNetRequest.ResourceType[];
  };
}

/** Escape a string for safe use inside a regex literal. */
function regexEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Convert a user wildcard pattern to a DNR `regexFilter`. */
export function wildcardToRegexFilter(pattern: string): string {
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(pattern);
  const body = compileWildcardBody(pattern);
  return hasScheme ? `^${body}$` : `^https?://${body}$`;
}

/** Convert an exact URL pattern to a DNR `regexFilter`. */
export function exactToRegexFilter(pattern: string): string {
  return `^${regexEscape(pattern)}/?$`;
}

/**
 * Convert a domain (possibly with subdomains) to a DNR `regexFilter`.
 * Matches `https?://[anything.]domain[:port][/anything]`.
 */
export function domainToRegexFilter(pattern: string): string {
  const domain = normaliseDomain(pattern);
  if (!domain) return '';
  const escaped = regexEscape(domain);
  return `^https?://(?:[^/]+\\.)?${escaped}(?::\\d+)?(?:/.*)?$`;
}

interface BuildOptions {
  blockPageUrl: string;
}

/** Build the array of DNR dynamic rules from BlockRule[]. */
export function buildDnrRules(rules: readonly BlockRule[], opts: BuildOptions): DNRRule[] {
  const out: DNRRule[] = [];
  let id = 1;

  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern) continue;

    let regexFilter: string;
    switch (rule.matchType) {
      case 'exact':
        regexFilter = exactToRegexFilter(rule.pattern);
        break;
      case 'domain':
        regexFilter = domainToRegexFilter(rule.pattern);
        if (!regexFilter) continue;
        break;
      case 'wildcard':
        regexFilter = wildcardToRegexFilter(rule.pattern);
        break;
    }

    out.push({
      id: id++,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          regexSubstitution: `${opts.blockPageUrl}?url=\\0`,
        },
      },
      condition: {
        regexFilter,
        resourceTypes: RESOURCE_TYPES_MAIN_FRAME,
      },
    });
  }

  return out;
}

/**
 * Replace the active dynamic ruleset with the rules derived from `rules`.
 *
 * Fully idempotent: removes every previously-installed dynamic rule and adds
 * the freshly-built set.
 */
export async function applyRules(rules: readonly BlockRule[]): Promise<void> {
  const blockPageUrl = browser.runtime.getURL(BLOCK_PAGE_PATH);
  const next = buildDnrRules(rules, { blockPageUrl });
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: next,
  });
}
