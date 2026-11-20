import { chunkOperations } from "../src/chunker/operations.ts";
import { loadKnowledge } from "../src/knowledge/load.ts";

const knowledge = loadKnowledge();
const chunks = chunkOperations(knowledge);

console.log("Total operation chunks:", chunks.length);
console.log();
console.log(JSON.stringify(chunks[0], null, 2));
console.log();
const entrygate = chunks.find((c) => c.sourceId === "post_entrygate_rest_request_postServiceList");
console.log(JSON.stringify(entrygate, null, 2));
