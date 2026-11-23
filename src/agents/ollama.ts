import { Agent as UndiciAgent } from "undici";
import type { Agent } from "./types.ts";

// Node's global fetch (undici under the hood) gives up waiting for response headers after a
// default 5-minute `headersTimeout` - easily exceeded by local inference on a large prompt or a
// cold model load. There's no plain `timeout` option on fetch for this; it has to go through a
// custom dispatcher. Configurable (and disableable with 0, meaning "wait forever") since how long
// is reasonable depends entirely on your hardware and how much context gets retrieved.
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 600_000;
const dispatcher = new UndiciAgent({
  headersTimeout: OLLAMA_TIMEOUT_MS,
  bodyTimeout: OLLAMA_TIMEOUT_MS,
});

export class OllamaAgent implements Agent {
  async sendPrompt(_prompt: string): Promise<string> {
    try {
    const endpoint = process.env.OLLAMA_AI_ENDPOINT;
    if (!endpoint) {
      throw new Error("OLLAMA_AI_ENDPOINT is not set");
    }

    const requestOptions: RequestInit & { dispatcher?: UndiciAgent } = {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OLLAMA_AI_MODEL,
        stream: false,
        options: {
          num_predict: 2048
        },
        messages: [
          {
            role: "user",
            content: _prompt
          }
        ]
      }),
      dispatcher
    };

    const response = await fetch(`${endpoint}/api/chat`, requestOptions);

    if (!response.ok) {
      const raw = await response.text();
      let detail = raw;
      try {
        detail = JSON.stringify(JSON.parse(raw));
      } catch {
        // Not JSON (e.g. a gateway timeout page) - fall back to the raw body.
      }
      throw new Error(`Ollama request failed (${response.status} ${response.statusText}): ${detail}`);
    }

    const data = await response.json();

    if (data.done_reason === "length") {
      console.warn("Ollama response was truncated (done_reason: length) - consider raising num_predict.");
    }

    return data.message.content;

  } catch (error) {
    console.error(error);
    throw error;
  }
  }
}
