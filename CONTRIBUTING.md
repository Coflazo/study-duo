# Contributing to Study Duo

Thanks for helping. Study Duo has a few firm rules, and every change has to keep them:

- It works offline. Nothing is sent anywhere unless the user turns on a named connection.
- It costs nothing and needs no account.
- It asks for as few permissions as possible.
- It never records what someone types or reads. Signals are counts and timings only.

## Set up

You need Node.js 22 or newer.

```sh
git clone https://github.com/Coflazo/study-duo && cd study-duo && npm ci
npm run dev        # opens a browser with the extension, reloads on save
npm test           # unit tests
npm run typecheck  # TypeScript and Svelte checks
npm run test:e2e   # browser tests (needs Chrome for Testing locally, see tests/e2e/extension.ts)
```

## How work flows

1. Pick or open an issue. Each stage of the roadmap has one, grouped by milestone.
2. Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `docs/...`, `chore/...`.
3. Write the failing test first, then the code. Logic lives in `src/core` as plain functions so it can be tested without a browser.
4. Commit with [Conventional Commits](https://www.conventionalcommits.org): `feat(overlay): ...`, `fix(timer): ...`, `docs: ...`.
5. Open a pull request with the template filled in. CI (build, tests, browser test, secret scan, CodeQL) must be green.

## Design

The Figma file is the source of truth for the look: tokens come from it through `design/tokens.json` and `npm run tokens`. Do not edit `src/ui/tokens.css` by hand. The design direction and its rules are in `.impeccable/surfaces/`.

## Writing

User-facing text is short and plain. No em dashes, no filler words. Phase words live in `src/locales/en/phrases.json` and a test checks the rules.

## Security

Report security problems privately through the repository's Security tab. See [SECURITY.md](SECURITY.md).

By contributing you agree that your work is released under the [MIT license](LICENSE) and that you follow the [code of conduct](CODE_OF_CONDUCT.md).
