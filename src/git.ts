import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";

/** Frontmatter value that becomes the date of the file's last commit. */
export const GIT_LAST_MODIFIED = "git Last Modified";
/** Frontmatter value that becomes the date of the commit that added the file. */
export const GIT_CREATED = "git Created";

export interface GitCommit {
  hash: string;
  author: string;
  date: Date;
  message: string;
}

export interface GitInfo {
  /** Date of the commit that added the file. */
  created: Date;
  /** Date of the last commit that changed the file. */
  lastModified: Date;
  /** Hash of the last commit. Empty if the file is not committed yet. */
  hash: string;
  /** Author of the last commit. Empty if the file is not committed yet. */
  author: string;
  /** Subject line of the last commit. Empty if the file is not committed yet. */
  message: string;
  /** Commits that changed the file, newest first. */
  history: GitCommit[];
  /** `editUrl` plus the file's path in the repo. Only set when you pass `editUrl`. */
  editUrl?: string;
}

export interface GitInfoOptions {
  /** Start of an "edit this page" link, such as `https://github.com/me/site/edit/main/`. */
  editUrl?: string;
  /** How many commits to keep in `history`. Default 10. */
  historyLimit?: number;
}

// Runs in the file's own folder, so it works for any path and any repo
function git(args: string[], filePath: string): string {
  return execFileSync("git", [...args, "--", basename(filePath)], {
    cwd: dirname(filePath),
    encoding: "utf8",
  }).trim();
}

/** Date of the file's last commit. A file not committed yet is being edited now. */
export function gitLastModified(filePath: string): Date {
  const iso = git(["log", "-1", "--format=%cI"], filePath);
  return iso ? new Date(iso) : new Date();
}

/** Date of the commit that added the file, following renames. */
export function gitCreated(filePath: string): Date {
  // Oldest commit is listed last
  const iso = git(["log", "--diff-filter=A", "--follow", "--format=%cI"], filePath)
    .split("\n")
    .at(-1);
  return iso ? new Date(iso) : new Date();
}

/** Resolvers for the frontmatter keywords. */
export const keywords: Record<string, (filePath: string) => Date> = {
  [GIT_LAST_MODIFIED]: gitLastModified,
  [GIT_CREATED]: gitCreated,
};

/** Everything git knows about one file, in one `git log`. */
export function gitInfo(filePath: string, options: GitInfoOptions = {}): GitInfo {
  const { editUrl, historyLimit = 10 } = options;
  // \x1f (unit separator) cannot appear in a name or a subject line
  const log = git(["log", "--follow", "--format=%H%x1f%an%x1f%cI%x1f%s"], filePath);
  const commits = log
    ? log.split("\n").map((line): GitCommit => {
        const [hash = "", author = "", date = "", message = ""] = line.split("\x1f");
        return { hash, author, date: new Date(date), message };
      })
    : [];
  const [last] = commits;
  const info: GitInfo = {
    created: commits.at(-1)?.date ?? new Date(),
    lastModified: last?.date ?? new Date(),
    hash: last?.hash ?? "",
    author: last?.author ?? "",
    message: last?.message ?? "",
    history: commits.slice(0, historyLimit),
  };
  if (editUrl) {
    // The folder's path inside the repo, such as `src/content/blog/`
    const prefix = execFileSync("git", ["rev-parse", "--show-prefix"], {
      cwd: dirname(filePath),
      encoding: "utf8",
    }).trim();
    info.editUrl = `${editUrl}${prefix}${basename(filePath)}`;
  }
  return info;
}
