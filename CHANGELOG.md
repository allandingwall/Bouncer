# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffold: Vite, TypeScript (strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), ESLint, Prettier, Vitest, web-ext.
- `BlockRule` types and a pure URL matcher supporting exact, domain, and wildcard match types. Wildcard uses a two-pointer linear glob (no regex backtracking), and extension/browser-internal URLs are unconditionally non-matchable.
- Typed storage wrapper using `browser.storage.sync` with transparent fallback to `local` on quota errors, plus a change-subscription helper and shape-sanitising reads.
- MV3 manifest with strict CSP (`script-src 'self'; object-src 'self'; base-uri 'none'; form-action 'none'`), Gecko `strict_min_version: 121.0`, and a self-contained SVG saltire icon used by both the toolbar action and the high-DPI icon set.
- Background service worker that translates `BlockRule[]` into `declarativeNetRequest` dynamic rules (all match types compile to `regexFilter` so `regexSubstitution` can carry the original URL into the redirect target via a fragment) and applies them idempotently on install / startup / storage change. SPA-aware: a `webNavigation.onHistoryStateUpdated` guard catches `pushState` / `replaceState` transitions that DNR cannot see, held behind a `ready` promise so a cold-started SW never handles an event with an empty rule cache.
- Block page: self-contained HTML/CSS/TS in a warm kraft + clay palette with serif headlines, hairline-divided metadata grid, and a rotating headline + lede pool. Reads the original URL from `location.hash` (fragments survive `&`, `?`, `#` round-trips), re-matches against stored rules, and renders every rule that matched. Light/dark themes, `prefers-reduced-motion`, semantic landmarks, no external assets, no bypass affordance.
- Rule helpers: `createRule`, `updateRule`, `validatePattern`, `validateGroup`, `isDuplicate`, `filterRules`, `groupsOf`, and tolerant JSON serialise/deserialise with a top-level `group` default for blocklist templates.
- Options page: full CRUD with two-stage delete confirms (per rule, per group, and bulk), substring search, JSON import (merge by `matchType::pattern` key, skip duplicates) and export, master-switch toggle, per-group tri-state enable switch, inline move-to-group `<select>`, and an "Enable all" affordance that only appears when something is disabled.
- Popup: quick-add for the active tab with state-driven border + wordmark colour, group input autocompleted from existing groups, and a hidden form on pages where blocking is not available.
- Adversarial-input security tests: ReDoS-bounded matching, XSS-safe redirect round-trip, hostile-scheme rejection at validation / parse / DNR layers, and "the extension cannot block its own UI" coverage across multiple defence-in-depth layers.
- GitHub Actions CI: lint, format check, typecheck, test, build, and `web-ext lint` on every PR and push to main. Uploads the built `dist/` as an artifact for inspection.
- README with install / develop / build instructions, permission justifications, project structure, and design notes. CONTRIBUTING.md covering tooling, workflow, conventions, and the block-page philosophy. Issue templates (bug + feature) and a PR template.
