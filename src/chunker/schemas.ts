import type { Chunk } from "./types.ts";
import { isUsableDescription, cleanDescription } from "./text.ts";

export type JsonSchemaType = "object" | "array" | "string" | "integer" | "number" | "boolean";

export interface JsonSchemaNode {
  type?: JsonSchemaType;
  description?: string;
  nullable?: boolean;
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
}

export interface Schema {
  name: string;
  jsonSchema: JsonSchemaNode;
}

export interface Relationship {
  sourceId: string;
  targetId: string;
  type: "USES_SCHEMA" | "RETURNS_SCHEMA";
}

interface KnowledgeWithSchemas {
  schemas: Schema[];
  relationships: Relationship[];
}

// A handful of nodes in the source omit `type` but always carry `properties` when they do.
function effectiveType(node: JsonSchemaNode): JsonSchemaType {
  if (node.type) return node.type;
  if (node.properties) return "object";
  if (node.items) return "array";
  return "object";
}

// One field, with its full path from the schema root kept as segments (not yet joined into
// text) so a group of lines can later compute how much of that path they share.
interface SchemaLine {
  segments: string[];
  type: JsonSchemaType;
  isRequired: boolean;
  description?: string;
}

function inlineLabel(type: JsonSchemaType, isRequired: boolean, description?: string): string {
  const requiredLabel = isRequired ? ", required" : "";
  const descLabel = isUsableDescription(description) ? `: ${cleanDescription(description)}` : "";
  return `(${type}${requiredLabel})${descLabel}`;
}

const MAX_CHARS = 3000;
const TARGET_CHARS = 1500;

// A section is a cohesive run of lines that share a real common ancestor - the unit a single
// "Section: ..." header can describe. A chunk is one or more sections rendered together: most
// chunks are a single section (a whole subtree, or a split piece of one), but when small
// sibling subtrees with nothing deeper in common get merged into one chunk (e.g. a schema's
// "Party" branch and "DataLists" branch, both small, merged to hit the target size), each
// keeps its own section header instead of being flattened into one group with no shared path.
type Section = SchemaLine[];
type SchemaChunk = Section[];

// Pack one node's subtree into one or more chunks. A subtree that fits under the cap becomes
// a single section/chunk (the common case for small/medium schemas - often the whole schema
// is one). An oversized subtree is split by recursing into its children, then re-merging small
// sibling subtrees back together up to the target size, preserving each as its own section.
function packNode(segments: string[], node: JsonSchemaNode, isRequired: boolean, maxChars: number): SchemaChunk[] {
  if (effectiveType(node) === "array" && node.items) {
    const item = node.items;
    const arraySegments = [...segments.slice(0, -1), `${segments[segments.length - 1]}[]`];
    const description = isUsableDescription(node.description) ? node.description : item.description;
    const ownLine: SchemaLine = { segments: arraySegments, type: effectiveType(item), isRequired, description };
    return packChildren(arraySegments, ownLine, item, maxChars);
  }
  const ownLine: SchemaLine = { segments, type: effectiveType(node), isRequired, description: node.description };
  return packChildren(segments, ownLine, node, maxChars);
}

function packChildren(segments: string[], ownLine: SchemaLine, node: JsonSchemaNode, maxChars: number): SchemaChunk[] {
  if (!node.properties || Object.keys(node.properties).length === 0) {
    return [[[ownLine]]];
  }

  const required = new Set(node.required ?? []);
  const childChunks: SchemaChunk[] = Object.entries(node.properties).flatMap(([key, child]) =>
    // One known source quirk: a property key in ServiceListRS is literally " Name" with a
    // leading space.
    packNode([...segments, key.trim()], child, required.has(key), maxChars),
  );
  const childSections: Section[] = childChunks.flat();

  // Try the whole subtree as ONE cohesive section first - ownLine plus every descendant line,
  // flattened - so a node whose children individually needed their own recursive packing step
  // still collapses back into a single "Section: ..." header when the combined result fits.
  // Only fall through to section-level merging when that single section would be too big.
  const wholeSubtreeSection: Section = [ownLine, ...childSections.flat()];
  if (renderChunk([wholeSubtreeSection]).text.length <= maxChars) {
    return [[wholeSubtreeSection]];
  }
  return mergeSections([[ownLine], ...childSections], maxChars);
}

