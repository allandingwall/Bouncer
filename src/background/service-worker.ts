import { findMatchingRules } from '../lib/matcher.js';
import { loadRules, onRulesChanged } from '../lib/storage.js';
import { applyRules } from './rule-engine.js';
import type { BlockRule } from '../lib/types.js';

/**
 * Background entry point.
 *
 * Responsibilities:
 *  - On startup / install: load rules from storage and apply them via
 *    declarativeNetRequest (covers real network navigations).
 *  - On any storage change: re-apply.
 *  - Listen for client-side route changes via webNavigation and force-redirect
 *    matching URLs. DNR only sees real navigation requests, so SPAs (Reddit,
 *    Twitter, etc.) that route via history.pushState would otherwise slip past.
 *
 * The service worker holds no mutable state of its own. All persistence lives
 * in browser.storage; the DNR ruleset is fully derived from it.
 */

const BLOCK_PAGE_PATH = 'blocked/blocked.html';

let cachedRules: BlockRule[] = [];

async function syncFromStorage(): Promise<void> {
  cachedRules = await loadRules();
  await safelyApply(cachedRules);
}

async function safelyApply(rules: BlockRule[]): Promise<void> {
  try {
    await applyRules(rules);
  } catch (err) {
    console.error('[Bouncer] failed to apply rules', err);
  }
}

browser.runtime.onInstalled.addListener(() => {
  void syncFromStorage();
});

browser.runtime.onStartup.addListener(() => {
  void syncFromStorage();
});

onRulesChanged((rules) => {
  cachedRules = rules;
  void safelyApply(rules);
});

void syncFromStorage();

/**
 * SPA route guard. DNR catches real navigations; this catches pushState /
 * replaceState transitions inside a tab that DNR cannot see.
 */
function buildBlockUrl(originalUrl: string): string {
  return `${browser.runtime.getURL(BLOCK_PAGE_PATH)}?url=${encodeURIComponent(originalUrl)}`;
}

function shouldGuard(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function onClientNav(details: browser.webNavigation._OnHistoryStateUpdatedDetails): void {
  if (details.frameId !== 0) return; // top-level only
  if (!shouldGuard(details.url)) return;
  const matches = findMatchingRules(details.url, cachedRules);
  if (matches.length === 0) return;
  void browser.tabs.update(details.tabId, { url: buildBlockUrl(details.url) });
}

browser.webNavigation.onHistoryStateUpdated.addListener(onClientNav);
