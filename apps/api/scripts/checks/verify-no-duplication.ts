import { chunkSchemas } from "../../src/chunker/schemas.ts";
import { loadKnowledge } from "../../src/knowledge/load.ts";

const knowledge = loadKnowledge();

// Ground truth: count every distinct field path in the raw tree, independent of the chunker.
function countFields(node: any): number {
  let count = 1;
  if (node.properties) {
    for (const child of Object.values(node.properties)) count += countFields(child);
  }
  if (node.items) count += countFields(node.items) - 1; // array + its item collapse into one line
  return count;
}

const chunks = chunkSchemas(knowledge);
const bySchema = new Map<string, number>();
for (const c of chunks) {
  const name = c.metadata.schemaName as string;
  // A field can appear either as its own body line, or folded into a "Section: ..." header's
  // trailing "(type...)" suffix when it's the section's own ancestor node - either way, any
  // line carrying a " (type...)" annotation represents exactly one field.
  const bodyLineCount = c.text
    .split("\n")
    .filter((l: string) => /(^|\s)\((object|array|string|integer|number|boolean)/.test(l)).length;
  bySchema.set(name, (bySchema.get(name) ?? 0) + bodyLineCount);
}

for (const schema of knowledge.schemas) {
  const expected = countFields(schema.jsonSchema);
  const actual = bySchema.get(schema.name) ?? 0;
  const mark = expected === actual ? "OK" : "MISMATCH";
  console.log(`${mark}  ${schema.name}: expected ${expected} fields, rendered ${actual} lines`);
}