// A section's own shared-prefix depth if it were rendered alone - the yardstick for whether
// merging it with a neighbor loses specificity (see sectionsShareEnough below).
function ownPrefixLength(section: Section): number {
  return section.length === 1 ? section[0].segments.length - 1 : commonPrefixLength(section);
}

// Two sections are worth combining into one (one header instead of two) only when doing so
// doesn't shallow the shared path below what either already had alone - e.g. two sibling leaves
// under the very same parent (SegmentType, SegmentKey under Flight[]) merge for free, since the
// combined prefix is exactly as deep as each already was. Two unrelated branches (OrderItemID,
// Price under the same grandparent) would only share the grandparent once merged, which is
// strictly less specific than either alone - better kept as two separately-headed sections.
function sectionsShareEnough(a: Section, b: Section): boolean {
  const mergedPrefixLen = commonPrefixLength([...a, ...b]);
  // Must not be shallower than EITHER side's own depth. Using the min here (rather than max)
  // was the earlier bug: it let a trivial schema-root line (own depth always 0) "merge" with
  // literally anything, since 0 is satisfied by any prefix length - which is exactly how the
  // Party/DataLists repetition came back after the SegmentType/SegmentKey fix.
  return mergedPrefixLen >= Math.max(ownPrefixLength(a), ownPrefixLength(b));
}

