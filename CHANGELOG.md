# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffold: Vite, TypeScript (strict), ESLint, Prettier, Vitest, web-ext.
- `BlockRule` types and a pure URL matcher supporting exact, domain, and wildcard match types, with 40 unit tests.
- Typed storage wrapper using `browser.storage.sync` with transparent fallback to `local` on quota errors, plus a change-subscription helper. 13 unit tests with a fake storage backend.
