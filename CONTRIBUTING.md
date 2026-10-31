# Contributing

Thank you for helping. A bug report with a small example is the most useful thing you can send. For a new feature, open an issue first. This package stays small on purpose.

## What belongs here

`entryMeta()` wraps a content loader and changes entries at build time, before the schema checks them. A change fits when:

- it works on one entry at a time, at build time
- it is opt-in, so existing sites do not change
- it needs no new dependency. The package has none today, only the `astro` peer dependency

## The files

| File                | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `src/index.ts`      | `entryMeta()`: git keywords, publishing rules, computed fields    |
| `src/git.ts`        | Git keyword dates and `gitInfo()`                                 |
| `src/text.ts`       | `readingTime()`, `wordCount()`, `excerpt()`                       |
| `src/index.test.ts` | All the tests                                                     |
| `README.md`         | Docs for users                                                    |
| `SKILL.md`          | The agent skill. Keep it in step with the README                  |
| `AGENTS.md`         | Guide for agents and contributors. `CLAUDE.md` is a symlink to it |

## Set up

You need:

- **Node 22.13 or newer.** pnpm 11 needs it, although the package itself runs on Node 20.19 and newer.
- **pnpm.** The `packageManager` field in `package.json` pins the version. pnpm switches to it by itself.
- **Bun.** It runs the tests.

```sh
pnpm install
pnpm run dev
```

`pnpm install` also sets up a git hook. Before each commit, it runs `vp check --fix` on the staged files.

| Command          | What it does                               |
| ---------------- | ------------------------------------------ |
| `pnpm run build` | Build the package into `dist/`             |
| `pnpm run dev`   | Rebuild when a file changes                |
| `pnpm run test`  | Run the tests with Bun                     |
| `pnpm run check` | Format, lint and type-check the whole repo |

## Before you open a pull request

1. Run `pnpm run check && pnpm run build && pnpm run test`. CI runs the same three.
2. Add or change a test in `src/index.test.ts`. The tests build a throwaway git repo with fixed dates. Never test against this repo's own history: CI clones only the latest commit.
3. Change the docs in the same pull request. Update `README.md` and `SKILL.md`. Update `AGENTS.md` if a rule changes.
4. If you change a dependency, run `pnpm install` and commit `pnpm-lock.yaml`. CI installs with `--frozen-lockfile`.
5. If you change how `entryMeta()` wraps the loader, try it in a real Astro build. The fake loader in the tests is not `glob()`.
   - Run `pnpm run build`. In a new folder, run `npm i astro /path/to/astro-entry-meta`.
   - Add a collection that uses `entryMeta(glob(...))`, and run `npx astro build`.
   - Set `draft: true` on a published entry and build again, without deleting `node_modules/.astro`. The entry must disappear.

## Commit messages

Releases are automatic. The version comes from your commit messages, which follow [Conventional Commits](https://www.conventionalcommits.org/).

| Message                                           | Release |
| ------------------------------------------------- | ------- |
| `fix: ...`                                        | patch   |
| `feat: ...`                                       | minor   |
| any message with a `BREAKING CHANGE:` footer      | major   |
| `docs: ...`, `chore: ...`, `ci: ...`, `test: ...` | none    |

`feat!:` is **not** enough for a major release. The release tool ignores the `!`, and the commit makes no release at all. Write the footer:

```text
feat: rename the preview option

BREAKING CHANGE: `preview` is now `drafts`.
```

Do not edit `version` in `package.json` or `CHANGELOG.md` by hand. The release writes both.

## Reporting a bug

Please include:

- the `astro-entry-meta` and Astro versions
- the loader you wrap (`glob()` or another)
- the frontmatter of the entry that goes wrong
- what you expected, and what happened

In `astro dev`, a stale date or an entry that should be gone can come from Astro's cache. Delete `node_modules/.astro` first, and try again.

## Releasing

Only the maintainer does this. A release runs in GitHub Actions, not on a laptop.

**Every release.** Open the repo on GitHub, then Actions, then **NPM Release**, then **Run workflow** on `main`. The workflow:

1. reads the commits since the last tag and picks the version
2. writes `CHANGELOG.md` and bumps `package.json`
3. commits `chore(release): x.y.z [skip ci]` and tags `vx.y.z`
4. publishes to npm with trusted publishing (OIDC). There is no `NPM_TOKEN`
5. creates the GitHub release

If no commit since the last tag is a `fix:` or a `feat:`, nothing is released.

The install goes through Aikido safe-chain. Two checkboxes on the manual run relax it:

- **skip_package_age:** allow packages newer than safe-chain's minimum age.
- **skip_safe_chain:** install without safe-chain. Use this only when its service is down.

**First release, one time only.**

1. Publish `0.0.0` by hand, so the package exists on npm: `pnpm run build && npm publish`.
2. Tell npm to trust the workflow: `npm trust github astro-entry-meta --repo mrmartineau/astro-entry-meta --file release.yml --allow-publish`.
3. Check that a `feat:` commit is on `main`. Then run the workflow. The version will be `1.0.0`.

**If a release fails.**

- _Push to `main` is refused:_ the bot cannot push the release commit. Allow GitHub Actions to push to `main`, or let it bypass the branch rules.
- _Auth error at publish:_ open the package settings on npmjs.com. The trusted publisher must say `mrmartineau/astro-entry-meta` and `release.yml`, exactly.
- _The install fails and safe-chain says "unexpected end of file":_ its service is down. Run the workflow again with `skip_safe_chain`.
