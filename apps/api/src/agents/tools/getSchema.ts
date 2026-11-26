import { fileURLToPath } from "node:url";
import { getSchemaData, loadSpec } from "./schema-tool.ts";

const SPEC_PATH = fileURLToPath(new URL("../../../corpus/schemas/vdc-schema1.yaml", import.meta.url));

// Load once, reused across calls instead of re-bundling the spec on every tool invocation.
let specLoaded: Promise<unknown> | undefined;

export async function ensureSchemaSpecLoaded(): Promise<void> {
  specLoaded ??= loadSpec(SPEC_PATH);
  await specLoaded;
}

export async function getSchema(schemaName: string): Promise<string> {
  await ensureSchemaSpecLoaded();
  return getSchemaData({ schemaName });
}
