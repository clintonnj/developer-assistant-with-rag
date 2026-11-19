import { readFileSync } from "node:fs";
import { chunkConcepts } from "../src/chunker/concepts.ts";
import { chunkUseCases } from "../src/chunker/usecases.ts";

const knowledge = JSON.parse(readFileSync(new URL("../knowledge.json", import.meta.url), "utf-8"));

const concepts = chunkConcepts(knowledge);
const useCases = chunkUseCases(knowledge);

console.log("Total concept chunks:", concepts.length);
console.log("Total use-case chunks:", useCases.length);

function reportDuplicateIds(chunks: { sourceId: string }[], label: string) {
  const seen = new Map<string, number>();
  for (const c of chunks) seen.set(c.sourceId, (seen.get(c.sourceId) ?? 0) + 1);
  const dupes = [...seen.entries()].filter(([, count]) => count > 1);
  console.log(`${label} duplicate sourceIds:`, dupes.length ? dupes : "none");
}
reportDuplicateIds(concepts, "concepts");
reportDuplicateIds(useCases, "useCases");

console.log("\n--- plain concept: OfferID ---");
console.log(concepts.find((c) => c.sourceId === "offerid")?.text);

console.log("\n--- nested concept: TimeLimits ---");
console.log(concepts.find((c) => c.sourceId === "timelimits")?.text);

console.log("\n--- deeply nested concept: ReshopPriceSplitup ---");
console.log(concepts.find((c) => c.sourceId === "reshoppricesplitup")?.text);

console.log("\n--- use case sample ---");
console.log(JSON.stringify(useCases[0], null, 2));
