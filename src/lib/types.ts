export type MatchType = 'exact' | 'domain' | 'wildcard';

export interface BlockRule {
  /** Stable identifier (uuid v4). */
  id: string;
  /** The user-supplied pattern: a URL, domain, or wildcard expression. */
  pattern: string;
  /** How `pattern` is interpreted when matching a URL. */
  matchType: MatchType;
  /** Disabled rules are ignored by the matcher and the DNR engine. */
  enabled: boolean;
  /** Millisecond epoch when the rule was first created. */
  createdAt: number;
  /** Optional human-readable note. */
  note?: string;
}

export interface StoredState {
  rules: BlockRule[];
  /** Schema version for forward-compatibility. */
  version: number;
}

export const CURRENT_SCHEMA_VERSION = 1;
