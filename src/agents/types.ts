export interface Agent {
  sendPrompt(prompt: string): Promise<string>;
}

export type AgentProvider = "ollama" | "anthropic";
