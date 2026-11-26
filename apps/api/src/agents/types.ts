import type { AgentProvider, AnswerBlock } from "@dev-assistant/shared-types";

export type { AgentProvider, AnswerBlock };

export interface Agent {
  sendPrompt(prompt: string): Promise<AgentAnswer>;
}

export interface AgentAnswer {
  text: string;
  blocks: AnswerBlock[];
}
