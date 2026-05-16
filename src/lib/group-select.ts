import { validateGroup } from './rules.js';

/**
 * DOM helpers for the group-selection `<select>` dropdown used in three
 * places — the popup's add-form, the options page's add-form, and the
 * per-rule "move to group" control on the options page. Also hosts the
 * inline `<dialog>`-based "new group" prompt that both surfaces share.
 *
 * This module IS DOM-aware (unlike everything else in `src/lib/`). It lives
 * here so the popup and options surfaces don't have to import each other,
 * and the shape of the dropdown / dialog can't drift between call sites.
 */

/** Sentinel option value that triggers the "create a new group" dialog. */
export const NEW_GROUP_SENTINEL = '__bouncer_new_group__';

/** Visible label for the "no group" option in the dropdown. */
const UNGROUPED_LABEL = '—';

/**
 * Fill a `<select>` with the standard group options:
 *
 *   —                  (the "no group" option — em dash)
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
  ungrouped.textContent = UNGROUPED_LABEL;
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

/**
 * Show the in-extension `<dialog>` to capture a new group name. Resolves
 * with the trimmed, validated name, or `null` if the user cancelled
 * (button, Esc, or backdrop click). Both the popup and the options page
 * mount the same `<dialog id="new-group-dialog">` markup, so this helper
 * works against either surface.
 *
 * Used in place of `window.prompt` so the flow stays inside the
 * extension's visual language instead of triggering a browser-native
 * prompt that overrides the design.
 */
export function promptForGroupName(): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = document.querySelector<HTMLDialogElement>('#new-group-dialog');
    if (!dialog) {
      // Should never happen — every surface that owns a group dropdown
      // also mounts the dialog markup. Resolve null rather than throw so
      // a misconfigured page degrades to "cancelled" instead of crashing.
      resolve(null);
      return;
    }

    const form = dialog.querySelector<HTMLFormElement>('form');
    const input = dialog.querySelector<HTMLInputElement>('#new-group-name');
    const errorEl = dialog.querySelector<HTMLParagraphElement>('#new-group-error');
    const cancelBtn = dialog.querySelector<HTMLButtonElement>('#new-group-cancel');
    if (!form || !input || !errorEl || !cancelBtn) {
      resolve(null);
      return;
    }

    // Reset state — the dialog is re-used across invocations.
    input.value = '';
    errorEl.hidden = true;
    errorEl.textContent = '';
    dialog.returnValue = '';

    const showError = (msg: string): void => {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    };

    const onSubmit = (e: SubmitEvent): void => {
      const raw = input.value.trim();
      if (!raw) {
        e.preventDefault();
        showError('Group name is required.');
        return;
      }
      const v = validateGroup(raw);
      if (!v.valid) {
        e.preventDefault();
        showError(v.message ?? 'Invalid group name.');
        return;
      }
      // Valid — let the form's method="dialog" close the dialog with
      // returnValue="confirm" (from the submit button's value attribute).
    };

    const onCancel = (): void => {
      dialog.close('cancel');
    };

    const onClose = (): void => {
      form.removeEventListener('submit', onSubmit);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.returnValue === 'confirm') {
        resolve(input.value.trim());
      } else {
        resolve(null);
      }
    };

    form.addEventListener('submit', onSubmit);
    cancelBtn.addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);

    dialog.showModal();
    // showModal() places initial focus on the dialog itself; nudge it to
    // the input so the user can type immediately.
    input.focus();
  });
}
