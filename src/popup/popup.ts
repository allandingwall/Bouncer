import { createRule, groupsOf, isDuplicate, validatePattern } from '../lib/rules.js';
import { loadGlobalEnabled, loadRules, saveGlobalEnabled, saveRules } from '../lib/storage.js';
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

  // Pre-populate the groups datalist so the user gets typeahead from the
  // groups they've already named. We load best-effort — if storage is down
  // the input just won't autocomplete.
  try {
    cachedRules = await loadRules();
    refreshGroupsDatalist();
  } catch {
    cachedRules = [];
  }

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

  await wireGlobalToggle();
}

async function wireGlobalToggle(): Promise<void> {
  const input = $<HTMLInputElement>('#global-toggle');
  const label = $<HTMLSpanElement>('#global-toggle-label');
  const setLabel = (enabled: boolean): void => {
    label.textContent = enabled ? 'active' : 'paused';
  };
  try {
    input.checked = await loadGlobalEnabled();
  } catch {
    input.checked = true;
  }
  setLabel(input.checked);
  input.addEventListener('change', () => {
    setLabel(input.checked);
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

function refreshGroupsDatalist(): void {
  const list = $<HTMLDataListElement>('#groups-list');
  list.replaceChildren();
  for (const group of groupsOf(cachedRules)) {
    if (group === null) continue;
    const opt = document.createElement('option');
    opt.value = group;
    list.append(opt);
  }
}

async function onSubmit(): Promise<void> {
  const pattern = $<HTMLInputElement>('#pattern').value;
  const matchType = $<HTMLSelectElement>('#match-type').value as MatchType;
  const note = $<HTMLInputElement>('#note').value;
  const group = $<HTMLInputElement>('#group').value;

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
  refreshGroupsDatalist();

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
