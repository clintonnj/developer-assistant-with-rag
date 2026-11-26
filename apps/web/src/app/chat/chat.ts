import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DecimalPipe } from "@angular/common";
import type { AgentProvider, AskResponse, ChatTurn } from "@dev-assistant/shared-types";

import { AnswerBlockComponent } from "./answer-block/answer-block";
import type { ChatMessage } from "./chat-message.model";
import { ChatService } from "./chat.service";

// Trimmed client-side too (the server also caps this) so the request body doesn't keep growing
// unbounded over a long session.
const MAX_HISTORY_TURNS = 12;

@Component({
  selector: "app-chat",
  imports: [DecimalPipe, FormsModule, AnswerBlockComponent],
  templateUrl: "./chat.html",
  styleUrl: "./chat.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Chat {
  private readonly chatService = inject(ChatService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly question = signal("");
  readonly provider = signal<AgentProvider>("anthropic");
  readonly loading = signal(false);
  readonly historyMessagesSent = signal(0);
  readonly lastUsage = signal<AskResponse["usage"] | undefined>(undefined);
  readonly lastUsageProvider = signal<AgentProvider | undefined>(undefined);

  ask(): void {
    const question = this.question().trim();
    if (!question || this.loading()) {
      return;
    }

    const provider = this.provider();
    const history = this.buildHistory();
    this.historyMessagesSent.set(history.length);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: question };
    const pendingMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      pending: true,
    };

    this.messages.update((messages) => [...messages, userMessage, pendingMessage]);
    this.question.set("");
    this.lastUsage.set(undefined);
    this.lastUsageProvider.set(undefined);
    this.loading.set(true);

    this.chatService.ask({ question, provider, history }).subscribe({
      next: (response) => {
        this.replaceMessage(pendingMessage.id, {
          ...pendingMessage,
          text: response.answer,
          blocks: response.blocks,
          sources: response.chunks,
          provider: response.provider,
          pending: false,
        });
        this.lastUsage.set(response.usage);
        this.lastUsageProvider.set(provider);
        this.loading.set(false);
      },
      error: (err) => {
        this.replaceMessage(pendingMessage.id, {
          ...pendingMessage,
          pending: false,
          error: err?.error?.error ?? "Something went wrong answering that question.",
        });
        this.loading.set(false);
      },
    });
  }

  private replaceMessage(id: string, next: ChatMessage): void {
    this.messages.update((messages) => messages.map((message) => (message.id === id ? next : message)));
  }

  private buildHistory(): ChatTurn[] {
    return this.messages()
      .filter((message) => !message.pending && !message.error)
      .map((message): ChatTurn => ({ role: message.role, text: message.text }))
      .slice(-MAX_HISTORY_TURNS);
  }
}
