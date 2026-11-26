import type { AgentProvider, AnswerBlock, ChatTurn, TokenUsage } from "@dev-assistant/shared-types";

export type { AgentProvider, AnswerBlock, ChatTurn, TokenUsage };

export interface Agent {
  sendPrompt(prompt: string, history?: ChatTurn[]): Promise<AgentAnswer>;
}

export interface AgentAnswer {
  text: string;
  blocks: AnswerBlock[];
  usage?: TokenUsage;
}
