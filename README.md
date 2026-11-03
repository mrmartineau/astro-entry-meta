# astro-entry-meta

Publishing rules, computed fields and git info for Astro content collections. Drafts, scheduled posts, reading time, last author. It brings ideas from [Eleventy](https://www.11ty.dev/docs/dates/) and [Hugo](https://gohugo.io/content-management/front-matter/) to Astro.

One wrapper around a collection's loader does three jobs. Each one is opt-in.

**1. Git dates.** Write this in an entry's frontmatter:

```yaml
---
title: Array methods summarised
date: git Last Modified
---
```

At build time the value becomes the date of the file's last commit. This is the feature of [`astro-git-dates`](https://github.com/mrmartineau/astro-git-dates), included here.

**2. Publishing rules.** Entries with `draft: true`, a `publishDate` in the future or an `expiryDate` in the past are left out of the collection.

```yaml
---
title: Coming soon
publishDate: 2026-12-01
---
```

**3. Computed fields.** Add fields to every entry from its body or its git history: reading time, word count, excerpt, last author, "edit this page" link.

## Install

```sh
pnpm add astro-entry-meta
```

Needs Astro 5 or later and collections that use a [content loader](https://docs.astro.build/en/guides/content-collections/#built-in-loaders) such as `glob()`.

## Usage

Wrap the loader of each collection that should use it. One call per collection.

```ts
// src/content.config.ts (or src/content/config.ts)
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { entryMeta, gitInfo, readingTime, type GitInfo } from "astro-entry-meta";

const blog = defineCollection({
  loader: entryMeta(glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }), {
    // Show drafts and scheduled posts in `astro dev`
    preview: import.meta.env.DEV,
    computed: {
      readingTime: ({ body }) => readingTime(body),
      git: ({ filePath }) =>
        filePath && gitInfo(filePath, { editUrl: "https://github.com/me/site/edit/main/" }),
    },
  }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    // Computed fields must be in the schema, or the schema removes them
    readingTime: z.number(),
    git: z.custom<GitInfo>().optional(),
  }),
});

export const collections = { blog };
```

Nothing else changes. `getCollection("blog")` now gives only published entries, and each one has `readingTime` and `git`.

## Git dates

Any top-level frontmatter field set to one of two keywords becomes a git date before the schema validates it:

| Frontmatter value   | Becomes                                                  |
| ------------------- | -------------------------------------------------------- |
| `git Last Modified` | Date of the last commit that changed the file            |
| `git Created`       | Date of the commit that added the file (follows renames) |

```yaml
---
title: My post
date: git Created
modified: git Last Modified
---
```

Entries with a normal date are left alone, so you can switch entries over one at a time. The schema stays `z.date()`.

The functions behind the keywords are exported, for files outside a collection:

```ts
import { gitCreated, gitLastModified } from "astro-entry-meta";

gitLastModified("src/pages/about.mdx"); // Date
gitCreated("src/pages/about.mdx"); // Date
```

## Publishing rules

| Frontmatter           | The entry is left out when |
| --------------------- | -------------------------- |
| `draft: true`         | always                     |
| `publishDate: <date>` | the date is in the future  |
| `expiryDate: <date>`  | the date has passed        |

Left-out entries are gone from `getCollection()`, so they are also gone from your pages, RSS feeds and sitemap. They are not validated, so a draft can be unfinished.

A `publishDate` or `expiryDate` that is not a date also leaves the entry out, with a warning. A typo must not publish a post early.

Options:

- `preview: true` keeps every entry. Use `preview: import.meta.env.DEV` to see drafts in dev.
- `now: new Date(...)` sets the time the dates are compared with. The default is the time of the build.

## Computed fields

`computed` maps a field name to a function. The function gets the entry and returns the value:

```ts
computed: {
  words: ({ body }) => wordCount(body),
  summary: ({ body }) => excerpt(body, 200),
  section: ({ id }) => id.split("/")[0],
}
```

The function gets `{ id, data, body, filePath }`:

- `data` is the frontmatter, after git keywords became dates.
- `body` is the file without its frontmatter.
- `filePath` is the absolute path. It is `undefined` for entries that have no file.

A value set in the entry's frontmatter wins over the computed one. Write `summary: "My own text"` to override the excerpt for one post.

Helpers you can use inside `computed`:

| Function                  | Returns                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| `readingTime(body, wpm?)` | Minutes to read, rounded up, at least 1. Default 200 words a minute   |
| `wordCount(body)`         | Words in the body. Code blocks do not count                           |
| `excerpt(body, max?)`     | Opening prose without Markdown, cut on a word. Default 155 characters |

### Git info

`gitInfo(filePath, options?)` reads everything git knows about a file with one `git log`:

```ts
{
  created: Date,       // the commit that added the file
  lastModified: Date,  // the last commit
  hash: string,        // last commit
  author: string,      // last commit
  message: string,     // last commit, subject line
  history: { hash, author, date, message }[], // newest first
  editUrl?: string,    // only with the editUrl option
}
```

Options:

- `editUrl`: the start of an edit link, such as `https://github.com/me/site/edit/main/`. The file's path in the repo is added to it.
- `historyLimit`: how many commits `history` keeps. Default 10.

A file that is not committed yet has empty `hash`, `author` and `message`, an empty `history`, and the current time for both dates.

Type the field with `z.custom<GitInfo>()`.

## Good to know

- **Declare computed fields in the schema.** A field the schema does not know is removed. A missing `readingTime` means a missing line in the schema.
- **CI needs the full git history.** Most CI clones only the latest commit, so every file would get the same date and `history` would have one commit. On GitHub Actions:

  ```yaml
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0
  ```

- **A scheduled post needs a new build.** A static site only changes when it is built. Rebuild on a schedule, for example a daily cron in your deploy workflow, so a post appears on its `publishDate`.
- **Files not committed yet** get the current time for git dates.
- **Bulk commits count.** If one commit touches every file (a reformat, a move), every `git Last Modified` entry gets that date. That is why git dates are opt-in per entry.
- **Other tools that read your files** (search indexers, feed scripts) see the raw frontmatter: the `git Last Modified` text, drafts and all. They do not see computed fields.
- **Dev cache.** Astro skips parsing files whose content has not changed. In `astro dev`, an entry that was published stays published after its `expiryDate`, and a git date can stay old, until the file changes or you delete `node_modules/.astro`. Builds in CI start clean.
- **Moving from `type: 'content'` collections:** the `glob()` loader gives entries an `id` instead of a `slug`, and you render with `render(entry)` from `astro:content` instead of `entry.render()`. Files and folders starting with `_` are no longer skipped for you; add `'!**/_*'` and `'!**/_*/**'` to the glob pattern to keep that.

## Moving from astro-git-dates

Change the import and the function name. Everything else works the same.

```diff
- import { gitDates } from "astro-git-dates";
+ import { entryMeta } from "astro-entry-meta";

- loader: gitDates(glob({ ... })),
+ loader: entryMeta(glob({ ... })),
```

## How it works

`entryMeta()` wraps the loader's `parseData`. For each entry, it:

1. replaces any top-level field set to a git keyword with the date from `git log`;
2. checks `draft`, `publishDate` and `expiryDate`. A hidden entry skips the rest and is dropped when the loader tries to store it. If an earlier build stored it, it is deleted from the store;
3. adds the `computed` fields that frontmatter does not set. It reads the file again for the `body`;
4. hands the data on to the normal schema validation.

It runs `git` only for entries that use a git keyword or `gitInfo`.

## Agent skill

The repo ships a skill (`SKILL.md`) that teaches coding agents how to set this package up. Install it with [`npx skills`](https://github.com/vercel-labs/skills):

```sh
npx skills add mrmartineau/astro-entry-meta
```

## Development

```sh
pnpm install
pnpm run build        # tsdown → dist/
pnpm run test         # bun test
pnpm run check        # vp check --fix (format, lint, types)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute and how a release works. Releases run from the **NPM Release** workflow in the Actions tab. Versions follow [conventional commits](https://www.conventionalcommits.org/): `fix:` patch, `feat:` minor, a `BREAKING CHANGE:` footer major.

## More Astro packages

Other Astro tools I have made:

- [astro-d1-search](https://github.com/mrmartineau/astro-d1-search): site search for Astro backed by Cloudflare D1
- [astro-d1-reactions](https://github.com/mrmartineau/astro-d1-reactions): page reactions, unique reads and reader highlights, kept in Cloudflare D1
- [zed-astro-starter](https://github.com/mrmartineau/zed-astro-starter): an opinionated Astro starter, ready to deploy to Cloudflare Workers
- [ZUI](https://github.com/mrmartineau/zui): a CSS-first UI library with Astro (and React, Solid, Svelte, Vue) components

## License

[ISC](https://choosealicense.com/licenses/isc/) © [Zander Martineau](https://zander.wtf)
