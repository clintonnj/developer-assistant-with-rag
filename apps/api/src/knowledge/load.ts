import type { chunkOperations } from "../chunker/operations.ts";
import type { chunkSchemas } from "../chunker/schemas.ts";
import { parseOpenApiDocument, extractOperations, extractRelationships, extractSchemas } from "../openapi/parse.ts";

export type Knowledge = Parameters<typeof chunkOperations>[0] & Parameters<typeof chunkSchemas>[0];

const OPENAPI_PATH = new URL("../../corpus/schemas/vdc-schema1.yaml", import.meta.url);

// Operations, schemas and their relationships are derived fresh from the OpenAPI spec on every
// call - no pre-generated JSON in between, so editing the spec and re-running ingestion picks up
// the change.
export function loadKnowledge(): Knowledge {
  const openApiDoc = parseOpenApiDocument(OPENAPI_PATH);
  const operations = extractOperations(openApiDoc);

  return {
    operations,
    schemas: extractSchemas(openApiDoc),
    relationships: extractRelationships(operations),
  };
}
