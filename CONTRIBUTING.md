# Contributing to Bouncer

Thanks for your interest! Bouncer is small and intentionally focused — contributions that keep it that way are very welcome.

## Tooling

Bouncer uses [Bun](https://bun.sh) (1.3+) as its package manager, task runner, and TypeScript runtime. Install it via:

```sh
curl -fsSL https://bun.sh/install | bash
```

The standard Node toolchain (npm/pnpm/yarn) should also work — `package.json` is plain — but Bun is what CI runs and what we test against.

## Workflow

1. Fork and clone the repo.
2. `bun install`
3. Create a topic branch: `git checkout -b feat/short-description`
4. Make your changes. Keep commits small and use [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `build:`, `ci:`).
5. Before opening a PR, run the full check locally:

   ```sh
   bun run lint
   bun run format:check
   bun run typecheck
   bun run test
   bun run build
   ```

   CI runs the same set.

6. Open a PR against `main`.

## Coding conventions

- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Index accesses return `T | undefined` — handle the absent case explicitly.
- Pure logic lives under `src/lib/` and is heavily unit-tested. Side-effects (storage, DNR, DOM) live behind small typed wrappers.
- Default to no comments. Add one only when the _why_ would surprise a future reader; don't restate the _what_.
- Keep the visual language consistent across surfaces — the palette, type stack, and hairline rules are defined per surface but should mirror each other.

## Tests

```sh
bun run test         # one-shot
bun run test:watch   # watch
bun run test:coverage
```

URL-matching logic and the storage layer must stay covered. New behaviour generally needs a test.

## Block-page philosophy

Bouncer is intentionally strict. The block page deliberately omits any bypass affordance — no snooze, no "continue anyway", no back-link to the matched URL. PRs that soften this stance are out of scope, but PRs that improve the page's typography, accessibility, or empty/error states are very welcome.

## Reporting bugs

File an issue with:

- Firefox version
- A minimal rule that reproduces the problem (pattern + match type)
- The URL you expected to be blocked / unblocked
- Anything in the browser console under **Browser Toolbox → Console**

## License

By contributing you agree your work is released under the [MIT License](./LICENSE).
