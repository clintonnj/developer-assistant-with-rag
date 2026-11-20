const OLLAMA_URL = "http://localhost:11434/api/embed";
const MODEL = "nomic-embed-text";

/**
 * Embeds one chunk of text via a local Ollama server.
 *
 * Request:  POST http://localhost:11434/api/embed
 *           JSON body: { model: "nomic-embed-text", input: string }
 * Response: JSON body: { embeddings: number[][] } — one vector per input;
 *           since we only ever send one string, we take embeddings[0].
 *
 * PLAN.md: prefix text with "search_document: " when embedding a chunk for storage
 * (vs. "search_query: " later when embedding a user's question).
 */
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(OLLAMA_URL,{
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      input: "search_document: " + text
    })
  })
  if (!res.ok) {
    throw new Error(`Ollama embed request failed (${res.status}): ${await res.text()}`);
  }
  const response = await res.json();
  return response?.embeddings?.[0] || [];
}
