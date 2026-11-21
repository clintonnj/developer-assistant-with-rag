import { readFileSync } from "node:fs";
import type { Chunk } from "./types.ts";
import { slugify } from "./text.ts";

// Generic markdown chunker: packs a document by its actual heading structure instead of
// understanding specific named sections. A heading's whole subtree becomes one chunk if it fits
// under the cap; otherwise its own direct text (if any) and each child heading are packed
// separately and recursed into. Deliberately "dumb" about the document's meaning - unlike a
// hand-built parser that looks for specific named sections, it never assumes anything about a
// heading's level or title, so a reorganized or reworded source document degrades to different
// chunk boundaries, never to silently missing content.

const MAX_CHARS = 3000;
const TARGET_CHARS = 1500;

interface MdHeading {
  level: number;
  title: string;
  line: number;
}

// Google Docs' markdown export escapes punctuation ("\:", "\(", "\&" ...) - undo that for clean
// embedding/display text.
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!:<>&|])/g, "$1");
}

// Strips emphasis markers and resolves markdown links. A link to another spot in the same
// document ("#...") carries no information beyond its visible text; a link to an external
// resource keeps the URL alongside the text so nothing is lost - unless the visible text already
// is that URL (common for plain pasted links), in which case appending it again would just be noise.
function cleanProse(text: string): string {
  return unescapeMarkdown(
    text
      .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, linkText: string, url: string) => {
        if (url.startsWith("#") || unescapeMarkdown(linkText) === unescapeMarkdown(url)) return linkText;
        return `${linkText} (${url})`;
      })
      .replace(/\*\*/g, "")
      .replace(/(?<!\w)\*(?!\s)(.*?)(?<!\s)\*(?!\w)/g, "$1")
      .replace(/[\u000b\u000c ]/g, " ")
      .replace(/[ \t]+/g, " "),
  ).trim();
}

function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s?/.test(line);
}

// A line's displayed text with any markdown decoration stripped - the "#" heading markers (if
// any), Google's trailing "{#anchor-id}" (if any), and emphasis markers.
function headingTitle(line: string): string {
  const withoutHashes = line.replace(/^#{1,6}\s*/, "");
  const withoutAnchor = withoutHashes.replace(/\s*\{#[^}]*\}\s*$/, "");
  return cleanProse(withoutAnchor);
}

function parseHeadings(lines: string[]): MdHeading[] {
  const headings: MdHeading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(#{1,6})\s?/.exec(lines[i]);
    if (!match) continue;
    const title = headingTitle(lines[i]);
    if (title.length === 0) continue; // Google's decorative empty "#" page-break artifacts carry no content
    headings.push({ level: match[1].length, title, line: i });
  }
  return headings;
}

// One row of a markdown pipe table, cells cleaned - rendered back out as plain text (not dropped)
// since a table can be the only place a JSON sample or a mapping lives.
function renderTableRow(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  const cells = trimmed
    .split("|")
    .slice(1, -1)
    .map((cell) => cleanProse(cell));
  if (cells.every((cell) => /^:?-+:?$/.test(cell))) return null; // separator row, not content
  return cells.filter((cell) => cell.length > 0).join(" | ");
}

// Groups raw lines into paragraphs (blank-line-delimited prose), each cleaned to plain text -
// the unit the greedy packer below works with. A table row is always its own paragraph rather
// than being merged with its neighboring rows, so the packer can split a long table cleanly
// between complete rows instead of treating the whole table as one unsplittable blob. Any
// heading line reaching here (only possible at a leaf's trailing edge) is skipped, since
// headings are rendered separately as labels by the caller.
function toParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length) paragraphs.push(current.join(" "));
    current = [];
  };

  for (const line of lines) {
    if (isHeadingLine(line)) continue;
    // A pipe-prefixed line is always table syntax, never prose - a separator row (tableRow is
    // null here) must still be skipped entirely rather than falling through to be treated as a
    // plain text line, which would leak the raw "| :---- |" markup into the chunk's text.
    if (line.trim().startsWith("|")) {
      const tableRow = renderTableRow(line);
      if (tableRow) {
        flush();
        paragraphs.push(tableRow);
      }
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    current.push(cleanProse(line));
  }
  flush();
  return paragraphs.filter((p) => p.trim().length > 0);
}

// The end of a heading's own subtree: the next heading at the same level or shallower, or the
// end of the file. Depends only on comparing a heading's own level against later ones, so it
// stays correct even when the document's heading levels are inconsistent (e.g. siblings styled
// at different heading levels) - unlike grouping by "all headings at the same level," which
// would silently skip a sibling the source styled one level deeper or shallower than the rest.
function subtreeEnd(headings: MdHeading[], index: number, totalLines: number): number {
  const level = headings[index].level;
  for (let i = index + 1; i < headings.length; i++) {
    if (headings[i].level <= level) return headings[i].line;
  }
  return totalLines;
}

// Greedily packs paragraphs into chunks up to maxChars - the fallback for a leaf heading (or the
// document's own un-headed preamble) whose flattened text is too big to be one chunk and has no
// further headings to recurse into. A single paragraph bigger than maxChars (e.g. one large
// embedded JSON sample) is kept whole rather than split or truncated - nothing is ever cut mid-content.
function packParagraphs(paragraphs: string[], maxChars: number): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const paragraph of paragraphs) {
    if (current.length === 0) {
      current = [paragraph];
      currentLength = paragraph.length;
      continue;
    }
    const appendedLength = currentLength + 2 + paragraph.length;
    // Grow only while BOTH holds: the combined text still fits the cap, and the current group
    // hasn't already reached the target size. Either condition failing starts a fresh group -
    // in particular, a paragraph that alone exceeds the cap (e.g. one large JSON sample) always
    // starts its own group instead of bloating whatever came before it.
    if (appendedLength <= maxChars && currentLength < TARGET_CHARS) {
      current.push(paragraph);
      currentLength = appendedLength;
    } else {
      groups.push(current.join("\n\n"));
      current = [paragraph];
      currentLength = paragraph.length;
    }
  }
  if (current.length) groups.push(current.join("\n\n"));
  return groups;
}

