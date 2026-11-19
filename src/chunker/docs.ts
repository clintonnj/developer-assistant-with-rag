import type { Chunk } from "./types.ts";
import { slugify } from "./text.ts";

interface HttpHeader {
  key: string;
  value: string;
  remarks?: string;
}

interface Documentation {
  general: string;
  authentication: {
    loginUrl: string;
    authorizationType: string;
    notes: string[];
    operationId: string;
  };
  serviceApi: {
    baseUrlPattern: string;
    httpHeaders: HttpHeader[];
  };
  messages: Record<string, string>;
  workflows: Record<string, string>;
  searchFeatures: Record<string, string>;
}

interface KnowledgeWithDocs {
  documentation: Documentation;
}

function chunkGeneral(doc: Documentation): Chunk {
  return {
    sourceType: "doc",
    sourceId: "general",
    title: "General",
    text: doc.general,
    metadata: { section: "general" },
  };
}

function chunkAuthentication(doc: Documentation): Chunk {
  const auth = doc.authentication;
  const lines = [
    "Authentication",
    "",
    `Login URL: ${auth.loginUrl}`,
    `Authorization type: ${auth.authorizationType}`,
    "Notes:",
    ...auth.notes.map((note) => `- ${note}`),
    `Related operation: ${auth.operationId}`,
  ];
  return {
    sourceType: "doc",
    sourceId: "authentication",
    title: "Authentication",
    text: lines.join("\n"),
    metadata: { section: "authentication", operationId: auth.operationId },
  };
}

function chunkServiceApi(doc: Documentation): Chunk {
  const api = doc.serviceApi;
  const headerLines = api.httpHeaders.map((header) => {
    const remarks = header.remarks ? ` — ${header.remarks}` : "";
    return `- ${header.key}: ${header.value}${remarks}`;
  });
  const lines = ["Service API & Headers", "", `Base URL pattern: ${api.baseUrlPattern}`, "", "HTTP headers:", ...headerLines];
  return {
    sourceType: "doc",
    sourceId: "service-api-headers",
    title: "Service API & Headers",
    text: lines.join("\n"),
    metadata: { section: "serviceApi" },
  };
}

// messages, workflows and searchFeatures are all the same shape: name -> description.
function chunkNamedTopics(topics: Record<string, string>, section: string): Chunk[] {
  return Object.entries(topics).map(([name, description]) => ({
    sourceType: "doc",
    sourceId: `${section}-${slugify(name)}`,
    title: name,
    text: `${name}: ${description}`,
    metadata: { section },
  }));
}

export function chunkDocs(knowledge: KnowledgeWithDocs): Chunk[] {
  const doc = knowledge.documentation;
  return [
    chunkGeneral(doc),
    chunkAuthentication(doc),
    chunkServiceApi(doc),
    ...chunkNamedTopics(doc.messages, "messages"),
    ...chunkNamedTopics(doc.workflows, "workflows"),
    ...chunkNamedTopics(doc.searchFeatures, "search-features"),
  ];
}
