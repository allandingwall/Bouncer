import { loadRules, onRulesChanged } from '../lib/storage.js';
import { applyRules } from './rule-engine.js';
import type { BlockRule } from '../lib/types.js';

/**
 * Background entry point.
 *
 * Responsibilities:
 *  - On startup / install: load rules from storage, apply them to declarativeNetRequest.
 *  - On any storage change: re-apply.
 *
 * The service worker holds no mutable state of its own. All persistence lives
 * in browser.storage; the DNR ruleset is fully derived from it.
 */

async function syncFromStorage(): Promise<void> {
  const rules = await loadRules();
  await safelyApply(rules);
}

async function safelyApply(rules: BlockRule[]): Promise<void> {
  try {
    await applyRules(rules);
  } catch (err) {
    // Surfacing this via console is intentional — DNR errors during regeneration
    // are operationally interesting and shouldn't be silently swallowed.
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
  void safelyApply(rules);
});

// Apply immediately on script load too (covers cold-start cases in event pages).
void syncFromStorage();
