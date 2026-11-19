import type { Chunk } from "./types.ts";
import { isUsableDescription, cleanDescription } from "./text.ts";

type JsonSchemaType = "object" | "array" | "string" | "integer" | "number" | "boolean";

interface JsonSchemaNode {
  type?: JsonSchemaType;
  description?: string;
  nullable?: boolean;
  required?: string[];
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
}

interface Schema {
  name: string;
  jsonSchema: JsonSchemaNode;
}

interface Relationship {
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

// Pack one node's subtree into one or more groups of SchemaLine. A subtree that fits under
// the cap becomes a single group (this is the common case for small/medium schemas - often
// the whole schema is one group). An oversized subtree is split by recursing into its
// children, then re-merging small sibling subtrees back together up to the target size.
// Chunk boundaries always land on subtree boundaries, which is what makes a shared path
// prefix ("Section: ...") meaningful later - a boundary that cut a subtree in half wouldn't
// have one.
function packNode(segments: string[], node: JsonSchemaNode, isRequired: boolean, maxChars: number): SchemaLine[][] {
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

function packChildren(segments: string[], ownLine: SchemaLine, node: JsonSchemaNode, maxChars: number): SchemaLine[][] {
  if (!node.properties || Object.keys(node.properties).length === 0) {
    return [[ownLine]];
  }

  const required = new Set(node.required ?? []);
  const childGroups = Object.entries(node.properties).flatMap(([key, child]) =>
    packNode([...segments, key], child, required.has(key), maxChars),
  );

  const wholeSubtree = [ownLine, ...childGroups.flat()];
  if (renderGroup(wholeSubtree).text.length <= maxChars) {
    return [wholeSubtree];
  }
  return mergeGroups([[ownLine], ...childGroups], maxChars);
}

function mergeGroups(groups: SchemaLine[][], maxChars: number): SchemaLine[][] {
  const merged: SchemaLine[][] = [];
  let current: SchemaLine[] = [];

  for (const group of groups) {
    if (current.length === 0) {
      current = group;
      continue;
    }
    const candidate = [...current, ...group];
    const candidateFits = renderGroup(candidate).text.length <= maxChars;
    const currentBelowTarget = renderGroup(current).text.length < TARGET_CHARS;
    if (candidateFits && currentBelowTarget) {
      current = candidate;
    } else {
      merged.push(current);
      current = group;
    }
  }
  if (current.length > 0) merged.push(current);
  return merged;
}

function sharedSegmentCount(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// The longest path prefix shared by every line in the group (comparing everyone against the
// first line is sufficient: a mismatch against any member caps the shared length for the set).
function commonPrefixLength(lines: SchemaLine[]): number {
  return lines.reduce((min, line) => Math.min(min, sharedSegmentCount(lines[0].segments, line.segments)), lines[0].segments.length);
}

// Renders a group as "Section: <shared path>" (schema name omitted, that's a separate header)
// followed by lines relative to that path. When the group's own shallowest line (the subtree's
// root, always first by construction) IS that shared path, it has nothing left to show relative
// to itself - fold its type/description into the Section line instead of a blank body line.
function renderGroup(lines: SchemaLine[]): { text: string; section: string } {
  if (lines.length === 1) {
    const only = lines[0];
    const sectionPath = only.segments.slice(1, -1);
    const label = only.segments[only.segments.length - 1];
    const section = sectionPath.join(" > ");
    const header = section ? `Section: ${section}\n\n` : "";
    return { text: `${header}${label} ${inlineLabel(only.type, only.isRequired, only.description)}`, section };
  }

  const prefixLen = commonPrefixLength(lines);
  // The group's shallowest line is always its subtree's own root (prepended by construction).
  // When its path IS the shared prefix, it has nothing left to show relative to itself - fold
  // its type/description in rather than emit a body line with a blank name.
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
      const { text: body, section } = renderGroup(group);
      const title = section ? `${schema.name}: ${section}` : schema.name;
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
