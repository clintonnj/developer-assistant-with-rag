import { readFileSync } from "node:fs";
import { chunkSchemas } from "../src/chunker/schemas.ts";

const knowledge = JSON.parse(readFileSync(new URL("../knowledge.json", import.meta.url), "utf-8"));
const chunks = chunkSchemas(knowledge);

console.log("Total schema chunks:", chunks.length);

const lengths = chunks.map((c) => c.text.length);
console.log("Chunk char lengths - min/avg/max:", Math.min(...lengths), Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length), Math.max(...lengths));

const oversized = chunks.filter((c) => c.text.length > 3000);
console.log("Chunks over the 3000-char cap:", oversized.length ? oversized.map((c) => c.sourceId) : "none");

const seen = new Map<string, number>();
for (const c of chunks) seen.set(c.sourceId, (seen.get(c.sourceId) ?? 0) + 1);
const dupes = [...seen.entries()].filter(([, count]) => count > 1);
console.log("Duplicate sourceIds:", dupes.length ? dupes : "none");

const tiny = chunks.find((c) => c.sourceId === "LoginRQ");
console.log("\n--- LoginRQ (tiny schema) ---\n", tiny?.text);

const multiPart = chunks.find((c) => c.metadata.schemaName === "AirShoppingRQ");
console.log("\n--- AirShoppingRQ, first part ---\n", multiPart?.text);

const orderViewRsParts = chunks.filter((c) => c.metadata.schemaName === "OrderViewRS");
console.log("\nOrderViewRS split into", orderViewRsParts.length, "parts");
console.log("--- OrderViewRS part 2 ---\n", orderViewRsParts[1]?.text);
