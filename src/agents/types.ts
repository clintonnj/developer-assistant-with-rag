export interface Agent {
  sendPrompt(prompt: string): Promise<AgentAnswer>;
}

export type AgentProvider = "ollama" | "anthropic";

export type AnswerBlock =
  | { type: "text"; markdown: string }
  | {
      type: "code";
      language: "json";
      title: string;
      content: string;
      validation?: { valid: boolean; errors?: unknown[] };
    };

export interface AgentAnswer {
  text: string;
  blocks: AnswerBlock[];
}
