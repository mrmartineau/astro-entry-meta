---
name: astro-entry-meta
description: "Add drafts, scheduled posts, git dates, reading time and git info to Astro content collections with the astro-entry-meta package: wrap a collection's loader with entryMeta() to hide draft/publishDate/expiryDate entries, turn `date: git Last Modified` into a commit date, and add computed fields such as readingTime, wordCount, excerpt, last author and an edit link. Use when asked for drafts, scheduled or future-dated posts, expiring content, git dates, reading time, last-updated-by, or 'edit this page' links in an Astro site, to port Eleventy or Hugo front matter behaviour to Astro, or to work with an existing astro-entry-meta setup."
---

# astro-entry-meta

`entryMeta()` wraps an Astro content loader (usually `glob()`). Before the
collection schema validates an entry, it does three things:

1. **Git dates.** A top-level frontmatter field set to `git Last Modified` or
   `git Created` becomes that commit date.
2. **Publishing rules.** An entry with `draft: true`, a future `publishDate`
   or a past `expiryDate` is left out of the collection.
3. **Computed fields.** Fields from the `computed` option are added to every
   entry. A value in frontmatter wins.

## Setup

1. Install: `pnpm add astro-entry-meta` (or the project's package manager).
2. Each collection must use a content loader, normally `glob()` from
   `astro/loaders`. Old `type: 'content'` collections cannot use it.
3. Wrap the loader and declare every computed field in the schema:

   ```ts
   // src/content.config.ts (or src/content/config.ts)
   import { defineCollection, z } from "astro:content";
   import { glob } from "astro/loaders";
   import { entryMeta, gitInfo, readingTime, type GitInfo } from "astro-entry-meta";

   const blog = defineCollection({
     loader: entryMeta(glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }), {
       preview: import.meta.env.DEV, // drafts and scheduled posts show in dev
       computed: {
         readingTime: ({ body }) => readingTime(body),
         git: ({ filePath }) =>
           filePath && gitInfo(filePath, { editUrl: "https://github.com/me/site/edit/main/" }),
       },
     }),
     schema: z.object({
       title: z.string(),
       date: z.date(),
       readingTime: z.number(),
       git: z.custom<GitInfo>().optional(),
     }),
   });
   ```

## Options

- `preview: boolean`. Keep drafts, scheduled and expired entries. Default `false`.
- `now: Date`. Time to compare `publishDate` and `expiryDate` with. Default: the build time.
- `computed: Record<string, (entry) => unknown>`. The function gets `{ id, data, body, filePath }`
  and may be async. `body` is the file without frontmatter. `filePath` can be `undefined`.

Helpers: `readingTime(body, wpm = 200)`, `wordCount(body)`, `excerpt(body, max = 155)`,
`gitInfo(filePath, { editUrl, historyLimit = 10 })`, `gitLastModified(filePath)`, `gitCreated(filePath)`.

`gitInfo` returns `{ created, lastModified, hash, author, message, history, editUrl? }`.

## Gotchas

- A computed field missing from the schema is removed by the schema. If a field is `undefined`, check the schema first.
- CI needs the full git history: `actions/checkout` with `fetch-depth: 0`.
- A scheduled post only appears when the site is rebuilt after its `publishDate`. Suggest a cron in the deploy workflow.
- Hidden entries are not validated. A `publishDate` that is not a date hides the entry and logs a warning.
- Search indexers and scripts that read the files directly still see drafts and raw `git ...` text.
- Dev cache: `astro dev` skips unchanged files, so a stale date or an entry past its `expiryDate` stays until the file changes or `node_modules/.astro` is deleted.
- Replacing `astro-git-dates`: change `gitDates(` to `entryMeta(` and the import. Nothing else changes.
