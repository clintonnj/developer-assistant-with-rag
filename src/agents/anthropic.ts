import type { Agent } from "./types.ts";
import { getSchema } from "./tools/getSchema.ts";

const MAX_TOOL_ROUNDS = 5;

const TOOLS = [
  {
    name: "get_schema",
    description: "Retrieve the full definition of a schema by its exact name.",
    input_schema: {
      type: "object",
      properties: {
        schema_name: {
          type: "string",
          description: "The exact schema name to retrieve.",
        },
      },
      required: ["schema_name"],
      additionalProperties: false,
    },
  },
] as const;

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicMessageResponse {
  stop_reason: string | null;
  content: AnthropicContentBlock[];
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

async function executeTool(name: string, input: unknown): Promise<string> {
  if (name !== "get_schema") {
    throw new Error(`Unsupported Anthropic tool: ${name}`);
  }
  if (
    typeof input !== "object" ||
    input === null ||
    !("schema_name" in input) ||
    typeof input.schema_name !== "string"
  ) {
    throw new Error("get_schema requires a string schema_name");
  }

  return getSchema(input.schema_name);
}

export class AnthropicAgent implements Agent {
  async sendPrompt(prompt: string): Promise<string> {
    try {
      const endpoint = process.env.ANTHROPIC_ENDPOINT;
      if (!endpoint) {
        throw new Error("ANTHROPIC_ENDPOINT is not set");
      }

      const messages: AnthropicMessage[] = [{ role: "user", content: prompt }];

      for (let toolRound = 0; toolRound <= MAX_TOOL_ROUNDS; toolRound++) {
        const response = await fetch(`${endpoint}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
            ...(process.env.AI_WORKSPACE_ID && {
              "anthropic-workspace-id": process.env.AI_WORKSPACE_ID,
            }),
          },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL,
            max_tokens: 6144,
            messages,
            tools: TOOLS,
          }),
        });

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

        const data = (await response.json()) as AnthropicMessageResponse;

        if (data.stop_reason === "max_tokens") {
          console.warn("Anthropic response was truncated (stop_reason: max_tokens) - consider raising max_tokens.");
        }

        if (data.stop_reason !== "tool_use") {
          return data.content
            .filter((item) => item.type === "text")
            .map((item) => item.text ?? "")
            .join("\n");
        }

        if (toolRound === MAX_TOOL_ROUNDS) {
          throw new Error(`Anthropic exceeded the maximum of ${MAX_TOOL_ROUNDS} tool rounds`);
        }

        const toolCalls = data.content.filter((item) => item.type === "tool_use");
        if (toolCalls.length === 0) {
          throw new Error("Anthropic reported tool_use without returning a tool call");
        }

        messages.push({ role: "assistant", content: data.content });
        const toolResults: ToolResultBlock[] = await Promise.all(
          toolCalls.map(async (item) => {
            if (!item.id || !item.name) {
              throw new Error("Anthropic returned a tool call without an id or name");
            }
            return {
              type: "tool_result",
              tool_use_id: item.id,
              content: await executeTool(item.name, item.input),
            };
          }),
        );
        messages.push({ role: "user", content: toolResults });
      }

      throw new Error("Anthropic tool loop ended unexpectedly");
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
