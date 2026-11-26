import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import type { AgentProvider } from "@dev-assistant/shared-types";

import { AnswerBlockComponent } from "./answer-block/answer-block";
import type { ChatMessage } from "./chat-message.model";
import { ChatService } from "./chat.service";

@Component({
  selector: "app-chat",
  imports: [FormsModule, AnswerBlockComponent],
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

  ask(): void {
    const question = this.question().trim();
    if (!question || this.loading()) {
      return;
    }

    const provider = this.provider();
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: question };
    const pendingMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      pending: true,
    };

    this.messages.update((messages) => [...messages, userMessage, pendingMessage]);
    this.question.set("");
    this.loading.set(true);

    this.chatService.ask({ question, provider }).subscribe({
      next: (response) => {
        this.replaceMessage(pendingMessage.id, {
          ...pendingMessage,
          text: response.answer,
          blocks: response.blocks,
          sources: response.chunks,
          provider: response.provider,
          pending: false,
        });
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
}
