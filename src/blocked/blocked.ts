import { findMatchingRules, matchTypeLabel } from '../lib/matcher.js';
import { loadRules } from '../lib/storage.js';
import type { BlockRule } from '../lib/types.js';

/**
 * Block-page bootstrap.
 *
 * Reads the original URL from the redirect's query params, loads stored
 * rules, and renders every rule that matches — not just the one DNR happened
 * to fire on. The fragment of the original URL was carried through to the
 * block page's fragment (a quirk of redirect substitution), so we reattach it.
 */

function readOriginalUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  if (!url) return null;
  const hash = window.location.hash;
  return hash ? url + hash : url;
}

function setText(selector: string, text: string): void {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

function renderRules(rules: BlockRule[]): void {
  const list = document.getElementById('matched-rules');
  if (!list) return;
  list.replaceChildren();

  for (const rule of rules) {
    const li = document.createElement('li');
    li.className = 'rule';

    li.append(makeRow('Rule', makePattern(rule.pattern)));
    li.append(makeRow('Type', makeType(matchTypeLabel(rule.matchType))));
    if (rule.note && rule.note.trim()) {
      li.append(makeRow('Note', makeNote(rule.note.trim())));
    }

    list.append(li);
  }

  if (rules.length === 0) {
    const li = document.createElement('li');
    li.className = 'rule';
    li.append(makeRow('Rule', makeType('(rule no longer present)')));
    list.append(li);
  }
}

function makeRow(label: string, value: HTMLElement): DocumentFragment {
  const frag = document.createDocumentFragment();
  const dt = document.createElement('span');
  dt.className = 'rule-label';
  dt.textContent = label;
  frag.append(dt, value);
  return frag;
}

function makePattern(text: string): HTMLElement {
  const el = document.createElement('code');
  el.className = 'rule-pattern';
  el.textContent = text;
  return el;
}

function makeType(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'rule-type';
  el.textContent = text;
  return el;
}

function makeNote(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'rule-note';
  el.textContent = '“' + text + '”';
  return el;
}

async function init(): Promise<void> {
  const url = readOriginalUrl();
  if (url) {
    setText('#blocked-url', url);
    document.title = `Blocked · ${safeHostname(url)}`;
  }

  let rules: BlockRule[] = [];
  try {
    rules = await loadRules();
  } catch {
    // Storage unavailable — degrade gracefully; the URL is still shown.
  }

  const matches = url ? findMatchingRules(url, rules) : [];
  renderRules(matches);
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

void init();
