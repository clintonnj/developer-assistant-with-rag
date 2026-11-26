import { embed } from "../embeddings/ollama.ts";
import { vectorSearch } from "./vectorSearch.ts";
import { fullTextSearch } from "./fullTextSearch.ts";
import { reciprocalRankFusion } from "./rrf.ts";
import { expandThroughRelationships } from "./expandRelationships.ts";
import type { RetrievalResult } from "./types.ts";

const VECTOR_LIMIT = 8;
const TEXT_LIMIT = 8;

export async function retrieveContext(question: string): Promise<RetrievalResult> {
  const queryEmbedding = await embed(question, "query");

  const [vectorResults, textResults] = await Promise.all([
    vectorSearch(queryEmbedding, VECTOR_LIMIT),
    fullTextSearch(question, TEXT_LIMIT),
  ]);

  const merged = reciprocalRankFusion([vectorResults, textResults]);
  const chunks = merged; //await expandThroughRelationships(merged);

  return { question, chunks };
}
