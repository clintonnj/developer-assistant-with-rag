const OLLAMA_URL = "http://localhost:11434/api/embed";
const MODEL = "nomic-embed-text";

export type EmbeddingTask = "document" | "query";

// nomic-embed-text was fine-tuned on these literal instruction prefixes to condition the
// embedding space differently for a stored passage vs. a short search question - both sides
// of a retrieval must use the matching one, or they drift apart in the same embedding space.
const TASK_PREFIXES: Record<EmbeddingTask, string> = {
  document: "search_document: ",
  query: "search_query: ",
};

/**
 * Embeds one piece of text via a local Ollama server.
 *
 * Request:  POST http://localhost:11434/api/embed
 *           JSON body: { model: "nomic-embed-text", input: string }
 * Response: JSON body: { embeddings: number[][] } — one vector per input;
 *           since we only ever send one string, we take embeddings[0].
 *
 * `task` picks the prefix: "document" when embedding a chunk for storage (ingest.ts),
 * "query" when embedding a user's question (retrieval).
 */
export async function embed(text: string, task: EmbeddingTask): Promise<number[]> {
  const res = await fetch(OLLAMA_URL,{
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: TASK_PREFIXES[task] + text
    })
  })
  if (!res.ok) {
    throw new Error(`Ollama embed request failed (${res.status}): ${await res.text()}`);
  }
  const response = await res.json();
  return response?.embeddings?.[0] || [];
}
