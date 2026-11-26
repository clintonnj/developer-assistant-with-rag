import { Injectable } from "@angular/core";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";

hljs.registerLanguage("json", json);

const marked = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code: string, lang: string) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  }),
);

marked.setOptions({ gfm: true, breaks: true });

@Injectable({ providedIn: "root" })
export class MarkdownService {
  toHtml(markdown: string): string {
    return marked.parse(markdown, { async: false });
  }

  highlightJson(content: string): string {
    return hljs.highlight(content, { language: "json" }).value;
  }
}
