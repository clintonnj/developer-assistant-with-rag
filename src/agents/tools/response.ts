import Ajv from "ajv";
import {
  getOperationSchemas,
  getSchemaData,
  getValidationSchema,
} from "./schema-tool.ts";
import { ensureSchemaSpecLoaded } from "./getSchema.ts";
import type { AnswerBlock } from "../types.ts";

export type InputBlock = {
  type: "text" | "schema" | "sample";
  markdown?: string;
  schemaName?: string;
  path?: string;
  depth?: number;
  title?: string;
  operationId?: string;
  kind?: "request" | "response";
  json?: unknown;
};

export const respondTool = {
  name: "respond",
  description:
    "Return the final answer as ordered blocks (text, schema, sample). Call exactly once, at the end.",
  input_schema: {
    type: "object" as const,
    properties: {
      blocks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["text", "schema", "sample"] },
            markdown: { type: "string", description: "text blocks" },
            schemaName: { type: "string", description: "schema blocks" },
            path: { type: "string", description: "schema blocks: dot path" },
            depth: { type: "integer", description: "schema blocks: default 3" },
            title: { type: "string", description: "sample blocks" },
            operationId: { type: "string", description: "sample blocks" },
            kind: { type: "string", enum: ["request", "response"], description: "sample blocks" },
            json: { type: "object", description: "sample blocks: the example JSON" },
          },
          required: ["type"],
        },
      },
    },
    required: ["blocks"],
  },
} as const;

type Validator = ((data: unknown) => boolean) & { errors?: unknown[] };
type AjvInstance = { compile(schema: unknown): Validator };
const AjvConstructor = Ajv as unknown as new (options: object) => AjvInstance;
const ajv = new AjvConstructor({ allErrors: true, strict: false });
const validators = new Map<string, Validator>();

function validatorFor(schemaName: string) {
  if (!validators.has(schemaName)) {
    validators.set(schemaName, ajv.compile(getValidationSchema(schemaName)));
  }
  return validators.get(schemaName)!;
}

export async function resolveBlocks(
  blocks: InputBlock[],
): Promise<{ blocks: AnswerBlock[]; errors: string[] }> {
  await ensureSchemaSpecLoaded();

  const out: AnswerBlock[] = [];
  const errors: string[] = [];

  blocks.forEach((block, index) => {
    try {
      if (block.type === "text") {
        out.push({ type: "text", markdown: block.markdown ?? "" });
      } else if (block.type === "schema") {
        if (!block.schemaName) throw new Error(`block ${index}: schemaName is required`);
        const content = getSchemaData({
          schemaName: block.schemaName,
          path: block.path,
          depth: block.depth ?? 3,
        });
        out.push({
          type: "code",
          language: "json",
          title: `${block.schemaName}${block.path ? " > " + block.path : ""}`,
          content,
        });
      } else if (block.type === "sample") {
        if (!block.operationId) throw new Error(`block ${index}: operationId is required`);
        if (!block.kind) throw new Error(`block ${index}: kind is required`);

        const operation = getOperationSchemas({ operationId: block.operationId });
        const schemaName =
          block.kind === "request"
            ? operation.requestSchema
            : Object.entries(operation.responses).find(
                ([code, name]) => code.startsWith("2") && Boolean(name),
              )?.[1];

        if (!schemaName) {
          throw new Error(`no ${block.kind} schema for ${block.operationId}`);
        }

        const validate = validatorFor(schemaName);
        const valid = validate(block.json) as boolean;
        const validationErrors = (validate.errors ?? []).slice(0, 8);
        if (!valid) {
          errors.push(
            `block ${index} ("${block.title}") is invalid against ${schemaName}: ${JSON.stringify(validationErrors)}`,
          );
        }

        out.push({
          type: "code",
          language: "json",
          title: block.title ?? schemaName,
          content: JSON.stringify(block.json, null, 2),
          validation: { valid, errors: valid ? undefined : validationErrors },
        });
      } else {
        errors.push(`block ${index}: unsupported block type`);
      }
    } catch (error) {
      errors.push(`block ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  return { blocks: out, errors };
}

export function answerFromBlocks(blocks: AnswerBlock[]): { text: string; blocks: AnswerBlock[] } {
  const text = blocks
    .filter((block): block is Extract<AnswerBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.markdown)
    .join("\n\n");
  return { text, blocks };
}