// Greedily builds chunks out of sections, operating at section (not whole-child-chunk)
// granularity: a new section first tries to merge INTO the current chunk's last section
// (collapsing to one shared header) when that loses no specificity and still fits, otherwise
// it's appended as its own separate section within the same chunk up to the target size, and
// only once that's exhausted does a new chunk start.
function mergeSections(sections: Section[], maxChars: number): SchemaChunk[] {
  const chunks: SchemaChunk[] = [];
  let current: SchemaChunk = [];

  for (const section of sections) {
    if (current.length === 0) {
      current = [section];
      continue;
    }

    const last = current[current.length - 1];
    if (sectionsShareEnough(last, section)) {
      const merged = [...current.slice(0, -1), [...last, ...section]];
      if (renderChunk(merged).text.length <= maxChars) {
        current = merged;
        continue;
      }
    }

    const appended = [...current, section];
    const appendedFits = renderChunk(appended).text.length <= maxChars;
    const currentBelowTarget = renderChunk(current).text.length < TARGET_CHARS;
    if (appendedFits && currentBelowTarget) {
      current = appended;
    } else {
      chunks.push(current);
      current = [section];
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function sharedSegmentCount(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// The longest path prefix shared by every line in the section (comparing everyone against the
// first line is sufficient: a mismatch against any member caps the shared length for the set).
function commonPrefixLength(lines: SchemaLine[]): number {
  return lines.reduce((min, line) => Math.min(min, sharedSegmentCount(lines[0].segments, line.segments)), lines[0].segments.length);
}

// Renders one section as "Section: <shared path>" (schema name omitted, that's a separate
// header) followed by lines relative to that path. When the section's own shallowest line (its
// subtree's root, always first by construction) IS that shared path, it has nothing left to
// show relative to itself - fold its type/description into the Section line instead of a blank
// body line.
function renderSection(lines: SchemaLine[]): { text: string; section: string } {
  if (lines.length === 1) {
    const only = lines[0];
    const sectionPath = only.segments.slice(1, -1);
    const label = only.segments[only.segments.length - 1];
    const section = sectionPath.join(" > ");
    const header = section ? `Section: ${section}\n\n` : "";
    return { text: `${header}${label} ${inlineLabel(only.type, only.isRequired, only.description)}`, section };
  }

  const prefixLen = commonPrefixLength(lines);
  const foldAncestor = lines[0].segments.length === prefixLen;
  const bodyLines = foldAncestor ? lines.slice(1) : lines;
  const ancestorInline = foldAncestor ? inlineLabel(lines[0].type, lines[0].isRequired, lines[0].description) : "";
  const sectionPath = lines[0].segments.slice(1, prefixLen);
  const section = sectionPath.join(" > ");
  const header = section
    ? `Section: ${section}${ancestorInline ? ` ${ancestorInline}` : ""}\n\n`
    : ancestorInline
      ? `${ancestorInline}\n\n`
      : "";
  const body = bodyLines
    .map((line) => `${line.segments.slice(prefixLen).join(".")} ${inlineLabel(line.type, line.isRequired, line.description)}`)
    .join("\n");
  return { text: header + body, section };
}

// Renders a chunk's sections back to back. The common single-section case delegates straight
// to renderSection with no change in behavior. When a chunk has multiple sections (merged
// siblings with nothing deeper in common), each still gets its own "Section: ..." header
// instead of falling back to full paths with no header at all.
function renderChunk(sections: Section[]): { text: string; sectionLabels: string[] } {
  const rendered = sections.map((lines) => renderSection(lines));
  return {
    text: rendered.map((r) => r.text).join("\n\n"),
    sectionLabels: rendered.map((r) => r.section).filter((section) => section !== ""),
  };
}

interface SchemaUsage {
  usedByOperations: string[];
  returnedByOperations: string[];
}

function buildUsageMap(relationships: Relationship[]): Map<string, SchemaUsage> {
  const usage = new Map<string, SchemaUsage>();
  for (const rel of relationships) {
    if (!usage.has(rel.targetId)) {
      usage.set(rel.targetId, { usedByOperations: [], returnedByOperations: [] });
    }
    const entry = usage.get(rel.targetId)!;
    if (rel.type === "USES_SCHEMA") entry.usedByOperations.push(rel.sourceId);
    else entry.returnedByOperations.push(rel.sourceId);
  }
  return usage;
}

// When a chunk legitimately has several sections (small sibling subtrees merged for size),
// use one representative path for its title/metadata rather than concatenating every section -
// the shared prefix across them if there is one, otherwise just the first section's own path.
function representativeSection(sectionLabels: string[]): string {
  if (sectionLabels.length <= 1) return sectionLabels[0] ?? "";
  const segmentLists = sectionLabels.map((label) => label.split(" > "));
  const shared = segmentLists.reduce((min, segments) => Math.min(min, sharedSegmentCount(segmentLists[0], segments)), segmentLists[0].length);
  return shared > 0 ? segmentLists[0].slice(0, shared).join(" > ") : segmentLists[0].join(" > ");
}

function formatUsageHeader(schemaName: string, usage: SchemaUsage | undefined): string {
  const lines = [`Schema: ${schemaName}`];
  if (usage?.usedByOperations.length) {
    lines.push(`Used as request by: ${usage.usedByOperations.join(", ")}`);
  }
  if (usage?.returnedByOperations.length) {
    lines.push(`Returned by: ${usage.returnedByOperations.join(", ")}`);
  }
  return lines.join("\n");
}

export function chunkSchemas(knowledge: KnowledgeWithSchemas): Chunk[] {
  const usageMap = buildUsageMap(knowledge.relationships);
  const chunks: Chunk[] = [];

  for (const schema of knowledge.schemas) {
    const usage = usageMap.get(schema.name);
    const usageHeader = formatUsageHeader(schema.name, usage);
    // The usage header is prepended to every chunk's text below, so the packer must budget
    // for it when deciding whether a group still fits under the hard cap.
    const budget = MAX_CHARS - usageHeader.length - 2;
    const groups = packNode([schema.name], schema.jsonSchema, false, budget);

    groups.forEach((group, index) => {
      const { text: body, sectionLabels } = renderChunk(group);
      const section = representativeSection(sectionLabels);
      // Multiple chunks from the same schema can land on the same (or no) section - e.g. two
      // split pieces of one oversized subtree, or two merged-sibling chunks under the same
      // parent. Appending the part number whenever a schema has more than one chunk guarantees
      // distinct titles without needing to detect which cases would actually collide.
      const partSuffix = groups.length > 1 ? ` (part ${index + 1}/${groups.length})` : "";
      const title = `${schema.name}${section ? `: ${section}` : ""}${partSuffix}`;
      chunks.push({
        sourceType: "schema",
        sourceId: groups.length > 1 ? `${schema.name}#part${index + 1}` : schema.name,
        title,
        text: `${usageHeader}\n\n${body}`,
        metadata: {
          schemaName: schema.name,
          section,
          part: index + 1,
          totalParts: groups.length,
          usedByOperations: usage?.usedByOperations ?? [],
          returnedByOperations: usage?.returnedByOperations ?? [],
        },
      });
    });
  }

  return chunks;
}
