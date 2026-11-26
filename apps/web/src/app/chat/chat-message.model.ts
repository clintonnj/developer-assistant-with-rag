import type { AgentProvider, AnswerBlock, ScoredChunk } from "@dev-assistant/shared-types";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks?: AnswerBlock[];
  sources?: ScoredChunk[];
  provider?: AgentProvider;
  pending?: boolean;
  error?: string;
}
