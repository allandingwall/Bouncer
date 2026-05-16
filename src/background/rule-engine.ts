import type { BlockRule } from '../lib/types.js';
import { normaliseDomain } from '../lib/matcher.js';

/**
 * Translate BlockRule[] into declarativeNetRequest dynamic rules and apply them.
 *
 * Each enabled BlockRule becomes one DNR rule that matches main-frame
 * navigations and redirects to the in-extension block page. The block page
 * re-runs the JS matcher against stored rules to display the full list of
 * matching rules — DNR only needs to fire the redirect.
 *
 * Strategy per match type:
 *   - exact     → regexFilter anchored to the literal URL
 *   - domain    → requestDomains (native subdomain matching, fastest path)
 *   - wildcard  → regexFilter generated from the wildcard pattern
 *
 * Redirect target uses regexSubstitution so the original URL is preserved
 * as a query parameter for the block page to read.
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
    regexFilter?: string;
    requestDomains?: string[];
    resourceTypes: browser.declarativeNetRequest.ResourceType[];
  };
}

/** Escape a string for safe use inside a regex literal. */
function regexEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Convert a user wildcard pattern to a DNR `regexFilter`. */
export function wildcardToRegexFilter(pattern: string): string {
  // Same semantics as the runtime matcher: `*` → `.*`, all else literal.
  // Allow either http(s) prefix when the pattern has no scheme.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(pattern);
  const body = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return hasScheme ? `^${body}$` : `^https?://${body}$`;
}

/** Convert an exact URL pattern to a DNR `regexFilter`. */
export function exactToRegexFilter(pattern: string): string {
  return `^${regexEscape(pattern)}/?$`;
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

    const action: DNRRule['action'] = {
      type: 'redirect',
      redirect: { regexSubstitution: `${opts.blockPageUrl}?url=\\0&rule=${encodeURIComponent(rule.id)}` },
    };

    switch (rule.matchType) {
      case 'exact':
        out.push({
          id: id++,
          priority: 1,
          action,
          condition: {
            regexFilter: exactToRegexFilter(rule.pattern),
            resourceTypes: RESOURCE_TYPES_MAIN_FRAME,
          },
        });
        break;
      case 'domain': {
        const domain = normaliseDomain(rule.pattern);
        if (!domain) continue;
        out.push({
          id: id++,
          priority: 1,
          action,
          condition: {
            requestDomains: [domain],
            resourceTypes: RESOURCE_TYPES_MAIN_FRAME,
          },
        });
        break;
      }
      case 'wildcard':
        out.push({
          id: id++,
          priority: 1,
          action,
          condition: {
            regexFilter: wildcardToRegexFilter(rule.pattern),
            resourceTypes: RESOURCE_TYPES_MAIN_FRAME,
          },
        });
        break;
    }
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
