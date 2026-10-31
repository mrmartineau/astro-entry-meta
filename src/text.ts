/** The body as plain words: no code blocks, HTML, images or Markdown marks. */
export function plainText(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/<[^>]+>/g, " ") // inline HTML and MDX tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "") // heading, quote, list markers
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Number of words in the body. Code blocks do not count. */
export function wordCount(body: string): number {
  const text = plainText(body);
  return text ? text.split(" ").length : 0;
}

/** Minutes to read the body, rounded up, never less than 1. */
export function readingTime(body: string, wordsPerMinute = 200): number {
  return Math.max(1, Math.ceil(wordCount(body) / wordsPerMinute));
}

/** The opening prose of the body, cut on a word boundary. */
export function excerpt(body: string, max = 155): string {
  const text = plainText(body);
  if (text.length <= max) {
    return text;
  }
  // A body with no space inside the limit falls back to a hard cut
  const boundary = text.lastIndexOf(" ", max);
  return `${text.slice(0, boundary > 0 ? boundary : max)}…`;
}
