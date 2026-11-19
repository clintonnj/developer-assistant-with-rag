import type { Chunk } from "./types.ts";
import { slugify } from "./text.ts";

// Most concepts are a flat `term: definition` string, but a few group related
// sub-terms one level deeper (e.g. ReshopPriceSplitup.DifferentialTypeCode.ADD_COL).
type ConceptValue = string | { [key: string]: ConceptValue };

interface KnowledgeWithConcepts {
  documentation: { concepts: Record<string, ConceptValue> };
}

function renderGroup(group: Record<string, ConceptValue>, indent: string): string {
  return Object.entries(group)
    .map(([key, value]) =>
      typeof value === "string"
        ? `${indent}${key}: ${value}`
        : `${indent}${key}:\n${renderGroup(value, `${indent}  `)}`,
    )
    .join("\n");
}

export function chunkConcepts(knowledge: KnowledgeWithConcepts): Chunk[] {
  return Object.entries(knowledge.documentation.concepts).map(([term, value]) => ({
    sourceType: "concept",
    sourceId: slugify(term),
    title: term,
    text: typeof value === "string" ? `${term}: ${value}` : `${term}:\n${renderGroup(value, "  ")}`,
    metadata: {},
  }));
}
