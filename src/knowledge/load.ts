import type { Knowledge } from "../chunker/index.ts";
import { parseOpenApiDocument, extractOperations, extractRelationships, extractSchemas } from "../openapi/parse.ts";

const OPENAPI_PATH = new URL("../../corpus/schemas/vdc-schema1.yaml", import.meta.url);

// Operations, schemas and their relationships are derived fresh from the OpenAPI spec on every
// call - no pre-generated JSON in between, so editing the spec and re-running ingestion picks up
// the change. Documentation-derived chunks (concepts/useCases/workflows/etc.) were dropped: the
// source prose document isn't a standard format the way OpenAPI is, so a hand-built parser over
// it can silently drop content on reformatting in a way that never surfaces as an error.
export function loadKnowledge(): Knowledge {
  const openApiDoc = parseOpenApiDocument(OPENAPI_PATH);
  const operations = extractOperations(openApiDoc);

  return {
    operations,
    schemas: extractSchemas(openApiDoc),
    relationships: extractRelationships(operations),
  };
}
