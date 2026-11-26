import type { Chunk } from "./types.ts";
import { isUsableDescription, cleanDescription } from "./text.ts";

export interface OperationParameter {
  name: string;
  location: string;
  required: boolean;
  description?: string;
  type: string;
}

export interface SchemaRef {
  name: string;
  reference: string;
}

export interface OperationResponse {
  statusCode: string;
  description?: string;
  schemas?: SchemaRef[];
}

export interface Operation {
  id: string;
  method: string;
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: OperationParameter[];
  requestSchemas?: SchemaRef[];
  responses?: OperationResponse[];
}

interface KnowledgeWithOperations {
  operations: Operation[];
}

// Known source bug: one path ends with a stray "}" that has no matching "{".
function fixPath(path: string): string {
  return path.endsWith("}") && !path.includes("{") ? path.slice(0, -1) : path;
}

function formatParameters(parameters: OperationParameter[] | undefined): string | null {
  if (!parameters || parameters.length === 0) return null;
  const lines = parameters.map((param) => {
    const requiredLabel = param.required ? "required" : "optional";
    const desc = isUsableDescription(param.description) ? `: ${cleanDescription(param.description)}` : "";
    return `- ${param.name} (${param.location}, ${requiredLabel})${desc}`;
  });
  return `Parameters:\n${lines.join("\n")}`;
}

function formatRequestSchemas(requestSchemas: SchemaRef[] | undefined): string | null {
  if (!requestSchemas || requestSchemas.length === 0) return null;
  return `Request schema: ${requestSchemas.map((s) => s.name).join(", ")}`;
}

function formatResponses(responses: OperationResponse[] | undefined): string | null {
  if (!responses || responses.length === 0) return null;
  const lines = responses.map((response) => {
    const schemaNames = (response.schemas ?? []).map((s) => s.name).join(", ") || "none";
    const desc = isUsableDescription(response.description) ? ` ${cleanDescription(response.description)}` : "";
    return `- ${response.statusCode}${desc} -> ${schemaNames}`;
  });
  return `Responses:\n${lines.join("\n")}`;
}

function toChunkText(operation: Operation): string {
  const sections = [
    `Operation: ${operation.summary}`,
    `Method: ${operation.method}`,
    `Path: ${fixPath(operation.path)}`,
    operation.tags?.length ? `Tags: ${operation.tags.join(", ")}` : null,
    isUsableDescription(operation.description)
      ? `Description:\n${cleanDescription(operation.description)}`
      : null,
    formatParameters(operation.parameters),
    formatRequestSchemas(operation.requestSchemas),
    formatResponses(operation.responses),
  ];
  return sections.filter((section): section is string => section !== null).join("\n\n");
}

export function chunkOperations(knowledge: KnowledgeWithOperations): Chunk[] {
  return knowledge.operations.map((operation) => ({
    sourceType: "operation",
    sourceId: operation.id,
    title: operation.summary,
    text: toChunkText(operation),
    metadata: {
      method: operation.method,
      path: fixPath(operation.path),
      tags: operation.tags ?? [],
      requestSchemas: (operation.requestSchemas ?? []).map((s) => s.name),
      responseSchemas: (operation.responses ?? []).flatMap((r) => (r.schemas ?? []).map((s) => s.name)),
    },
  }));
}
