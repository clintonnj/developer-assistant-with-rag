import type { ChatTurn } from "@dev-assistant/shared-types";
import { embed } from "../embeddings/ollama.ts";
import { vectorSearch } from "./vectorSearch.ts";
import { fullTextSearch } from "./fullTextSearch.ts";
import { reciprocalRankFusion } from "./rrf.ts";
import { expandThroughRelationships } from "./expandRelationships.ts";
import type { RetrievalResult } from "./types.ts";

const VECTOR_LIMIT = 8;
const TEXT_LIMIT = 8;

// How many of the most recent user turns to fold into the search query, so a follow-up like
// "what about its response schema?" still retrieves something relevant - "its" alone matches
// nothing on its own. Assistant turns are deliberately left out: they're long, mostly prose
// restating field names already in the index, and would dilute the embedding/tsquery far more
// than they'd help.
const HISTORY_TURNS_FOR_RETRIEVAL = 2;

function buildRetrievalQuery(question: string, history: ChatTurn[]): string {
  const recentUserTurns = history
    .filter((turn) => turn.role === "user")
    .slice(-HISTORY_TURNS_FOR_RETRIEVAL)
    .map((turn) => turn.text);

  return [...recentUserTurns, question].join("\n");
}

export async function retrieveContext(question: string, history: ChatTurn[] = []): Promise<RetrievalResult> {
  const retrievalQuery = buildRetrievalQuery(question, history);
  const queryEmbedding = await embed(retrievalQuery, "query");

  const [vectorResults, textResults] = await Promise.all([
    vectorSearch(queryEmbedding, VECTOR_LIMIT),
    fullTextSearch(retrievalQuery, TEXT_LIMIT),
  ]);

  const merged = reciprocalRankFusion([vectorResults, textResults]);
  const chunks = merged; //await expandThroughRelationships(merged);

  return { question, chunks };
}
