import { ChangeDetectionStrategy, Component, computed, inject, input } from "@angular/core";
import { JsonPipe } from "@angular/common";
import type { AnswerBlock } from "@dev-assistant/shared-types";

import { MarkdownService } from "../../shared/markdown.service";

@Component({
  selector: "app-answer-block",
  imports: [JsonPipe],
  templateUrl: "./answer-block.html",
  styleUrl: "./answer-block.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnswerBlockComponent {
  private readonly markdown = inject(MarkdownService);

  readonly block = input.required<AnswerBlock>();

  // Angular's [innerHTML] binding sanitizes this automatically (it is a plain
  // string, not a SafeHtml) — important because retrieved doc text can contain
  // literal "<Tag>"-style angle brackets that the LLM echoes verbatim.
  readonly html = computed(() => {
    const block = this.block();
    return block.type === "text" ? this.markdown.toHtml(block.markdown) : null;
  });

  readonly highlightedCode = computed(() => {
    const block = this.block();
    return block.type === "code" ? this.markdown.highlightJson(block.content) : null;
  });
}
