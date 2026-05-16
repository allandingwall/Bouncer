/**
 * Pure helpers for the block page's URL handling — no DOM, no browser APIs.
 * Kept in a standalone module so unit tests can import them without the
 * surrounding entry-point side effects.
 */

export interface LocationLike {
  search: string;
  hash: string;
}

/**
 * Extract the original URL out of the block page's own location.
 *
 *  - Primary path: the URL is carried in `location.hash` (fragments are
 *    opaque to the URL parser, so attacker-controlled `&`, `?`, `=`, `#`
 *    inside the original URL all survive intact).
 *  - Backwards-compat path: the older `?url=...` query-param scheme, kept
 *    so any in-flight redirect from a previous build still renders.
 */
export function readOriginalUrlFrom(loc: LocationLike): string | null {
  if (loc.hash.length > 1) return loc.hash.slice(1);
  const url = new URLSearchParams(loc.search).get('url');
  return url ? url : null;
}
