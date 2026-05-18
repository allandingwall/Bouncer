import { isBlocked } from '../lib/matcher.js';
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
const ICON_ACTIVE = 'icons/bouncer.svg';
const ICON_PAUSED = 'icons/bouncer-paused.svg';

let cachedRules: BlockRule[] = [];
let globallyEnabled = true;

// Resolves once the SW has loaded state from storage at least once.
// Event handlers await this so a navigation that arrives on a cold-
// started service worker (before the first sync finishes) can't slip
// past with an empty rule cache.
let ready: Promise<void> = syncFromStorage();

async function syncFromStorage(): Promise<void> {
  const { state } = await loadState();
  cachedRules = state.rules;
  globallyEnabled = state.globalEnabled !== false;
  await safelyApply();
  updateToolbarIcon();
}

async function safelyApply(): Promise<void> {
  try {
    await applyRules(globallyEnabled ? cachedRules : []);
  } catch (err) {
    console.error('[Bouncer] failed to apply rules', err);
  }
}

/**
 * Swap the toolbar icon between the clay (active) and muted-grey (paused)
 * saltires so the master-switch state is visible without opening the popup.
 * The popup border + wordmark already carry the same signal — this just
 * lifts it up into the browser chrome.
 */
function updateToolbarIcon(): void {
  const path = globallyEnabled ? ICON_ACTIVE : ICON_PAUSED;
  browser.action.setIcon({ path }).catch((err: unknown) => {
    console.error('[Bouncer] failed to update toolbar icon', err);
  });
}

browser.runtime.onInstalled.addListener(() => {
  ready = syncFromStorage();
});

browser.runtime.onStartup.addListener(() => {
  ready = syncFromStorage();
});

onStateChanged((state) => {
  cachedRules = state.rules;
  globallyEnabled = state.globalEnabled !== false;
  void safelyApply();
  updateToolbarIcon();
});

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

async function onClientNav(
  details: browser.webNavigation._OnHistoryStateUpdatedDetails,
): Promise<void> {
  if (details.frameId !== 0) return;
  if (!shouldGuard(details.url)) return;
  await ready;
  if (!globallyEnabled) return;
  // Short-circuit on the first match — the block page re-runs the full
  // matcher to enumerate every applicable rule, so we don't need the
  // list here.
  if (!isBlocked(details.url, cachedRules)) return;
  try {
    await browser.tabs.update(details.tabId, { url: buildBlockUrl(details.url) });
  } catch (err: unknown) {
    console.error('[Bouncer] SPA redirect failed', err);
  }
}

browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
  void onClientNav(details);
});
