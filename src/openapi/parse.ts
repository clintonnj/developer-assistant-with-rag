import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { JsonSchemaNode, Schema, Relationship } from "../chunker/schemas.ts";
import type { Operation, OperationParameter, OperationResponse, SchemaRef } from "../chunker/operations.ts";

interface OpenApiParameterObject {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: { type?: string };
}

interface OpenApiMediaTypeObject {
  schema?: { $ref?: string };
}

interface OpenApiResponseObject {
  description?: string;
  content?: Record<string, OpenApiMediaTypeObject>;
}

interface OpenApiOperationObject {
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameterObject[];
  requestBody?: { content?: Record<string, OpenApiMediaTypeObject> };
  responses?: Record<string, OpenApiResponseObject>;
}

interface OpenApiPathItem {
  parameters?: OpenApiParameterObject[];
  [method: string]: unknown;
}

export interface OpenApiDocument {
  paths: Record<string, OpenApiPathItem>;
  components: { schemas: Record<string, JsonSchemaNode> };
}

// Only these keys are HTTP methods - a path item can also carry its own "parameters" (shared
// across every method on that path, merged in below), which isn't an operation to iterate over.
const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head", "trace"] as const;

export function parseOpenApiDocument(filePath: URL): OpenApiDocument {
  return parseYaml(readFileSync(filePath, "utf-8"));
}

// Operation ids follow the same shape as the original knowledge.json generation step:
// method + sanitized path, case preserved (e.g. "post_entrygate_rest_request_airShopping").
// Any run of non-alphanumeric characters (including the known stray "}" source bug - see
// PLAN.md) becomes one underscore, trimmed at the ends.
function toOperationId(method: string, path: string): string {
  const pathSegment = path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${method.toLowerCase()}_${pathSegment}`;
}

function schemaRefFrom(mediaTypes: Record<string, OpenApiMediaTypeObject> | undefined): SchemaRef | undefined {
  const ref = mediaTypes?.["application/json"]?.schema?.$ref;
  if (!ref) return undefined;
  return { name: ref.split("/").pop()!, reference: ref };
}

function toParameters(parameters: OpenApiParameterObject[] | undefined): OperationParameter[] | undefined {
  return parameters?.map((param) => ({
    name: param.name,
    location: param.in,
    required: Boolean(param.required),
    description: param.description,
    type: param.schema?.type ?? "string",
  }));
}

function toResponses(responses: Record<string, OpenApiResponseObject> | undefined): OperationResponse[] | undefined {
  if (!responses) return undefined;
  return Object.entries(responses).map(([statusCode, response]) => {
    const ref = schemaRefFrom(response.content);
    return { statusCode, description: response.description, schemas: ref ? [ref] : [] };
  });
}

export function extractOperations(doc: OpenApiDocument): Operation[] {
  const operations: Operation[] = [];
  for (const [path, pathItem] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as OpenApiOperationObject | undefined;
      if (!operation) continue;

      const requestRef = schemaRefFrom(operation.requestBody?.content);
      operations.push({
        id: toOperationId(method, path),
        method: method.toUpperCase(),
        path,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        parameters: toParameters([...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]),
        requestSchemas: requestRef ? [requestRef] : [],
        responses: toResponses(operation.responses),
      });
    }
  }
  return operations;
}

// Derived straight from each operation's own requestSchemas/responses rather than re-scanning
// the raw document - those are already the resolved {name, reference} pairs.
export function extractRelationships(operations: Operation[]): Relationship[] {
  const relationships: Relationship[] = [];
  for (const operation of operations) {
    for (const ref of operation.requestSchemas ?? []) {
      relationships.push({ sourceId: operation.id, targetId: ref.name, type: "USES_SCHEMA" });
    }
    for (const response of operation.responses ?? []) {
      for (const ref of response.schemas ?? []) {
        relationships.push({ sourceId: operation.id, targetId: ref.name, type: "RETURNS_SCHEMA" });
      }
    }
  }
  return relationships;
}

// components.schemas nodes are already the same shape chunkSchemas expects (no $refs inside
// them - verified they don't reference each other, only paths' requestBody/response schemas do).
export function extractSchemas(doc: OpenApiDocument): Schema[] {
  return Object.entries(doc.components.schemas).map(([name, jsonSchema]) => ({ name, jsonSchema }));
}
