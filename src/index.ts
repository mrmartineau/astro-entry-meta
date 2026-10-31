import { readFileSync } from "node:fs";
import type { Loader, LoaderContext } from "astro/loaders";
import { keywords } from "./git.js";

export {
  GIT_CREATED,
  GIT_LAST_MODIFIED,
  type GitCommit,
  type GitInfo,
  type GitInfoOptions,
  gitCreated,
  gitInfo,
  gitLastModified,
} from "./git.js";
export { excerpt, readingTime, wordCount } from "./text.js";

/** What a `computed` function gets to work with. */
export interface EntryContext {
  id: string;
  /** Frontmatter, after git keywords are swapped for dates. */
  data: Record<string, unknown>;
  /** The file's content without the frontmatter. Empty if the entry has no file. */
  body: string;
  filePath: string | undefined;
}

export interface EntryMetaOptions {
  /**
   * Keep drafts, scheduled and expired entries. Use it in dev:
   * `preview: import.meta.env.DEV`.
   */
  preview?: boolean;
  /** The time `publishDate` and `expiryDate` are compared with. Default: now. */
  now?: Date;
  /**
   * Fields to add to every entry, each computed from the entry. A value set in
   * frontmatter wins. Declare each field in the collection schema, or the
   * schema removes it.
   */
  computed?: Record<string, (entry: EntryContext) => unknown>;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

const time = (value: unknown) =>
  value === undefined ? undefined : new Date(value as string | number | Date).getTime();

/** Why an entry is left out of the collection, if it is. */
function hiddenStatus(data: Record<string, unknown>, now: number) {
  if (data.draft === true) return "draft";
  const start = time(data.publishDate);
  const end = time(data.expiryDate);
  // A typo must not publish a scheduled post early
  if (Number.isNaN(start) || Number.isNaN(end)) return "invalid";
  if (start !== undefined && start > now) return "scheduled";
  if (end !== undefined && end <= now) return "expired";
}

/**
 * Wrap a content loader (usually `glob()`) to:
 *
 * - swap `git Last Modified` and `git Created` in frontmatter for commit dates;
 * - leave out entries that have `draft: true`, a `publishDate` in the future or
 *   an `expiryDate` in the past;
 * - add the fields from `computed`.
 *
 * All of it happens before the collection schema validates the entry.
 */
export function entryMeta<T extends Pick<Loader, "name">>(
  loader: T,
  options: EntryMetaOptions = {},
): T {
  // Typed loosely on purpose: the site's copy of Astro and ours may differ, and
  // TypeScript gives up comparing two copies of the full Loader type
  const inner = loader as unknown as Loader;
  const computed = Object.entries(options.computed ?? {});
  return {
    ...loader,
    load: (context: LoaderContext) => {
      const now = (options.now ?? new Date()).getTime();
      // Ids of entries parseData has hidden, until the loader tries to store them
      const hidden = new Set<string>();

      // glob() skips the entries it is not told about, so a hidden entry that
      // was stored on an earlier run must be deleted here. The Proxy keeps the
      // store's private fields working, which a spread copy would lose.
      const store = new Proxy(context.store, {
        get(target, prop) {
          if (prop === "set") {
            return (entry: { id: string }) => {
              if (!hidden.delete(entry.id)) return target.set(entry as never);
              target.delete(entry.id);
              return false;
            };
          }
          const value = Reflect.get(target, prop, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });

      return inner.load({
        ...context,
        store,
        parseData: async (props) => {
          const { id, filePath } = props;
          // A copy: the loader hands the original to its Markdown renderer
          const data = { ...props.data } as Record<string, unknown>;

          if (filePath) {
            for (const [key, value] of Object.entries(data)) {
              const resolve = typeof value === "string" ? keywords[value] : undefined;
              if (resolve) data[key] = resolve(filePath);
            }
          }

          if (!options.preview) {
            const status = hiddenStatus(data, now);
            if (status === "invalid") {
              context.logger.warn(
                `${id}: publishDate or expiryDate is not a date. Entry left out.`,
              );
            }
            if (status) {
              hidden.add(id);
              // Not validated: a draft may not be finished
              return props.data;
            }
          }

          if (computed.length) {
            const body = filePath ? readFileSync(filePath, "utf8").replace(FRONTMATTER, "") : "";
            for (const [key, compute] of computed) {
              if (data[key] === undefined) data[key] = await compute({ id, data, body, filePath });
            }
          }

          return context.parseData({ ...props, data: data as typeof props.data });
        },
      });
    },
  } as T;
}
