import type { Agent } from "./types.ts";

export class AnthropicAgent implements Agent {
  async sendPrompt(_prompt: string): Promise<string> {
    try {
    const endpoint = process.env.ANTHROPIC_ENDPOINT;
    if (!endpoint) {
      throw new Error("ANTHROPIC_ENDPOINT is not set");
    }

    const response = await fetch(
      `${endpoint}/v1/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          ...(process.env.AI_WORKSPACE_ID && {
            "anthropic-workspace-id": process.env.AI_WORKSPACE_ID
          })
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL,
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: _prompt
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const raw = await response.text();
      let detail = raw;
      try {
        detail = JSON.stringify(JSON.parse(raw));
      } catch {
        // Not JSON (e.g. a gateway timeout page) - fall back to the raw body.
      }
      throw new Error(`Anthropic request failed (${response.status} ${response.statusText}): ${detail}`);
    }

    const data = await response.json();

    if (data.stop_reason === "max_tokens") {
      console.warn("Anthropic response was truncated (stop_reason: max_tokens) - consider raising max_tokens.");
    }

    const answer = data.content
      .filter((item: any) => item.type === "text")
      .map((item: any) => item.text)
      .join("\n");

    return answer;

  } catch (error) {
    console.error(error);
    throw error;
  }
  }
}
