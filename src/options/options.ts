import {
  createRule,
  deserializeRules,
  filterRules,
  groupsOf,
  isDuplicate,
  serializeRules,
  updateRule,
  validateGroup,
  validatePattern,
} from '../lib/rules.js';
import { loadState, saveGlobalEnabled, saveRules } from '../lib/storage.js';
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
  /** Pending two-stage "delete all" confirmation. */
  pendingClearAll: boolean;
  /** Pending two-stage "delete group" confirmation: name of the group, or null. */
  pendingDeleteGroup: string | null;
}

const state: State = {
  rules: [],
  query: '',
  pendingDeleteId: null,
  pendingClearAll: false,
  pendingDeleteGroup: null,
};

/** Auto-cancel a pending two-stage confirmation after this many ms of inaction. */
const CONFIRM_TIMEOUT_MS = 3500;

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
  let globalEnabled = true;
  try {
    const { state: stored, source } = await loadState();
    state.rules = stored.rules;
    globalEnabled = stored.globalEnabled !== false;
    if (source === 'local') {
      storageWarning = 'Reading from local storage (sync unavailable).';
    }
  } catch {
    storageWarning = 'Could not load rules.';
  }
  bindEvents();
  wireGlobalToggle(globalEnabled);
  render();
}

function wireGlobalToggle(initial: boolean): void {
  const input = $<HTMLInputElement>('#global-toggle');
  const label = $<HTMLSpanElement>('#global-toggle-label');
  const setLabel = (enabled: boolean): void => {
    label.textContent = enabled ? 'active' : 'paused';
  };
  input.checked = initial;
  setLabel(initial);
  input.addEventListener('change', () => {
    setLabel(input.checked);
    void saveGlobalEnabled(input.checked);
  });
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
  $<HTMLButtonElement>('#clear-all').addEventListener('click', onClearAll);
}

