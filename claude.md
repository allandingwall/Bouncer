Build an open-source Firefox extension that blocks websites based on user-supplied URLs. Aim for professional, production-quality code suitable for publishing to AMO (addons.mozilla.org).

## Core functionality

- Users add block rules via popup or options page
- Each rule has a user-selectable match type:
  1. **Exact URL** — matches only the exact string
  2. **Domain** — matches the domain and all subdomains
  3. **Wildcard pattern** — e.g. `*.reddit.com/r/*`
- Visiting a matched URL redirects to a custom in-extension block page
- Blocks are strict: no snooze, temporary disable, or bypass
- Rules persist via `browser.storage.sync` (fallback to `local`)

## UI surfaces

- **Popup** — quick-add current tab with match-type selector; link to options
- **Options page** — full CRUD: add, edit, delete, search, enable/disable per rule, import/export as JSON
- **Block page** — see dedicated spec below

## Block page (design this thoughtfully)

A well-designed, hand-crafted HTML page — not a placeholder. Treat it as a real piece of UI design.

- Clean, modern, calm aesthetic — this page should feel intentional, not punitive. Think "gentle redirect" rather than "access denied error"
- Responsive, accessible (semantic HTML, sufficient contrast, keyboard-navigable, respects `prefers-reduced-motion` and `prefers-color-scheme`)
- Light and dark themes
- Custom typography (system font stack is fine, but consider hierarchy and rhythm)
- Shows: the blocked URL, the rule that matched (and its type), and a short message
- No bypass button, no "unblock anyway" link — strict means strict
- Self-contained: no external fonts, scripts, or assets (CSP-friendly, fast load)
- Propose the visual direction (colour palette, typography, layout) before implementing and iterate if needed

## Technical requirements

- **Manifest V3**
- **TypeScript**, strict mode
- Use `declarativeNetRequest` for redirects where possible; only fall back to `webRequest` if necessary
- Build with Vite (or equivalent), output loadable via `web-ext`
- **ESLint + Prettier** configured
- **Vitest** unit tests covering URL-matching logic and storage layer
- **GitHub Actions** CI: lint, typecheck, test, build on every PR
- **MIT license**; README with install / develop / build / contribute instructions; CONTRIBUTING.md; issue + PR templates

## Git workflow (use throughout)

- Initialise a git repo at the start with a sensible `.gitignore` (node_modules, dist, .env, OS files, editor configs)
- Commit in small, logical units — one concern per commit, not a single mega-commit at the end
- Use **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `build:`, `ci:`) with clear, present-tense subject lines
- Stage deliberately (`git add -p` style thinking) — don't blanket `git add .` if it would mix unrelated changes
- Commit after each meaningful milestone: project scaffold, matcher logic, storage layer, each UI surface, block page, tests, CI config, docs
- Keep the working tree clean — never commit build artifacts, lockfile noise from unrelated installs, or debug code
- Write a proper README and CHANGELOG as you go, not retroactively
- Don't push or set up remotes — the user will connect to GitHub themselves

## Suggested structure

- `src/background/` — service worker, rule application
- `src/popup/`, `src/options/`, `src/blocked/` — UI surfaces (vanilla TS or a lightweight framework — justify the choice)
- `src/lib/matcher.ts` — pure functions for matching a URL against a rule (heavily tested)
- `src/lib/storage.ts` — typed wrapper around `browser.storage`

## Deliverables

- Loadable in Firefox via `about:debugging`
- Passing test suite and CI
- Clean git history with meaningful commits
- Clear, complete README

## Before writing code

Ask clarifying questions about: extension name, UI framework choice, block page visual direction, and any ambiguous behaviour (e.g. how to handle conflicting rules). Then propose the project structure and a brief implementation plan and wait for approval before implementing.
