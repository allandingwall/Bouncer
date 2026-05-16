import { findMatchingRules } from '../lib/matcher.js';
import { loadState, onStateChanged } from '../lib/storage.js';
import { applyRules } from './rule-engine.js';
import type { BlockRule } from '../lib/types.js';

/**
 * Background entry point.
 *
 * Responsibilities:
 *  - On startup / install: load state and apply rules via declarativeNetRequest
 *    (covers real network navigations).
 *  - On any storage change: re-apply.
 *  - When the master switch is off, clear DNR rules and ignore SPA navigations.
 *  - Listen for client-side route changes via webNavigation and force-redirect
 *    matching URLs. DNR only sees real navigation requests, so SPAs (Reddit,
 *    Twitter, etc.) that route via history.pushState would otherwise slip past.
 */

const BLOCK_PAGE_PATH = 'blocked/blocked.html';

let cachedRules: BlockRule[] = [];
let globallyEnabled = true;

async function syncFromStorage(): Promise<void> {
  const { state } = await loadState();
  cachedRules = state.rules;
  globallyEnabled = state.globalEnabled !== false;
  await safelyApply();
}

async function safelyApply(): Promise<void> {
  try {
    await applyRules(globallyEnabled ? cachedRules : []);
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

onStateChanged((state) => {
  cachedRules = state.rules;
  globallyEnabled = state.globalEnabled !== false;
  void safelyApply();
});

void syncFromStorage();

/**
 * SPA route guard. DNR catches real navigations; this catches pushState /
 * replaceState transitions inside a tab that DNR cannot see.
 */
function buildBlockUrl(originalUrl: string): string {
  // Same fragment-based encoding as the DNR substitution — fragments are
  // opaque so `&`, `?`, `#` inside the original URL round-trip intact.
  return `${browser.runtime.getURL(BLOCK_PAGE_PATH)}#${originalUrl}`;
}

function shouldGuard(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function onClientNav(details: browser.webNavigation._OnHistoryStateUpdatedDetails): void {
  if (!globallyEnabled) return;
  if (details.frameId !== 0) return;
  if (!shouldGuard(details.url)) return;
  const matches = findMatchingRules(details.url, cachedRules);
  if (matches.length === 0) return;
  void browser.tabs.update(details.tabId, { url: buildBlockUrl(details.url) });
}

browser.webNavigation.onHistoryStateUpdated.addListener(onClientNav);
