import { chunkSchemas } from "../../src/chunker/schemas.ts";
import { loadKnowledge } from "../../src/knowledge/load.ts";

const knowledge = loadKnowledge();
const chunks = chunkSchemas(knowledge);

// 1. Continuation-fragment lines: body lines that don't start with "<name> (<type>...)".
const linePattern = /^\S.*? \((object|array|string|integer|number|boolean)(, required)?\)/;
let totalLines = 0;
let fragmentLines = 0;
for (const c of chunks) {
  const bodyStart = c.text.indexOf("\n\n");
  const body = bodyStart >= 0 ? c.text.slice(bodyStart + 2) : c.text;
  for (const line of body.split("\n")) {
    if (line.trim() === "" || line.startsWith("Section:")) continue;
    totalLines++;
    if (!linePattern.test(line)) fragmentLines++;
  }
}
console.log(`1. Lines: ${totalLines} total, ${fragmentLines} don't match "name (type): desc"`);

// 2. Chunks mentioning enumerated "possible value(s)" text.
const possibleValueChunks = chunks.filter((c) => /possible values?/i.test(c.text));
console.log(`2. Chunks mentioning "possible value(s)": ${possibleValueChunks.length}`);

// 3. Chunks with an empty section.
const emptySection = chunks.filter((c) => !c.metadata.section);
console.log(`3. Chunks with empty section: ${emptySection.length} / ${chunks.length}`);
console.log("   sample sourceIds:", emptySection.slice(0, 5).map((c) => c.sourceId));

// 4. OrderViewRS: chunk count vs unique section/title count.
const ovrs = chunks.filter((c) => c.metadata.schemaName === "OrderViewRS");
const uniqueSections = new Set(ovrs.map((c) => c.metadata.section));
const uniqueTitles = new Set(ovrs.map((c) => c.title));
console.log(`4. OrderViewRS: ${ovrs.length} chunks, ${uniqueSections.size} unique sections, ${uniqueTitles.size} unique titles`);

// 5. Repeated "Section: ..." header back to back (the per-field-header regression).
let repeatedHeaderChunks = 0;
for (const c of chunks) {
  const headers = c.text.split("\n").filter((l) => l.startsWith("Section:"));
  for (let i = 1; i < headers.length; i++) {
    if (headers[i] === headers[i - 1]) {
      repeatedHeaderChunks++;
      break;
    }
  }
}
console.log(`5. Chunks with a repeated identical Section header: ${repeatedHeaderChunks}`);

// 6. Title/metadata.section length sanity (should never run away).
const titleLengths = chunks.map((c) => c.title.length);
const sectionLengths = chunks.map((c) => (c.metadata.section as string).length);
console.log(`6. Title length max: ${Math.max(...titleLengths)}, metadata.section length max: ${Math.max(...sectionLengths)}`);
console.log("   total metadata.section chars across all chunks:", sectionLengths.reduce((a, b) => a + b, 0));