function onSubmitAdd(e: Event): void {
  e.preventDefault();
  const pattern = $<HTMLInputElement>('#add-pattern').value;
  const matchType = $<HTMLSelectElement>('#add-type').value as MatchType;
  const note = $<HTMLInputElement>('#add-note').value;
  const group = $<HTMLInputElement>('#add-group').value;

  const validation = validatePattern(pattern, matchType);
  if (!validation.valid) {
    showAddError(validation.message ?? 'Invalid pattern.');
    return;
  }
  if (group.trim()) {
    const groupValidation = validateGroup(group);
    if (!groupValidation.valid) {
      showAddError(groupValidation.message ?? 'Invalid group name.');
      return;
    }
  }

  const rule = createRule({ pattern, matchType, note, group });
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
  // Intentionally leave the group field populated — typical flow is "add a
  // few rules in the same group", so preserving it cuts re-typing.
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

/**
 * Two-stage "delete all rules" confirm. First click flips the button into
 * a confirmation state (text + colour); second click within the timeout
 * actually clears the list. Auto-cancels after CONFIRM_TIMEOUT_MS so a
 * stray click doesn't leave the page armed.
 *
 * Deliberately ignores the search filter — "delete all" means everything,
 * not "everything currently visible". If we ever wanted bulk-delete of a
 * filtered subset, that's a separate, more specific action.
 */
function onClearAll(): void {
  if (state.rules.length === 0) return;

  if (state.pendingClearAll) {
    const count = state.rules.length;
    state.pendingClearAll = false;
    state.pendingDeleteId = null;
    state.rules = [];
    setIoMessage(`Deleted ${count} rule${count === 1 ? '' : 's'}.`);
    void persist();
    return;
  }

  state.pendingClearAll = true;
  render();
  window.setTimeout(() => {
    if (state.pendingClearAll) {
      state.pendingClearAll = false;
      render();
    }
  }, CONFIRM_TIMEOUT_MS);
}

function renderClearAll(): void {
  const btn = $<HTMLButtonElement>('#clear-all');
  const count = state.rules.length;
  // If the list emptied via another path (single delete clearing the last
  // rule, say) while the bulk-delete was armed, drop the pending state so
  // the button isn't stuck mid-prompt on top of an empty list.
  if (count === 0 && state.pendingClearAll) state.pendingClearAll = false;
  btn.disabled = count === 0;
  btn.classList.toggle('confirming', state.pendingClearAll);
  btn.textContent = state.pendingClearAll
    ? `Really? Delete all ${count} rule${count === 1 ? '' : 's'}`
    : 'Delete all rules';
}

function render(): void {
  renderStorageNote();
  renderGroupsDatalist();
  renderList();
  renderClearAll();
}

function renderGroupsDatalist(): void {
  const list = $<HTMLDataListElement>('#add-groups-list');
  list.replaceChildren();
  for (const group of groupsOf(state.rules)) {
    if (group === null) continue;
    const opt = document.createElement('option');
    opt.value = group;
    list.append(opt);
  }
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
  const container = $<HTMLDivElement>('#rules');
  const empty = $<HTMLParagraphElement>('#empty');
  const count = $<HTMLSpanElement>('#rule-count');
  const visible = filterRules(state.rules, state.query);

  container.replaceChildren();

  count.textContent = formatCount(
    state.rules.length,
    visible.length,
    state.query.trim().length > 0,
  );

  if (state.rules.length === 0) {
    empty.hidden = false;
    empty.textContent = 'No rules yet.';
    return;
  }
  if (visible.length === 0) {
    empty.hidden = false;
    empty.textContent = 'No rules match this search.';
    return;
  }
  empty.hidden = true;

  // Section per group. Group set is computed over the *visible* rules so
  // an empty filter result doesn't leave an empty section behind.
  for (const group of groupsOf(visible)) {
    const rulesInGroup = visible.filter((r) => (r.group ?? null) === group);
    container.append(renderGroupSection(group, rulesInGroup));
  }
}

function renderGroupSection(group: string | null, rules: BlockRule[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'rule-group';
  if (group !== null) section.dataset.group = group;

  const header = document.createElement('header');
  header.className = 'rule-group-header';

  const title = document.createElement('h3');
  title.className = 'rule-group-title' + (group === null ? ' ungrouped' : '');
  title.textContent = group === null ? 'Ungrouped' : group;

  const countLabel = document.createElement('span');
  countLabel.className = 'rule-group-count';
  countLabel.textContent = `${rules.length} rule${rules.length === 1 ? '' : 's'}`;

  header.append(title, countLabel);

  // "Delete group" only makes sense for named groups — there's no
  // ungrouped "thing" to delete; users should clear individual rules.
  if (group !== null) {
    header.append(renderDeleteGroupButton(group));
  }

  section.append(header);

  const list = document.createElement('ul');
  list.className = 'rule-group-list';
  for (const rule of rules) list.append(renderRule(rule));
  section.append(list);

  return section;
}

function renderDeleteGroupButton(group: string): HTMLButtonElement {
  // Acts on the full group (not the filtered subset) — same conventions
  // as the existing "Delete all rules" button.
  const totalInGroup = state.rules.filter((r) => r.group === group).length;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rule-group-delete';
  const isConfirming = state.pendingDeleteGroup === group;
  btn.textContent = isConfirming
    ? `Really? Delete ${totalInGroup} rule${totalInGroup === 1 ? '' : 's'}`
    : 'Delete group';
  if (isConfirming) btn.classList.add('confirming');
  btn.addEventListener('click', () => {
    if (state.pendingDeleteGroup === group) {
      state.pendingDeleteGroup = null;
      state.rules = state.rules.filter((r) => r.group !== group);
      void persist();
      return;
    }
    state.pendingDeleteGroup = group;
    render();
    window.setTimeout(() => {
      if (state.pendingDeleteGroup === group) {
        state.pendingDeleteGroup = null;
        render();
      }
    }, CONFIRM_TIMEOUT_MS);
  });
  return btn;
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
  actions.append(buildMoveSelect(rule), buildToggleButton(rule), buildDeleteButton(rule));

  li.append(pattern, meta, actions);
  return li;
}

/**
 * Inline `<select>` for moving a rule between groups. Lists every existing
 * group plus an "Ungrouped" option and a sentinel "+ New group…" that
 * window.prompts for a name. Commits on change.
 */
function buildMoveSelect(rule: BlockRule): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'rule-move';
  select.setAttribute('aria-label', `Move rule '${rule.pattern}' to group`);

  const groupNames = groupsOf(state.rules).filter((g): g is string => g !== null);

  const ungrouped = document.createElement('option');
  ungrouped.value = '';
  ungrouped.textContent = '(Ungrouped)';
  if (!rule.group) ungrouped.selected = true;
  select.append(ungrouped);

  for (const g of groupNames) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    if (rule.group === g) opt.selected = true;
    select.append(opt);
  }

  if (groupNames.length > 0) {
    const sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '──────';
    select.append(sep);
  }

  const newOpt = document.createElement('option');
  newOpt.value = MOVE_NEW_GROUP_SENTINEL;
  newOpt.textContent = '+ New group…';
  select.append(newOpt);

  select.addEventListener('change', () => onMoveSelectChange(rule, select));
  return select;
}

const MOVE_NEW_GROUP_SENTINEL = '__bouncer_new_group__';

function onMoveSelectChange(rule: BlockRule, select: HTMLSelectElement): void {
  const value = select.value;

  if (value === MOVE_NEW_GROUP_SENTINEL) {
    const raw = window.prompt('New group name', rule.group ?? '');
    // Cancelled — revert the select to whatever it was showing.
    if (raw === null) {
      select.value = rule.group ?? '';
      return;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      select.value = rule.group ?? '';
      return;
    }
    const v = validateGroup(trimmed);
    if (!v.valid) {
      window.alert(v.message ?? 'Invalid group name.');
      select.value = rule.group ?? '';
      return;
    }
    applyRuleGroup(rule, trimmed);
    return;
  }

  applyRuleGroup(rule, value);
}

/** Set or clear a rule's group, then persist + re-render. */
function applyRuleGroup(rule: BlockRule, newGroup: string): void {
  const idx = state.rules.findIndex((r) => r.id === rule.id);
  if (idx < 0) return;
  // `updateRule({ group: '' })` clears the field; non-empty sets it.
  state.rules[idx] = updateRule(rule, { group: newGroup });
  void persist();
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
      }, CONFIRM_TIMEOUT_MS);
    }
  });
  return btn;
}

void init();
