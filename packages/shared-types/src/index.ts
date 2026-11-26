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

export interface ScoredChunk {
  id: number;
  sourceType: string;
  sourceId: string;
  title: string;
  text: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface AskRequest {
  question: string;
  provider?: AgentProvider;
}

export interface AskResponse {
  question: string;
  chunks: ScoredChunk[];
  answer: string;
  blocks: AnswerBlock[];
  provider: AgentProvider;
}

export interface ApiErrorResponse {
  error: string;
}
