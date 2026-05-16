# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffold: Vite, TypeScript (strict), ESLint, Prettier, Vitest, web-ext.
- `BlockRule` types and a pure URL matcher supporting exact, domain, and wildcard match types, with 40 unit tests.
- Typed storage wrapper using `browser.storage.sync` with transparent fallback to `local` on quota errors, plus a change-subscription helper. 13 unit tests with a fake storage backend.
- MV3 manifest, background service worker, and placeholder popup/options/blocked HTML entrypoints. End-to-end build produces a loadable extension via web-ext.
- Rule engine that translates `BlockRule[]` into `declarativeNetRequest` dynamic rules: `requestDomains` for domain rules, `regexFilter` for exact/wildcard. Redirect target embeds the original URL and matched rule id. 12 unit tests.
- Block page: self-contained HTML/CSS/TS in Anthropic's kraft + clay palette with serif typography and a hairline-divided metadata grid. Reads the redirect target, re-matches against stored rules, and renders every rule that matched. Light/dark themes, `prefers-reduced-motion`, semantic landmarks, no external assets.
- Rule helpers: `createRule`, `updateRule`, `validatePattern`, `isDuplicate`, `filterRules`, and JSON serialise/deserialise with tolerant import (skip malformed entries, count them). 26 unit tests.
- Options page: full CRUD (add, edit-toggle, two-stage delete), substring search, JSON import (merge by `matchType::pattern` key, skip duplicates) and export. Surfaces a warning when the storage layer has fallen back to local.
- Popup: quick-add for the active tab. Auto-suggests a pattern based on match type (`hostname` for domain, full URL for exact, `*.host/*` for wildcard) and switches when the user changes type. 5 unit tests for the suggestion logic.
