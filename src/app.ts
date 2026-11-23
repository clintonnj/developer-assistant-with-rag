import express from "express";
import { getAgent, type AgentProvider } from "./agents/index.ts";
import { runIngest } from "./ingest.ts";
import { retrieveContext } from "./retrieval/index.ts";

const AGENT_PROVIDERS = ["ollama", "anthropic"] as const;

function isAgentProvider(value: unknown): value is AgentProvider {
  return AGENT_PROVIDERS.some((provider) => provider === value);
}

const app = express();
app.use(express.json());

app.post("/api/init", async (_req, res) => {
  try {
    const result = await runIngest();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ingestion failed" });
  }
});

app.post("/api/ask", async (req, res) => {
  const { question, provider = "anthropic" } = req.body ?? {};
  if (typeof question !== "string" || question.trim() === "") {
    res.status(400).json({ error: "question (non-empty string) is required" });
    return;
  }
  if (!isAgentProvider(provider)) {
    res.status(400).json({ error: "provider must be 'ollama' or 'anthropic'" });
    return;
  }

  try {
    const result = await retrieveContext(question);
    const prompt = [
      "Answer the user's question using the retrieved context below.",
      "If the context does not contain the answer, say so.",
      "If the user asks for schema, send it in formatted json structure, this is important",
      "Respond in plain text only, not markdown - no **bold**/*italic* markers, no #/## headers, " +
        "no markdown bullet or numbered list syntax, no code fences. Use plain sentences and, " +
        "where a list genuinely helps, lines starting with a dash and a space.",
      "",
      `Question: ${question}`,
      "",
      "Retrieved context:",
      ...result.chunks.map((chunk, index) =>
        `[${index + 1}] ${chunk.title}\n${chunk.text}`,
      ),
    ].join("\n");
    const answer = await getAgent(provider).sendPrompt(prompt);
    res.json({ ...result, answer, provider });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Question answering failed" });
  }
});

export default app;