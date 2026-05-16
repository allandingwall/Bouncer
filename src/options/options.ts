import {
  createRule,
  deserializeRules,
  filterRules,
  isDuplicate,
  serializeRules,
  updateRule,
  validatePattern,
} from '../lib/rules.js';
import { loadState, saveRules } from '../lib/storage.js';
import { matchTypeLabel } from '../lib/matcher.js';
import type { BlockRule, MatchType } from '../lib/types.js';

/**
 * Options page glue: load rules → render → handle CRUD + search + import/export.
 *
 * All persistence goes through the storage layer; DOM mutations are localised
 * to the small set of helpers below.
 */

const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

interface State {
  rules: BlockRule[];
  query: string;
  /** Pending two-stage delete: rule id currently in "confirm?" mode. */
  pendingDeleteId: string | null;
}

const state: State = {
  rules: [],
  query: '',
  pendingDeleteId: null,
};

let storageWarning: string | null = null;

async function persist(): Promise<void> {
  try {
    const result = await saveRules(state.rules);
    storageWarning = result.fellBack ? 'Sync unavailable — saving locally only.' : null;
  } catch {
    storageWarning = 'Failed to save. Try again.';
  }
  render();
}

async function init(): Promise<void> {
  try {
    const { state: stored, source } = await loadState();
    state.rules = stored.rules;
    if (source === 'local') {
      storageWarning = 'Reading from local storage (sync unavailable).';
    }
  } catch {
    storageWarning = 'Could not load rules.';
  }
  bindEvents();
  render();
}

function bindEvents(): void {
  $<HTMLFormElement>('#add-form').addEventListener('submit', onSubmitAdd);
  $<HTMLInputElement>('#search').addEventListener('input', (e) => {
    state.query = (e.target as HTMLInputElement).value;
    renderList();
  });
  $('#export').addEventListener('click', onExport);
  $('#import').addEventListener('click', () => $<HTMLInputElement>('#import-file').click());
  $<HTMLInputElement>('#import-file').addEventListener('change', (e) => {
    void onImport(e);
  });
}

function onSubmitAdd(e: Event): void {
  e.preventDefault();
  const pattern = $<HTMLInputElement>('#add-pattern').value;
  const matchType = $<HTMLSelectElement>('#add-type').value as MatchType;
  const note = $<HTMLInputElement>('#add-note').value;

  const validation = validatePattern(pattern, matchType);
  if (!validation.valid) {
    showAddError(validation.message ?? 'Invalid pattern.');
    return;
  }

  const rule = createRule({ pattern, matchType, note });
  if (state.rules.some((r) => isDuplicate(r, rule))) {
    showAddError('A rule with this pattern and type already exists.');
    return;
  }

  state.rules = [rule, ...state.rules];
  clearAddForm();
  showAddError(null);
  void persist();
}

function clearAddForm(): void {
  $<HTMLInputElement>('#add-pattern').value = '';
  $<HTMLInputElement>('#add-note').value = '';
  $<HTMLInputElement>('#add-pattern').focus();
}

function showAddError(msg: string | null): void {
  const el = $<HTMLParagraphElement>('#add-error');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
  } else {
    el.hidden = false;
    el.textContent = msg;
  }
}

function onExport(): void {
  const json = serializeRules(state.rules);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `bouncer-rules-${stamp}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setIoMessage(`Exported ${state.rules.length} rule${state.rules.length === 1 ? '' : 's'}.`);
}

async function onImport(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    const { rules: imported, skipped } = deserializeRules(text);

    // Merge: keep existing rules, append imported ones unless duplicate.
    const existing = new Set(state.rules.map((r) => `${r.matchType}::${r.pattern}`));
    let added = 0;
    for (const r of imported) {
      const key = `${r.matchType}::${r.pattern}`;
      if (!existing.has(key)) {
        state.rules.push(r);
        existing.add(key);
        added += 1;
      }
    }
    setIoMessage(
      `Imported ${added} rule${added === 1 ? '' : 's'}${
        skipped ? `, skipped ${skipped} malformed` : ''
      }.`,
    );
    void persist();
  } catch (err) {
    setIoMessage((err as Error).message, true);
  }
}

function setIoMessage(msg: string, isError = false): void {
  const el = $<HTMLParagraphElement>('#io-message');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

function render(): void {
  renderStorageNote();
  renderList();
}

function renderStorageNote(): void {
  const el = $<HTMLSpanElement>('#storage-note');
  if (storageWarning) {
    el.hidden = false;
    el.textContent = storageWarning;
  } else {
    el.hidden = true;
    el.textContent = '';
  }
}

function renderList(): void {
  const list = $<HTMLUListElement>('#rules');
  const empty = $<HTMLParagraphElement>('#empty');
  const count = $<HTMLSpanElement>('#rule-count');
  const visible = filterRules(state.rules, state.query);

  list.replaceChildren();

  count.textContent = formatCount(
    state.rules.length,
    visible.length,
    state.query.trim().length > 0,
  );

  if (state.rules.length === 0) {
    empty.hidden = false;
    empty.textContent = 'No rules yet. Add one above.';
    return;
  }
  if (visible.length === 0) {
    empty.hidden = false;
    empty.textContent = 'No rules match this search.';
    return;
  }
  empty.hidden = true;

  for (const rule of visible) list.append(renderRule(rule));
}

function formatCount(total: number, visible: number, filtered: boolean): string {
  if (filtered) return `${visible} of ${total}`;
  return `${total} rule${total === 1 ? '' : 's'}`;
}

function renderRule(rule: BlockRule): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'rule-row' + (rule.enabled ? '' : ' disabled');
  li.dataset.id = rule.id;

  const pattern = document.createElement('div');
  pattern.className = 'rule-pattern';
  pattern.textContent = rule.pattern;

  const meta = document.createElement('div');
  meta.className = 'rule-meta';
  meta.append(textNode(matchTypeLabel(rule.matchType)));
  if (rule.note) {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '·';
    meta.append(sep, textNode(rule.note));
  }

  const actions = document.createElement('div');
  actions.className = 'rule-actions';
  actions.append(buildToggleButton(rule), buildDeleteButton(rule));

  li.append(pattern, meta, actions);
  return li;
}

function textNode(s: string): Text {
  return document.createTextNode(s);
}

function buildToggleButton(rule: BlockRule): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = rule.enabled ? 'Disable' : 'Enable';
  btn.addEventListener('click', () => {
    const idx = state.rules.findIndex((r) => r.id === rule.id);
    if (idx < 0) return;
    state.rules[idx] = updateRule(rule, { enabled: !rule.enabled });
    void persist();
  });
  return btn;
}

function buildDeleteButton(rule: BlockRule): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'danger';
  const isConfirming = state.pendingDeleteId === rule.id;
  btn.textContent = isConfirming ? 'Really?' : 'Delete';
  if (isConfirming) btn.classList.add('confirming');
  btn.addEventListener('click', () => {
    if (state.pendingDeleteId === rule.id) {
      state.pendingDeleteId = null;
      state.rules = state.rules.filter((r) => r.id !== rule.id);
      void persist();
    } else {
      state.pendingDeleteId = rule.id;
      render();
      // Clear pending state if the user wanders away.
      window.setTimeout(() => {
        if (state.pendingDeleteId === rule.id) {
          state.pendingDeleteId = null;
          render();
        }
      }, 3500);
    }
  });
  return btn;
}

void init();
