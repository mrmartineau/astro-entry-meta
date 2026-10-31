import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Loader, LoaderContext } from "astro/loaders";
import { entryMeta, excerpt, gitInfo, readingTime, wordCount } from "./index.js";

type Entry = { id: string; data: Record<string, unknown> };

// Has a private field on purpose: the real store does too, and a copy of it would break
class FakeStore {
  #entries = new Map<string, Entry>();
  set(entry: Entry) {
    this.#entries.set(entry.id, entry);
    return true;
  }
  delete(id: string) {
    this.#entries.delete(id);
  }
  keys() {
    return [...this.#entries.keys()];
  }
  get(id: string) {
    return this.#entries.get(id);
  }
}

// Hands each entry to parseData and then to store.set, like glob() does
function fakeGlob(entries: (Entry & { filePath?: string })[]): Loader {
  return {
    name: "fake",
    load: async (context) => {
      for (const { id, data, filePath } of entries) {
        context.store.set({ id, data: await context.parseData({ id, data, filePath }) });
      }
    },
  };
}

async function run(loader: Loader, store = new FakeStore()) {
  const context = {
    store,
    parseData: async ({ data }: { data: unknown }) => data,
    logger: { warn() {}, debug() {} },
  } as unknown as LoaderContext;
  await loader.load(context);
  return store;
}

const repo = mkdtempSync(join(tmpdir(), "astro-entry-meta-"));
const git = (args: string[], date = "", author = "Test") =>
  execFileSync("git", args, {
    cwd: repo,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: author,
      GIT_COMMITTER_NAME: author,
    },
  });

describe("publishing", () => {
  const now = new Date("2025-01-01T00:00:00Z");
  const entries: Entry[] = [
    { id: "plain", data: {} },
    { id: "draft", data: { draft: true } },
    { id: "scheduled", data: { publishDate: new Date("2025-06-01") } },
    { id: "expired", data: { expiryDate: "2024-12-31" } },
    { id: "live", data: { publishDate: "2024-01-01", expiryDate: "2025-06-01" } },
    { id: "typo", data: { publishDate: "garbage" } },
  ];

  test("leaves out drafts, scheduled, expired and unreadable dates", async () => {
    const store = await run(entryMeta(fakeGlob(entries), { now }));
    expect(store.keys()).toEqual(["plain", "live"]);
  });

  test("preview keeps them all", async () => {
    const store = await run(entryMeta(fakeGlob(entries), { now, preview: true }));
    expect(store.keys()).toHaveLength(entries.length);
  });

  test("deletes an entry stored on an earlier run", async () => {
    const store = new FakeStore();
    store.set({ id: "draft", data: {} });
    await run(entryMeta(fakeGlob(entries), { now }), store);
    expect(store.get("draft")).toBeUndefined();
  });
});

describe("computed", () => {
  test("gets the body without frontmatter, and frontmatter wins", async () => {
    const filePath = join(repo, "post.md");
    writeFileSync(
      filePath,
      `---\ntitle: Post\nsecret: lots of words here\n---\n${"word ".repeat(450)}`,
    );
    const loader = entryMeta(
      fakeGlob([
        { id: "a", filePath, data: { title: "Post" } },
        { id: "b", filePath, data: { title: "Post", minutes: 99 } },
      ]),
      {
        computed: {
          words: ({ body }) => wordCount(body),
          minutes: ({ body }) => readingTime(body),
        },
      },
    );
    const store = await run(loader);
    expect(store.get("a")?.data).toEqual({ title: "Post", words: 450, minutes: 3 });
    expect(store.get("b")?.data.minutes).toBe(99);
  });
});

describe("git", () => {
  mkdirSync(join(repo, "docs"));
  const filePath = join(repo, "docs", "note.md");
  git(["init", "-q"]);
  git(["config", "user.email", "test@example.com"]);
  writeFileSync(filePath, "one");
  git(["add", "."]);
  git(["commit", "-qm", "add note"], "2020-01-01T00:00:00Z", "Ann");
  writeFileSync(filePath, "two");
  git(["commit", "-qam", "edit note"], "2024-06-01T00:00:00Z", "Bo");

  test("swaps keywords for commit dates", async () => {
    const loader = entryMeta(
      fakeGlob([{ id: "n", filePath, data: { date: "git Last Modified", made: "git Created" } }]),
    );
    const { data } = (await run(loader)).get("n") as Entry;
    expect(data.date).toEqual(new Date("2024-06-01T00:00:00Z"));
    expect(data.made).toEqual(new Date("2020-01-01T00:00:00Z"));
  });

  test("gitInfo reads the last commit, the history and the edit link", () => {
    const info = gitInfo(filePath, { editUrl: "https://example.com/edit/main/", historyLimit: 1 });
    expect(info.author).toBe("Bo");
    expect(info.message).toBe("edit note");
    expect(info.hash).toHaveLength(40);
    expect(info.created).toEqual(new Date("2020-01-01T00:00:00Z"));
    expect(info.lastModified).toEqual(new Date("2024-06-01T00:00:00Z"));
    expect(info.history).toHaveLength(1);
    expect(info.editUrl).toBe("https://example.com/edit/main/docs/note.md");
  });

  test("gitInfo on a file that is not committed yet", () => {
    const fresh = join(repo, "docs", "fresh.md");
    writeFileSync(fresh, "new");
    const info = gitInfo(fresh);
    expect(info.history).toEqual([]);
    expect(info.author).toBe("");
  });
});

test("text helpers", () => {
  const body =
    "# Title\n\nSome **bold** words and a [link](https://x.y).\n\n```js\nignored(code)\n```\n";
  expect(wordCount(body)).toBe(7);
  expect(readingTime("")).toBe(1);
  expect(excerpt("a ".repeat(100), 10)).toBe("a a a a a…");
});
