import { writeFileSync } from "node:fs";
import { chunkAllSources } from "../src/chunker/index.ts";

const chunks = await chunkAllSources();

const bySourceType = new Map<string, number>();
for (const c of chunks) bySourceType.set(c.sourceType, (bySourceType.get(c.sourceType) ?? 0) + 1);

console.log("Total chunks:", chunks.length);
console.log("By sourceType:", Object.fromEntries(bySourceType));

writeFileSync(new URL("../chunks.json", import.meta.url), JSON.stringify(chunks, null, 2));
console.log("\nWrote chunks.json");
