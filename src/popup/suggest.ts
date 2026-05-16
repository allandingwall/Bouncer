import type { MatchType } from '../lib/types.js';

/** Suggest a sensible pattern for the active tab's URL given a match type. */
export function suggestPattern(url: string, matchType: MatchType): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  const host = parsed.hostname.replace(/^www\./, '');

  switch (matchType) {
    case 'exact':
      return url;
    case 'domain':
      return host;
    case 'wildcard':
      // Literal host (no `*`) auto-allows a subdomain prefix in the matcher,
      // so `host/*` covers both the apex and every subdomain — and crucially
      // matches the URL the user is suggesting from. `*.host/*` would not.
      return `${host}/*`;
  }
}
