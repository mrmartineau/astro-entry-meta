# astro-entry-meta — agent & contributor guide

`CLAUDE.md` is a symlink to this file — edit one, both change.

Publishing rules, computed fields and git info for Astro content collections.
`entryMeta()` wraps a content loader (usually `glob()`) and, before the
collection schema validates an entry, (1) swaps `git Last Modified` /
`git Created` for commit dates, (2) drops drafts, future `publishDate` and
past `expiryDate` entries, and (3) adds `computed` fields. It grew out of
`astro-git-dates` (a superset of it) and borrows from Eleventy and Hugo.

The repo is a single npm package (`astro-entry-meta`): source in `src/`,
ESM-only output via tsdown. `pnpm-workspace.yaml` holds the vite catalog and
dependency build allowlist — don't remove it.

## Commands

Run everything from the repo root. pnpm for installs, Bun as the test runner.

```sh
pnpm install              # install deps
pnpm run build            # build the package (tsdown → dist/)
pnpm run dev              # rebuild package on change
pnpm run test             # bun test (src/*.test.ts)
pnpm run check            # vp check --fix (format + lint + typecheck, whole repo)
```

Before committing: `pnpm run check && pnpm run build && pnpm run test`.

## The package (`src/`)

- `index.ts`: `entryMeta()` and the re-exports. `git.ts`: git keywords and
  `gitInfo()`. `text.ts`: `readingTime`, `wordCount`, `excerpt`. Tests are
  co-located as `src/*.test.ts` (Bun test).
- `entryMeta()` is typed loosely on purpose (`T extends Pick<Loader, "name">`,
  returns `T`). A site and this package can hold different Astro copies, and
  TypeScript gives up ("excessive stack depth") comparing two full `Loader`
  types. Don't tighten it to `(loader: Loader): Loader`.
- **How a hidden entry works.** `glob()` calls `parseData` and then
  `store.set`. `parseData` cannot drop an entry, so it records the id in a
  set, and the wrapped store's `set` deletes that id instead of storing it.
  The delete matters: `glob()` never removes an entry it still sees, so an
  entry stored by an earlier run (the dev cache) would stay. The store is
  wrapped in a `Proxy`, not spread, because the real store has `#private`
  fields. The test's `FakeStore` has one too, to keep that honest.
- `parseData` is not given the body. `computed` reads the file itself and
  strips the `---` frontmatter block.
- `parseData` works on a copy of the data: `glob()` hands the original to its
  Markdown renderer, and git info would bloat the stored render metadata.
- `git` runs in the file's own folder (`cwd: dirname(filePath)`), so relative
  and absolute paths both work, in any repo.
- Tests build a throwaway git repo in a temp folder with fixed commit dates.
  CI clones shallow, so never test against this repo's own history.
- Last checked against a real Astro 7 build (`glob()` loader, two builds with
  the cache kept). If you change the wrapper, repeat that: the fake loader in
  the tests is not the real `glob()`.
- TypeScript config in `tsconfig.json`; lint/format/typecheck via Vite+
  (`vp check`), configured in root `vite.config.ts`.
- Releases prepend notes to `CHANGELOG.md` (via `@semantic-release/changelog`).

## CI & deployment (`.github/workflows/`)

- `build-test.yml` — every PR/push to main: `vp check`, package build, bun
  tests.
- `release.yml` — manual dispatch: semantic-release publishes the package to
  npm. Version comes from conventional commits (`fix:` patch, `feat:` minor,
  a `BREAKING CHANGE:` footer major). `feat!:` alone releases nothing: the
  default angular preset ignores the `!`. npm auth is trusted publishing
  (OIDC), so there is no `NPM_TOKEN` secret. The first release needs manual
  steps: see "Releasing" in `CONTRIBUTING.md`. The install goes
  through Aikido safe-chain. Two checkboxes on the manual run relax it:
  `skip_package_age` allows packages newer than safe-chain's minimum age, and
  `skip_safe_chain` installs without safe-chain (only when its service is
  down).
- `security.yml` — Aikido safe-chain supply-chain scan on every branch.

CI installs with `--frozen-lockfile`: if you change any `package.json`, run
`pnpm install` and commit the updated `pnpm-lock.yaml`.

## Gotchas

- **Vite+ tooling**: `vp config` (root `prepare` script) sets
  `core.hooksPath` to `.vite-hooks/_`; the `pre-commit` hook runs `vp staged`,
  which runs `vp check --fix` on staged files (see `staged` in
  `vite.config.ts`). If hooks misbehave, `git config --unset core.hooksPath`
  and rerun `pnpm exec vp config`.
- **Changelog**: semantic-release prepends release notes to `CHANGELOG.md` —
  don't delete it.
- **semantic-release** commits the version bump back to `main` with
  `[skip ci]` — don't hand-edit `version` in root `package.json`.

## Agent skill

`SKILL.md` teaches coding agents to set the package up in an Astro site
(`npx skills add mrmartineau/astro-entry-meta`). Keep it in step with the
README when the API changes.
