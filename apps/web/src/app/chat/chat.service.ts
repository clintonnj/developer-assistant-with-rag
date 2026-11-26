import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import type { AskRequest, AskResponse } from "@dev-assistant/shared-types";

@Injectable({ providedIn: "root" })
export class ChatService {
  private readonly http = inject(HttpClient);

  ask(request: AskRequest): Observable<AskResponse> {
    return this.http.post<AskResponse>("/api/ask", request);
  }
}
