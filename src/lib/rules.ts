import type { BlockRule, MatchType } from './types.js';
import { normaliseDomain } from './matcher.js';
import { CURRENT_SCHEMA_VERSION } from './types.js';

/**
 * CRUD helpers and validation for BlockRule values.
 *
 * Pure — no I/O. The options/popup UIs glue these together with the storage layer.
 */

export interface ValidationResult {
  valid: boolean;
  /** Human-readable error suitable for inline display. */
  message?: string;
}

/**
 * Hard upper bound on pattern length. Generous enough for any realistic URL
 * (RFC 7230 doesn't define one; 2 KiB covers > 99% of in-the-wild URLs and
 * keeps wildcard regex compilation cost bounded).
 */
export const MAX_PATTERN_LENGTH = 2048;

/** Upper bound on the user-supplied note text. */
export const MAX_NOTE_LENGTH = 500;

/** Upper bound on a group name. Kept short so headers stay one-line. */
export const MAX_GROUP_NAME_LENGTH = 60;

/**
 * Cap on `*` count in a wildcard pattern. Each `*` becomes a `.*` in the
 * compiled regex; many adjacent `.*` segments enable catastrophic
 * backtracking against a malicious URL. The matcher never needs more than a
 * handful of these in practice.
 */
export const MAX_WILDCARD_STARS = 16;

export function validatePattern(pattern: string, matchType: MatchType): ValidationResult {
  const trimmed = pattern.trim();
  if (!trimmed) return { valid: false, message: 'Pattern is required.' };
  if (trimmed.length > MAX_PATTERN_LENGTH) {
    return { valid: false, message: `Pattern is too long (max ${MAX_PATTERN_LENGTH} chars).` };
  }
  if (/\s/.test(trimmed)) return { valid: false, message: 'Pattern cannot contain whitespace.' };

  switch (matchType) {
    case 'exact': {
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        return { valid: false, message: 'Must be a full URL (e.g. https://example.com/path).' };
      }
      // Only allow http(s). DNR only fires on real navigations (which are
      // always http(s)), so other schemes can never match — they'd be dead
      // rules at best, and a `javascript:` pattern shouldn't be storable
      // even as inert data.
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, message: 'URL must use http or https.' };
      }
      return { valid: true };
    }

    case 'domain': {
      const d = normaliseDomain(trimmed);
      if (!d.includes('.'))
        return { valid: false, message: 'Domain must contain at least one dot.' };
      if (/[*?#]/.test(d)) return { valid: false, message: 'Domain cannot contain wildcards.' };
      if (!/^[a-z0-9.-]+$/i.test(d))
        return { valid: false, message: 'Domain contains invalid characters.' };
      return { valid: true };
    }

    case 'wildcard': {
      if (!trimmed.includes('*')) {
        return { valid: false, message: 'Wildcard pattern must contain at least one "*".' };
      }
      if (trimmed === '*' || trimmed === '*.*' || trimmed === '*/*') {
        return { valid: false, message: 'Pattern is too broad — would block everything.' };
      }
      const stars = (trimmed.match(/\*/g) ?? []).length;
      if (stars > MAX_WILDCARD_STARS) {
        return {
          valid: false,
          message: `Too many wildcards (max ${MAX_WILDCARD_STARS}).`,
        };
      }
      // If the pattern carries an explicit scheme, restrict it to http(s).
      // Anything else (moz-extension://*, about://*, file://*) could only
      // match extension or browser-internal pages — which the matcher and
      // DNR layer also refuse to touch, but rejecting it here keeps the
      // invalid rule from ever being stored.
      const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed);
      if (schemeMatch && schemeMatch[1]?.toLowerCase() !== 'http' && schemeMatch[1]?.toLowerCase() !== 'https') {
        return { valid: false, message: 'Wildcard scheme must be http or https.' };
      }
      return { valid: true };
    }
  }
}

/**
 * Validate a group name. Group names are UI-only labels, so the rules are
 * lighter than for patterns: non-empty after trim, within the length cap,
 * and free of control characters that would mangle the DOM rendering.
 */
export function validateGroup(group: string): ValidationResult {
  const trimmed = group.trim();
  if (!trimmed) return { valid: false, message: 'Group name is required.' };
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    return {
      valid: false,
      message: `Group name is too long (max ${MAX_GROUP_NAME_LENGTH} chars).`,
    };
  }
  if (containsControlChar(trimmed)) {
    return { valid: false, message: 'Group name contains invalid characters.' };
  }
  return { valid: true };
}

