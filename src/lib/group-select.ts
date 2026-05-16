/**
 * DOM helpers for the group-selection `<select>` dropdown used in three
 * places — the popup's add-form, the options page's add-form, and the
 * per-rule "move to group" control on the options page.
 *
 * This module IS DOM-aware (unlike everything else in `src/lib/`). It lives
 * here so the popup and options surfaces don't have to import each other,
 * and the shape of the dropdown can't drift between call sites.
 */

/** Sentinel option value that triggers a "create a new group" prompt. */
export const NEW_GROUP_SENTINEL = '__bouncer_new_group__';

/**
 * Fill a `<select>` with the standard group options:
 *
 *   (Ungrouped)
 *   ─ each named group in display order ─
 *   ────── (separator, only if there are named groups)
 *   + New group…
 *
 * `preserve` keeps the previously-selected value selected if it still
 * exists in the list, so a re-populate after a successful add doesn't
 * drop the user's choice.
 */
export function populateGroupSelect(
  select: HTMLSelectElement,
  groups: readonly string[],
  preserve: string,
): void {
  select.replaceChildren();

  const ungrouped = document.createElement('option');
  ungrouped.value = '';
  ungrouped.textContent = '(Ungrouped)';
  select.append(ungrouped);

  for (const g of groups) {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    select.append(opt);
  }

  if (groups.length > 0) {
    const sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '──────';
    select.append(sep);
  }

  const newOpt = document.createElement('option');
  newOpt.value = NEW_GROUP_SENTINEL;
  newOpt.textContent = '+ New group…';
  select.append(newOpt);

  if (preserve && preserve !== NEW_GROUP_SENTINEL && groups.includes(preserve)) {
    select.value = preserve;
  } else {
    select.value = '';
  }
}

/**
 * Insert a freshly-created group as a new option (right before the
 * separator, or before the sentinel if there's no separator yet) and mark
 * it selected. The next re-populate via `populateGroupSelect` will fold it
 * into the regular options once it's been persisted to a rule.
 */
export function insertNewGroupOption(select: HTMLSelectElement, name: string): void {
  for (const opt of Array.from(select.options)) {
    if (opt.value === name) {
      select.value = name;
      return;
    }
  }
  const newOpt = document.createElement('option');
  newOpt.value = name;
  newOpt.textContent = name;
  const sentinel = select.querySelector<HTMLOptionElement>(`option[value="${NEW_GROUP_SENTINEL}"]`);
  const sep = sentinel?.previousElementSibling;
  const anchor = sep instanceof HTMLOptionElement && sep.disabled ? sep : sentinel;
  if (anchor) select.insertBefore(newOpt, anchor);
  else select.append(newOpt);
  select.value = name;
}
