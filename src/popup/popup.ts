import { createRule, groupsOf, isDuplicate, validatePattern } from '../lib/rules.js';
import { isExtensionOrInternalUrl } from '../lib/matcher.js';
import { loadGlobalEnabled, loadRules, saveGlobalEnabled, saveRules } from '../lib/storage.js';
import {
  insertNewGroupOption,
  NEW_GROUP_SENTINEL,
  populateGroupSelect,
  promptForGroupName,
} from '../lib/group-select.js';
import { suggestPattern } from './suggest.js';
import type { BlockRule, MatchType } from '../lib/types.js';

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
let cachedRules: BlockRule[] = [];

async function init(): Promise<void> {
  const tab = await getActiveTab();
  const rawUrl = tab?.url ?? null;
  // Treat extension / browser-internal tabs as unblockable. The matcher
  // already refuses to match them, but suppressing the suggestion here
  // keeps the user from typing a pattern that would silently never apply.
  const isInternal = rawUrl !== null && isExtensionOrInternalUrl(rawUrl);
  const canBlock = rawUrl !== null && !isInternal;
  currentUrl = canBlock ? rawUrl : null;

  const urlEl = $<HTMLParagraphElement>('#current-url');
  if (canBlock) {
    urlEl.textContent = rawUrl;
    urlEl.classList.remove('current-url-unavailable');
  } else {
    urlEl.textContent = "Blocking isn't available on this page.";
    urlEl.classList.add('current-url-unavailable');
  }

  // When blocking isn't available, drop the entire form from the layout
  // and surface only the "Manage all rules" link. Hiding (not just
  // disabling) keeps the popup uncluttered — there's nothing meaningful
  // the user could do with the inputs.
  const form = $<HTMLFormElement>('#add-form');
  form.hidden = !canBlock;

  // Wire the always-present pieces first.
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
  await wireGlobalToggle();

  if (!canBlock) return;

  const select = $<HTMLSelectElement>('#match-type');
  refreshPattern(select.value as MatchType);

  select.addEventListener('change', () => refreshPattern(select.value as MatchType));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void onSubmit();
  });

  // Populate the group dropdown from the user's existing groups. Best-effort:
  // if storage is unavailable the dropdown just offers "(Ungrouped)" and
  // "+ New group…".
  try {
    cachedRules = await loadRules();
  } catch {
    cachedRules = [];
  }
  refreshGroupSelect();
  $<HTMLSelectElement>('#group').addEventListener('change', () => {
    void onGroupSelectChange();
  });
}

async function wireGlobalToggle(): Promise<void> {
  const input = $<HTMLInputElement>('#global-toggle');
  const label = $<HTMLSpanElement>('#global-toggle-label');
  const applyState = (enabled: boolean): void => {
    label.textContent = enabled ? 'active' : 'paused';
    // Drives the accent/grey border around the popup and the wordmark
    // colour — both purely CSS-controlled via `body.is-paused`.
    document.body.classList.toggle('is-paused', !enabled);
  };
  try {
    input.checked = await loadGlobalEnabled();
  } catch {
    input.checked = true;
  }
  applyState(input.checked);
  input.addEventListener('change', () => {
    applyState(input.checked);
    void saveGlobalEnabled(input.checked);
  });
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

/**
 * Rebuild the `<select id="group">` options from current `cachedRules`,
 * preserving whatever was selected before the rebuild (so the value still
 * survives re-renders after a successful add).
 */
function refreshGroupSelect(): void {
  const select = $<HTMLSelectElement>('#group');
  const preserve = select.value;
  const namedGroups = groupsOf(cachedRules).filter((g): g is string => g !== null);
  populateGroupSelect(select, namedGroups, preserve);
}

/**
 * Handle the "+ New group…" sentinel: open the inline dialog, validate, and
 * append + select the resulting group. On cancel, revert to "(no group)".
 */
async function onGroupSelectChange(): Promise<void> {
  const select = $<HTMLSelectElement>('#group');
  if (select.value !== NEW_GROUP_SENTINEL) return;

  const name = await promptForGroupName();
  if (name === null) {
    select.value = '';
    return;
  }
  insertNewGroupOption(select, name);
}

async function onSubmit(): Promise<void> {
  const pattern = $<HTMLInputElement>('#pattern').value;
  const matchType = $<HTMLSelectElement>('#match-type').value as MatchType;
  const note = $<HTMLInputElement>('#note').value;
  const groupSel = $<HTMLSelectElement>('#group');
  // If the dropdown is still on the sentinel (shouldn't happen — the change
  // handler reverts it — but defensive), treat as ungrouped rather than
  // pass the magic string into createRule.
  const group = groupSel.value === NEW_GROUP_SENTINEL ? '' : groupSel.value;

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

  const candidate = createRule({ pattern, matchType, note, group });
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

  cachedRules = [candidate, ...rules];
  refreshGroupSelect();

  showError(null);
  showStatus(`Added ${candidate.pattern}`);
  $<HTMLInputElement>('#pattern').value = '';
  $<HTMLInputElement>('#note').value = '';
  // Intentionally leave the group field populated — typical flow is "add a
  // bunch of rules in the same group", so preserving it cuts re-typing.
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