/** True if the string contains any ASCII control character (incl. DEL). */
function containsControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function clipGroup(group: string): string {
  return group.length > MAX_GROUP_NAME_LENGTH ? group.slice(0, MAX_GROUP_NAME_LENGTH) : group;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random suffix. Sufficient for storage keys, not cryptographically meaningful.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateRuleInput {
  pattern: string;
  matchType: MatchType;
  note?: string;
  /** Optional group name. Silently dropped if it fails `validateGroup`. */
  group?: string;
  enabled?: boolean;
}

export function createRule(input: CreateRuleInput): BlockRule {
  const rule: BlockRule = {
    id: generateId(),
    pattern: input.pattern.trim(),
    matchType: input.matchType,
    enabled: input.enabled ?? true,
    createdAt: Date.now(),
  };
  if (input.note && input.note.trim()) rule.note = clipNote(input.note.trim());
  if (input.group) {
    const g = input.group.trim();
    if (g && validateGroup(g).valid) rule.group = clipGroup(g);
  }
  return rule;
}

function clipNote(note: string): string {
  return note.length > MAX_NOTE_LENGTH ? note.slice(0, MAX_NOTE_LENGTH) : note;
}

export function updateRule(
  rule: BlockRule,
  patch: Partial<Omit<BlockRule, 'id' | 'createdAt'>>,
): BlockRule {
  const next: BlockRule = { ...rule };
  if (patch.pattern !== undefined) next.pattern = patch.pattern.trim();
  if (patch.matchType !== undefined) next.matchType = patch.matchType;
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.note !== undefined) {
    const n = patch.note.trim();
    if (n) next.note = clipNote(n);
    else delete next.note;
  }
  if (patch.group !== undefined) {
    const g = patch.group.trim();
    // Empty / invalid group strings clear the assignment, same way an
    // empty note clears the note. This makes "ungrouped" expressible
    // through the same patch shape as everything else.
    if (g && validateGroup(g).valid) next.group = clipGroup(g);
    else delete next.group;
  }
  return next;
}

/** True if two rules describe the same intent (same pattern + matchType). */
export function isDuplicate(a: BlockRule, b: BlockRule): boolean {
  return a.pattern === b.pattern && a.matchType === b.matchType;
}

/** Serialise rules to a stable, human-readable JSON document for export. */
export function serializeRules(rules: readonly BlockRule[]): string {
  return JSON.stringify({ version: CURRENT_SCHEMA_VERSION, rules }, null, 2) + '\n';
}

export interface ImportResult {
  rules: BlockRule[];
  /** Number of entries skipped because they were malformed. */
  skipped: number;
}

/** Parse an exported JSON document back into rules. Tolerates partially-malformed entries. */
export function deserializeRules(input: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch {
    throw new Error('Could not parse JSON.');
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('Expected an object with a "rules" array.');
  }

  const rulesField = (data as { rules?: unknown }).rules;
  if (!Array.isArray(rulesField)) {
    throw new Error('Expected an object with a "rules" array.');
  }

  // Top-level `group` becomes the default for any rule entry that doesn't
  // specify its own. Lets example/template blocklists declare their group
  // once at the top rather than repeating it on every entry.
  const rawDefault = (data as { group?: unknown }).group;
  const defaultGroup =
    typeof rawDefault === 'string' && rawDefault.trim() && validateGroup(rawDefault).valid
      ? clipGroup(rawDefault.trim())
      : undefined;

  const out: BlockRule[] = [];
  let skipped = 0;

  for (const item of rulesField) {
    const parsed = parseRule(item);
    if (!parsed) {
      skipped += 1;
      continue;
    }
    if (defaultGroup && !parsed.group) parsed.group = defaultGroup;
    out.push(parsed);
  }

  return { rules: out, skipped };
}

/**
 * Validate-and-coerce a single value into a BlockRule, or return null if it
 * isn't well-formed. Also exported for the storage layer, which uses it as
 * a sanitiser when reading state that another tab or device may have
 * written.
 */
export function parseRule(input: unknown): BlockRule | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;

  const pattern = typeof r.pattern === 'string' ? r.pattern.trim() : '';
  const matchType = r.matchType;
  if (!pattern) return null;
  if (matchType !== 'exact' && matchType !== 'domain' && matchType !== 'wildcard') return null;

  // Reject imports that exceed the same bounds we enforce on UI input.
  // This also guards the matcher against pathological wildcards.
  if (!validatePattern(pattern, matchType).valid) return null;

  const enabled = typeof r.enabled === 'boolean' ? r.enabled : true;
  const createdAt =
    typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : Date.now();
  const id = typeof r.id === 'string' && r.id ? r.id : generateId();

  const rule: BlockRule = { id, pattern, matchType, enabled, createdAt };
  if (typeof r.note === 'string' && r.note.trim()) rule.note = clipNote(r.note.trim());
  if (typeof r.group === 'string' && r.group.trim() && validateGroup(r.group).valid) {
    rule.group = clipGroup(r.group.trim());
  }
  return rule;
}

/**
 * Distinct group memberships present in the given rule set, in display
 * order: ungrouped first (represented as `null`) if any rules lack a
 * group, then named groups alphabetically (locale-aware). Used by the
 * options-page section renderer and the popup datalist.
 */
export function groupsOf(rules: readonly BlockRule[]): Array<string | null> {
  let hasUngrouped = false;
  const named = new Set<string>();
  for (const r of rules) {
    if (r.group) named.add(r.group);
    else hasUngrouped = true;
  }
  const sortedNamed = [...named].sort((a, b) => a.localeCompare(b));
  return hasUngrouped ? [null, ...sortedNamed] : sortedNamed;
}

/** Case-insensitive substring search across pattern + note. */
export function filterRules(rules: readonly BlockRule[], query: string): BlockRule[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rules];
  return rules.filter((r) => {
    if (r.pattern.toLowerCase().includes(q)) return true;
    if (r.note && r.note.toLowerCase().includes(q)) return true;
    return false;
  });
}
