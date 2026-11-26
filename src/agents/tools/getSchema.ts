import { fileURLToPath } from "node:url";
import { getSchemaData, loadSpec } from "./schema-tool.ts";

const SPEC_PATH = fileURLToPath(new URL("../../../corpus/schemas/vdc-schema1.yaml", import.meta.url));

// Load once, reused across calls instead of re-bundling the spec on every tool invocation.
let specLoaded: Promise<unknown> | undefined;

export async function getSchema(schemaName: string): Promise<string> {
  specLoaded ??= loadSpec(SPEC_PATH);
  await specLoaded;
  return getSchemaData({ schemaName });
}
