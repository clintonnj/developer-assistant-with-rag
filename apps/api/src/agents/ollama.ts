import { Agent as UndiciAgent } from "undici";
import type { Agent, AgentAnswer, ChatTurn } from "./types.ts";
import { getSchema } from "./tools/getSchema.ts";
import { answerFromBlocks, resolveBlocks, respondTool, type InputBlock } from "./tools/response.ts";

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

const MAX_TOOL_ROUNDS = 5;
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_schema",
      description: "Retrieve the full definition of a schema by its exact name.",
      parameters: {
        type: "object",
        properties: {
          schema_name: {
            type: "string",
            description: "The exact schema name to retrieve.",
          },
        },
        required: ["schema_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: respondTool.name,
      description: respondTool.description,
      parameters: respondTool.input_schema,
    },
  },
] as const;

function parseToolArguments(argumentsJson: unknown): Record<string, unknown> {
  if (typeof argumentsJson === "string") {
    return JSON.parse(argumentsJson) as Record<string, unknown>;
  }
  if (typeof argumentsJson === "object" && argumentsJson !== null) {
    return argumentsJson as Record<string, unknown>;
  }
  throw new Error("Tool call returned invalid arguments");
}

export class OllamaAgent implements Agent {
  async sendPrompt(_prompt: string, history: ChatTurn[] = []): Promise<AgentAnswer> {
    try {
    let inputTokens = 0;
    let outputTokens = 0;
    let hasUsage = false;
    const endpoint = process.env.OLLAMA_AI_ENDPOINT;
    if (!endpoint) {
      throw new Error("OLLAMA_AI_ENDPOINT is not set");
    }

    const messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }> = [
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
      { role: "user", content: _prompt },
    ];

    for (let toolRound = 0; toolRound <= MAX_TOOL_ROUNDS; toolRound++) {
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
        messages,
        tools: TOOLS,
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
    if (
      typeof data.prompt_eval_count === "number" &&
      Number.isFinite(data.prompt_eval_count) &&
      typeof data.eval_count === "number" &&
      Number.isFinite(data.eval_count)
    ) {
      inputTokens += data.prompt_eval_count;
      outputTokens += data.eval_count;
      hasUsage = true;
    }

    if (data.done_reason === "length") {
      console.warn("Ollama response was truncated (done_reason: length) - consider raising num_predict.");
    }

    const toolCalls = data.message?.tool_calls as
      | Array<{ function?: { name?: string; arguments?: unknown } }>
      | undefined;

    if (!toolCalls?.length) {
      const text = typeof data.message?.content === "string" ? data.message.content : "";
      if (text.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(text) as { blocks?: InputBlock[] };
          if (Array.isArray(parsed.blocks)) {
            const resolved = await resolveBlocks(parsed.blocks);
            if (!resolved.errors.length) {
              return {
                ...answerFromBlocks(resolved.blocks),
                ...(hasUsage && { usage: { inputTokens, outputTokens } }),
              };
            }
          }
        } catch {
          // Fall through to a plain text block.
        }
      }
      return {
        text,
        blocks: text ? [{ type: "text", markdown: text }] : [],
        ...(hasUsage && { usage: { inputTokens, outputTokens } }),
      };
    }

    if (toolRound === MAX_TOOL_ROUNDS) {
      throw new Error(`Ollama exceeded the maximum of ${MAX_TOOL_ROUNDS} tool rounds`);
    }

    messages.push({ role: "assistant", content: data.message?.content ?? "" });

    for (const toolCall of toolCalls) {
      const name = toolCall.function?.name;
      if (!name) throw new Error("Ollama returned a tool call without a name");
      const input = parseToolArguments(toolCall.function?.arguments);

      if (name === "respond") {
        if (!Array.isArray(input.blocks)) {
          throw new Error("respond requires an ordered blocks array");
        }
        const resolved = await resolveBlocks(input.blocks as InputBlock[]);
        if (resolved.errors.length) {
          messages.push({
            role: "tool",
            content: "Fix these and call respond again:\n" + resolved.errors.join("\n"),
          });
        } else {
          return answerFromBlocks(resolved.blocks);
        }
      } else if (name === "get_schema") {
        if (typeof input.schema_name !== "string") {
          throw new Error("get_schema requires a string schema_name");
        }
        messages.push({ role: "tool", content: await getSchema(input.schema_name) });
      } else {
        throw new Error(`Unsupported Ollama tool: ${name}`);
      }
    }
    }

    throw new Error("Ollama tool loop ended unexpectedly");

  } catch (error) {
    console.error(error);
    throw error;
  }
  }
}
