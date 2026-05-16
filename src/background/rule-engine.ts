import type { BlockRule } from '../lib/types.js';

/**
 * Stub: translates BlockRule[] into declarativeNetRequest rules and applies them.
 *
 * Full implementation arrives in the next phase (`feat: translate block rules to DNR`).
 * For now this is a no-op so the service worker compiles and loads cleanly.
 */
export function applyRules(_rules: BlockRule[]): Promise<void> {
  return Promise.resolve();
}
