# Bouncer

A modern website blocker for Firefox.

Bouncer redirects matched URLs to a calm in-extension block page. There is no snooze, no temporary disable, no "unblock anyway" link. Once a rule is in place, the only way past it is to delete the rule yourself from the options page or deactivate the extension.

The extension provides a microboundary, leading to more mindful computer interactions.

## Status

Early development. Not yet published to [addons.mozilla.org](https://addons.mozilla.org).

## Features

- Block by **exact URL**, **domain (with subdomains)**, or **wildcard** pattern
- Quick-add the active tab from the toolbar popup
- Full rules manager: search, enable/disable, import/export as JSON
- Rules sync across devices via Firefox Sync; transparent fallback to local storage
- Strict block page that surfaces _every_ matching rule, not just the one that fired

## Install (developer)

Requires [Bun](https://bun.sh) 1.3+.

```sh
git clone https://github.com/allandingwall/Bouncer.git
cd Bouncer
bun install
bun run build
bun run start:firefox
```

`start:firefox` launches a fresh Firefox profile with Bouncer loaded as a temporary add-on. Alternatively, load `dist/` manually via `about:debugging` → **This Firefox** → **Load Temporary Add-on**.

## Develop

```sh
bun run dev          # Vite watch mode
bun run lint         # ESLint
bun run format       # Prettier
bun run typecheck    # tsc --noEmit
bun run test         # Vitest
bun run test:watch   # Vitest watch
```

Preview a single UI surface in a regular browser tab:

```sh
bun run dev
# then visit, e.g.:
# http://localhost:5173/blocked/blocked.html?url=https://reddit.com/r/cats
```

The block page degrades gracefully when `browser.storage` isn't available (i.e. outside the extension), so design and layout can be reviewed at the URL above.

## Build & package

```sh
bun run build        # → dist/  (loadable temporary add-on)
bun run package      # → .web-ext-artifacts/*.zip  (AMO-ready zip)
```

## Project structure

```
src/
  background/         service worker + DNR rule generation
  popup/              toolbar popup (quick-add)
  options/            full rules manager (CRUD, search, import/export)
  blocked/            the brutalist-Anthropic block page
  lib/
    matcher.ts        pure URL ↔ rule matching
    rules.ts          CRUD + validation + JSON I/O
    storage.ts        typed browser.storage wrapper, sync→local fallback
    types.ts          BlockRule, MatchType
  manifest.json
tests/                Vitest unit tests
```

## Permissions

Bouncer requests the smallest set that lets it block any URL the user adds:

- `storage` — persists the rule list in `browser.storage.sync` (with a local fallback if sync is unavailable).
- `declarativeNetRequest` — installs the dynamic redirect rules that send matched URLs to the in-extension block page. Bouncer never inspects request bodies or response content.
- `webNavigation` — observes `onHistoryStateUpdated` so single-page apps (Reddit, Twitter, etc.) that route via `history.pushState` are caught. DNR cannot see those.
- `host_permissions: ["*://*/*"]` — DNR redirects to an extension URL require host access for the URL being redirected. Since Bouncer's promise is "block any site you list", the host permission cannot be narrowed at install time. Bouncer never reads page contents.

## Design notes

The in-extension surfaces share a single visual language: warm kraft (`#F0EEE6`) background, deep ink text, clay (`#CC785C`) accent, transitional serif headlines, monospace for patterns and URLs, and short, tracked-out sans labels for metadata. Light and dark themes follow `prefers-color-scheme`; motion respects `prefers-reduced-motion`. No external fonts or remote assets — the entire bundle is self-contained for fast loads and AMO-friendly review.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