interface PackedSection {
  path: string[];
  text: string;
}

// The full flattened text of a heading's whole subtree (its own text plus every descendant's, in
// document order, each descendant's title kept as an inline label so nothing is conflated) - used
// to decide whether the whole thing fits in one chunk before bothering to split it. Walking every
// heading found in the range (regardless of its level relative to its neighbors) and taking the
// text immediately before each is what makes this complete even over inconsistently-leveled
// headings: every line in the range is attributed to exactly one place, with no level comparison
// involved at all.
function flattenWholeSubtree(lines: string[], headings: MdHeading[], index: number): string {
  const end = subtreeEnd(headings, index, lines.length);
  const body: string[] = [];
  let cursor = headings[index].line + 1;
  for (let i = index + 1; i < headings.length && headings[i].line < end; i++) {
    const before = toParagraphs(lines.slice(cursor, headings[i].line)).join("\n\n");
    if (before) body.push(before);
    body.push(`**${headings[i].title}**`);
    cursor = headings[i].line + 1;
  }
  const trailing = toParagraphs(lines.slice(cursor, end)).join("\n\n");
  if (trailing) body.push(trailing);
  return body.join("\n\n");
}

// Packs one heading's subtree into one or more chunks. Mirrors schemas.ts's packNode: try the
// whole subtree as one chunk first (the common case for small/medium sections), and only split it
// when it doesn't fit - walking the subtree as a sequence of (gap text, child heading) pairs in
// document order. A "child" here is simply the next heading found in range, whatever its level;
// its own subtreeEnd (not a level comparison) decides how much of the range it consumes, so
// nothing in between is ever skipped regardless of how the source leveled its headings.
function packHeading(lines: string[], headings: MdHeading[], index: number, path: string[]): PackedSection[] {
  const whole = flattenWholeSubtree(lines, headings, index);
  if (whole.length <= MAX_CHARS) {
    return whole ? [{ path, text: whole }] : [];
  }

  const end = subtreeEnd(headings, index, lines.length);
  const sections: PackedSection[] = [];
  let cursor = headings[index].line + 1;
  let i = index + 1;

  while (i < headings.length && headings[i].line < end) {
    const gap = toParagraphs(lines.slice(cursor, headings[i].line));
    for (const part of packParagraphs(gap, MAX_CHARS)) sections.push({ path, text: part });

    const childEnd = subtreeEnd(headings, i, lines.length);
    sections.push(...packHeading(lines, headings, i, [...path, headings[i].title]));

    cursor = childEnd;
    while (i < headings.length && headings[i].line < childEnd) i++;
  }

  const trailing = toParagraphs(lines.slice(cursor, end));
  for (const part of packParagraphs(trailing, MAX_CHARS)) sections.push({ path, text: part });

  return sections;
}

function toChunk(section: PackedSection, part: number, totalParts: number): Chunk {
  const title = section.path.join(" > ");
  const partSuffix = totalParts > 1 ? ` (part ${part}/${totalParts})` : "";
  const sourceId = `${slugify(section.path.join("-"))}${totalParts > 1 ? `#part${part}` : ""}`;
  return {
    sourceType: "doc",
    sourceId,
    title: `${title}${partSuffix}`,
    text: section.text,
    metadata: { headingPath: section.path, part, totalParts },
  };
}

// Numbers and ids are assigned per distinct heading path across a whole top-level section, not
// per recursive call - so if two sibling headings happen to share the exact same title (this
// source has a few), they still each get distinct, stable "part N/M" ids instead of colliding.
function toChunks(sections: PackedSection[]): Chunk[] {
  const byPath = new Map<string, PackedSection[]>();
  for (const section of sections) {
    const key = section.path.join(" > ");
    byPath.set(key, [...(byPath.get(key) ?? []), section]);
  }
  return [...byPath.values()].flatMap((group) => group.map((section, i) => toChunk(section, i + 1, group.length)));
}

export function chunkMarkdown(lines: string[]): Chunk[] {
  const headings = parseHeadings(lines);

  // Content before the very first heading (the document title plus, in this source, a table of
  // contents formatted as plain links rather than headings) - kept rather than silently dropped.
  const preambleEnd = headings[0]?.line ?? lines.length;
  const preamble = toParagraphs(lines.slice(0, preambleEnd));
  const preambleSections: PackedSection[] = packParagraphs(preamble, MAX_CHARS).map((text) => ({ path: ["Preamble"], text }));

  const topLevel = headings.filter((h) => h.level === headings[0]?.level);
  const bodySections = topLevel.flatMap((heading) => packHeading(lines, headings, headings.indexOf(heading), [heading.title]));

  return [...toChunks(preambleSections), ...toChunks(bodySections)];
}

export function chunkMarkdownFile(filePath: URL): Chunk[] {
  const lines = readFileSync(filePath, "utf-8").split(/\r?\n/);
  return chunkMarkdown(lines);
}
