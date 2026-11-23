import { AnthropicAgent } from "./anthropic.ts";
import { OllamaAgent } from "./ollama.ts";
import type { Agent, AgentProvider } from "./types.ts";

const agents: Record<AgentProvider, Agent> = {
  ollama: new OllamaAgent(),
  anthropic: new AnthropicAgent(),
};

export function getAgent(provider: AgentProvider): Agent {
  return agents[provider];
}

export type { AgentProvider } from "./types.ts";
