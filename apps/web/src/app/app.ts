import { ChangeDetectionStrategy, Component } from "@angular/core";

import { Chat } from "./chat/chat";

@Component({
  selector: "app-root",
  imports: [Chat],
  templateUrl: "./app.html",
  styleUrl: "./app.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
