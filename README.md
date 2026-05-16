# Bouncer

A strict, no-bypass website blocker for Firefox.

Bouncer redirects matched URLs to a calm in-extension block page. There is no snooze, no temporary disable, no "unblock anyway" link — once a rule is in place, the only way past it is to delete the rule yourself.

## Status

Early development. Not yet published to AMO.

## Install (developer)

```sh
npm install
npm run build
npm run start:firefox
```

This opens a Firefox instance with Bouncer loaded. Alternatively, load `dist/` manually via `about:debugging` → **This Firefox** → **Load Temporary Add-on**.

## Develop

```sh
npm run dev          # Vite in watch mode
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest
```

## Build

```sh
npm run build        # → dist/
npm run package      # → .web-ext-artifacts/*.zip
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
