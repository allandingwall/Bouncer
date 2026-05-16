import { createRule, isDuplicate, validatePattern } from '../lib/rules.js';
import { loadRules, saveRules } from '../lib/storage.js';
import { suggestPattern } from './suggest.js';
import type { MatchType } from '../lib/types.js';

/**
 * Popup: quick-add the active tab as a block rule.
 *
 * On open, suggests a pattern derived from the current URL based on the
 * selected match type (defaults to Domain). The user can override the
 * pattern, type, or add a note before saving.
 */

const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

let currentUrl: string | null = null;

async function init(): Promise<void> {
  const tab = await getActiveTab();
  currentUrl = tab?.url ?? null;

  $<HTMLParagraphElement>('#current-url').textContent =
    currentUrl ?? 'No URL available for this tab.';

  const select = $<HTMLSelectElement>('#match-type');
  refreshPattern(select.value as MatchType);

  select.addEventListener('change', () => refreshPattern(select.value as MatchType));

  $<HTMLFormElement>('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    void onSubmit();
  });

  $<HTMLAnchorElement>('#open-options').addEventListener('click', (e) => {
    e.preventDefault();
    void (async (): Promise<void> => {
      try {
        await browser.runtime.openOptionsPage();
      } catch {
        // Fall back to opening the options page as a tab if the API rejects.
        await browser.tabs.create({ url: browser.runtime.getURL('options/options.html') });
      }
      window.close();
    })();
  });

  // Disable the form if we have no URL to work from.
  if (!currentUrl) {
    $<HTMLInputElement>('#pattern').disabled = true;
    $<HTMLButtonElement>('button[type="submit"]').disabled = true;
  }
}

async function getActiveTab(): Promise<browser.tabs.Tab | undefined> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  } catch {
    return undefined;
  }
}

function refreshPattern(matchType: MatchType): void {
  if (!currentUrl) return;
  $<HTMLInputElement>('#pattern').value = suggestPattern(currentUrl, matchType);
}

async function onSubmit(): Promise<void> {
  const pattern = $<HTMLInputElement>('#pattern').value;
  const matchType = $<HTMLSelectElement>('#match-type').value as MatchType;
  const note = $<HTMLInputElement>('#note').value;

  const validation = validatePattern(pattern, matchType);
  if (!validation.valid) {
    showError(validation.message ?? 'Invalid pattern.');
    return;
  }

  let rules;
  try {
    rules = await loadRules();
  } catch {
    showError('Could not access storage.');
    return;
  }

  const candidate = createRule({ pattern, matchType, note });
  if (rules.some((r) => isDuplicate(r, candidate))) {
    showError('That rule already exists.');
    return;
  }

  try {
    await saveRules([candidate, ...rules]);
  } catch {
    showError('Failed to save.');
    return;
  }

  showError(null);
  showStatus(`Added ${candidate.pattern}`);
  $<HTMLInputElement>('#pattern').value = '';
  $<HTMLInputElement>('#note').value = '';
  $<HTMLInputElement>('#pattern').focus();
}

function showError(msg: string | null): void {
  const el = $<HTMLParagraphElement>('#error');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
  } else {
    el.hidden = false;
    el.textContent = msg;
  }
}

let statusClearTimer: number | null = null;
function showStatus(msg: string): void {
  const el = $<HTMLParagraphElement>('#status');
  el.hidden = false;
  el.textContent = msg;
  if (statusClearTimer !== null) window.clearTimeout(statusClearTimer);
  statusClearTimer = window.setTimeout(() => {
    el.hidden = true;
    el.textContent = '';
    statusClearTimer = null;
  }, 2500);
}

void init();
