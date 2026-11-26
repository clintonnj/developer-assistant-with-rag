// schema-tool.ts — tool-call handlers that return JSON Schema from an OpenAPI YAML/JSON file.
// Run the demo:  npx tsx schema-tool.ts spec.yaml SchemaName [path] [depth]
// Needs: npm i @apidevtools/swagger-parser

import SwaggerParser from "@apidevtools/swagger-parser";

type Json = any;
const MAX_CHARS = 8000;

let api: Json;

// Load once at startup. bundle() merges external files but KEEPS internal $refs.
// (dereference() would inline everything: huge output, and it breaks on circular refs.)
export async function loadSpec(file: string) {
  api = await SwaggerParser.bundle(file);
  return api;
}

// ---------- helpers ----------
function resolvePointer(ref: string): Json {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref: ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((node, key) => {
      if (node == null || !(key in node)) throw new Error(`Bad $ref: ${ref}`);
      return node[key];
    }, api);
}

// Merge allOf into one object schema (simple merge: properties + required).
function mergeAllOf(node: Json, stack: string[]): Json {
  if (!Array.isArray(node.allOf)) return node;
  const { allOf, ...rest } = node;
  const merged: Json = { ...rest, properties: { ...(rest.properties ?? {}) }, required: [...(rest.required ?? [])] };
  for (const part of allOf) {
    const p = part.$ref ? resolvePointer(part.$ref) : part;
    const flat = mergeAllOf(p, stack);
    Object.assign(merged.properties, flat.properties ?? {});
    merged.required.push(...(flat.required ?? []));
    merged.type ??= flat.type;
    merged.description ??= flat.description;
  }
  if (!merged.required.length) delete merged.required;
  return merged;
}

const refName = (ref: string) => ref.split("/").pop()!;

// ---------- core: depth-limited, cycle-safe expansion ----------
// At the depth limit (or on a cycle) we leave a $ref POINTER instead of expanding,
// so the model can ask for that part with another tool call.
function expand(node: Json, depth: number, stack: string[] = []): Json {
  if (node?.$ref) {
    const ref: string = node.$ref;
    if (stack.includes(ref)) return { $ref: ref, "x-circular": true };
    if (depth <= 0) return { $ref: ref, "x-truncated": true };
    return expand(resolvePointer(ref), depth, [...stack, ref]);
  }
  node = mergeAllOf(node, stack);
  const out: Json = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "properties") {
      if (depth <= 0) {
        out["x-truncated"] = true;
        out.properties = Object.fromEntries(Object.keys(v as object).map((p) => [p, {}])); // names only
      } else {
        out.properties = Object.fromEntries(
          Object.entries(v as Json).map(([p, s]) => [p, expand(s, depth - 1, stack)])
        );
      }
    } else if (k === "items") {
      out.items = depth <= 0 ? { "x-truncated": true } : expand(v as Json, depth - 1, stack);
    } else if (k === "oneOf" || k === "anyOf") {
      out[k] = (v as Json[]).map((s) => expand(s, depth - 1, stack));
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Walk "Response.Order[].OrderItems" style paths inside a schema.
function walk(node: Json, path: string): Json {
  if (!path) return node;
  for (const raw of path.split(".")) {
    const isArray = raw.endsWith("[]");
    const key = isArray ? raw.slice(0, -2) : raw;
    node = node.$ref ? resolvePointer(node.$ref) : node;
    node = mergeAllOf(node, []);
    if (key) {
      node = node.properties?.[key];
      if (!node) throw new Error(`No property "${key}" in path "${path}"`);
    }
    if (isArray) {
      node = node.$ref ? resolvePointer(node.$ref) : node;
      node = node.items;
      if (!node) throw new Error(`"${key}" is not an array`);
    }
  }
  return node;
}

// OpenAPI 3.0 -> JSON Schema (needed before ajv). OpenAPI 3.1 is already JSON Schema.
export function toJsonSchema(node: Json): Json {
  if (Array.isArray(node)) return node.map(toJsonSchema);
  if (node && typeof node === "object") {
    const out: Json = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "nullable" || k === "example" || k === "xml" || k.startsWith("x-")) continue;
      out[k] = toJsonSchema(v);
    }
    if (node.nullable && out.type) out.type = [out.type, "null"];
    return out;
  }
  return node;
}


// Standalone schema for ajv: points at the named schema and carries ALL component schemas
// (converted to JSON Schema) so every $ref resolves, including circular ones.
export function getValidationSchema(schemaName: string) {
  if (!api.components?.schemas?.[schemaName]) throw new Error(`Unknown schema "${schemaName}"`);
  return {
    $ref: `#/components/schemas/${schemaName}`,
    components: { schemas: toJsonSchema(api.components.schemas) },
  };
}

const clip = (s: string) =>
  s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) + "\n...[truncated: request a deeper path or lower depth]" : s;

// ---------- the tool handlers ----------
export function getSchemaData(input: { schemaName: string; path?: string; depth?: number }) {
  const root = api.components?.schemas?.[input.schemaName];
  if (!root) throw new Error(`Unknown schema "${input.schemaName}"`);
  const node = walk(root, input.path ?? "");
  const result = expand(node, input.depth ?? 10, [`#/components/schemas/${input.schemaName}`]);
  return clip(JSON.stringify(result, null, 1));
}

// Which schemas does an operation use? (so the model never guesses names)
export function getOperationSchemas(input: { operationId: string }) {
  for (const [path, item] of Object.entries<Json>(api.paths ?? {})) {
    for (const [method, op] of Object.entries<Json>(item)) {
      if (op?.operationId !== input.operationId) continue;
      const body = op.requestBody?.content?.["application/json"]?.schema;
      const responses = Object.fromEntries(
        Object.entries<Json>(op.responses ?? {}).map(([code, r]) => [
          code,
          r.content?.["application/json"]?.schema?.$ref
            ? refName(r.content["application/json"].schema.$ref)
            : null,
        ])
      );
      return { method: method.toUpperCase(), path, summary: op.summary,
               requestSchema: body?.$ref ? refName(body.$ref) : null, responses };
    }
  }
  throw new Error(`Unknown operationId "${input.operationId}"`);
}
