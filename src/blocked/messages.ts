/**
 * The pool of headline + lede pairs the block page rotates through on each
 * load. Pairs are kept together (not independently shuffled) so the
 * headline's tone matches the lede.
 *
 * The set leans calm — Bouncer's design brief is "gentle redirect, not
 * access denied error" — but includes a few firmer entries for users who
 * want the sharper edge.
 *
 * Pure module. No DOM, no `Math.random` at module scope — the picker takes
 * the rng so tests can drive it deterministically.
 */

export interface BlockMessage {
  /** The big serif headline. Sentence case, punctuated. */
  headline: string;
  /** The italic lede below. Short, single sentence. */
  lede: string;
}

export const BLOCK_MESSAGES: readonly BlockMessage[] = [
  // The original — keeps the page's existing voice in the rotation.
  { headline: 'Not right now.', lede: 'You asked me to keep this one closed.' },

  // Calm / reflective.
  { headline: 'Closed for now.', lede: 'Past-you decided this could wait.' },
  { headline: 'Not today.', lede: 'You set this site aside.' },
  { headline: 'Held back.', lede: 'You asked Bouncer to keep this away.' },
  { headline: 'Not this one.', lede: 'You blocked this site for a reason.' },

  // Firmer, still kind.
  { headline: 'Off limits.', lede: 'This site is on your blocklist.' },
  { headline: 'No through traffic.', lede: 'You marked this one off limits.' },

  // Sterner — the "access denied" register.
  { headline: 'Access denied.', lede: 'This one is on your blocklist.' },

  // Encouraging.
  { headline: 'Stay focused.', lede: 'You set this site aside for later.' },
];

/**
 * Pick one message at random. `rng` defaults to `Math.random` and is
 * exposed so tests can pin the choice. Always returns a defined message —
 * the pool is non-empty by construction and the index is clamped.
 */
export function pickMessage(rng: () => number = Math.random): BlockMessage {
  const n = BLOCK_MESSAGES.length;
  // `rng()` is documented as 0 ≤ x < 1 but we don't trust the contract
  // beyond that — clamp into [0, n-1] before indexing.
  const idx = Math.min(n - 1, Math.max(0, Math.floor(rng() * n)));
  // Non-null assertion: `idx` is provably in range and `BLOCK_MESSAGES` is
  // non-empty, but `noUncheckedIndexedAccess` doesn't know that.
  return BLOCK_MESSAGES[idx]!;
}
