import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { parse } from "yaml";

/**
 * Validates HTTP test responses against docs/api/openapi.yaml (design: contract checks), so drift
 * between the API and the contract the web app is generated from fails the tests.
 */

type Json = Record<string, unknown>;

const doc = parse(
  readFileSync(new URL("../../../../docs/api/openapi.yaml", import.meta.url), "utf8"),
) as Json;
const paths = doc.paths as Record<string, Record<string, Json>>;

/**
 * Known contract defect, reported to the lead: `SettingsView` is `allOf: [Settings, {...}]` and
 * `Settings` has `additionalProperties: false`, which in JSON Schema rejects the other branch's
 * properties, so no SettingsView could ever validate. Schemas used as `allOf` members are checked
 * without `additionalProperties` here (responses only; requests are validated by Zod in the API).
 */
function relaxAllOfMembers(document: Json): void {
  const schemas = (document.components as Json).schemas as Record<string, Json>;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const obj = node as Json;
    if (Array.isArray(obj.allOf)) {
      for (const member of obj.allOf as Json[]) {
        const ref =
          typeof member.$ref === "string"
            ? member.$ref.replace("#/components/schemas/", "")
            : undefined;
        const target = ref ? schemas[ref] : member;
        if (target) delete target.additionalProperties;
      }
    }
    Object.values(obj).forEach(visit);
  };
  visit(document);
}
relaxAllOfMembers(doc);

// ajv-formats is CommonJS; under NodeNext its default export arrives as the module namespace.
const addFormats = addFormatsModule.default;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addFormat("binary", true);
ajv.addSchema(doc, "openapi");

const escape = (segment: string) => segment.replace(/~/g, "~0").replace(/\//g, "~1");

const templates = Object.keys(paths).map((template) => ({
  template,
  regex: new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+").replace(/\./g, "\\.")}$`),
  isStatic: !template.includes("{"),
}));

export function matchTemplate(urlPath: string): string | undefined {
  const matches = templates.filter((t) => t.regex.test(urlPath));
  return (matches.find((t) => t.isStatic) ?? matches[0])?.template;
}

function resolveResponse(response: Json): { response: Json; pointer: string | undefined } {
  const ref = response.$ref;
  if (typeof ref === "string") {
    const name = ref.replace("#/components/responses/", "");
    const resolved = ((doc.components as Json).responses as Json)[name] as Json;
    return { response: resolved, pointer: `#/components/responses/${escape(name)}` };
  }
  return { response, pointer: undefined };
}

export interface ContractResponse {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: string;
}

/** Throws with a readable message when the response does not match the documented operation. */
export function assertMatchesContract(method: string, url: string, res: ContractResponse): void {
  const urlPath = url.split("?")[0] as string;
  const template = matchTemplate(urlPath);
  const lower = method.toLowerCase();
  const operation = template ? paths[template]?.[lower] : undefined;
  const contentType = String(res.headers["content-type"] ?? "");

  if (!operation) {
    // Not a documented operation (unknown path, HEAD): any body must still be the Error shape.
    if (res.body && contentType.startsWith("application/json")) {
      validate("#/components/schemas/Error", JSON.parse(res.body), `${method} ${urlPath}`);
    }
    return;
  }

  const responses = operation.responses as Json;
  const raw = responses[String(res.statusCode)] as Json | undefined;
  if (!raw && res.statusCode === 500) {
    // info.description: every operation may answer the generic 5xx Error body.
    validate("#/components/schemas/Error", JSON.parse(res.body), `${method} ${template} 500`);
    return;
  }
  if (!raw) {
    throw new Error(
      `Contract: ${method} ${template} answered ${res.statusCode}, which the contract does not document (body: ${res.body.slice(0, 300)})`,
    );
  }
  const { response, pointer } = resolveResponse(raw);
  const basePointer =
    pointer ?? `#/paths/${escape(template as string)}/${lower}/responses/${res.statusCode}`;
  const content = response.content as Record<string, Json> | undefined;

  if (!content) {
    if (res.body !== "")
      throw new Error(`Contract: ${method} ${template} ${res.statusCode} must have no body`);
    return;
  }
  const mediaType = contentType.split(";")[0]?.trim() ?? "";
  if (!(mediaType in content)) {
    throw new Error(
      `Contract: ${method} ${template} ${res.statusCode} sent ${mediaType}, documented: ${Object.keys(content).join(", ")}`,
    );
  }
  if (mediaType === "application/json") {
    validate(
      `${basePointer}/content/application~1json/schema`,
      JSON.parse(res.body),
      `${method} ${template} ${res.statusCode}`,
    );
  }
}

function validate(pointer: string, data: unknown, label: string): void {
  const validator = ajv.getSchema(`openapi${pointer}`);
  if (!validator) throw new Error(`Contract: no schema at ${pointer}`);
  if (!validator(data)) {
    throw new Error(
      `Contract: ${label} body does not match: ${ajv.errorsText(validator.errors)}\n${JSON.stringify(data).slice(0, 500)}`,
    );
  }
}

/** The documented operations, for route-table cross-checks. */
export function documentedOperations(): { method: string; path: string }[] {
  return Object.entries(paths).flatMap(([path, ops]) =>
    Object.keys(ops)
      .filter((m) => ["get", "post", "put", "patch", "delete"].includes(m))
      .map((m) => ({ method: m.toUpperCase(), path })),
  );
}
