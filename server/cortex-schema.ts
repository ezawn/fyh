/**
 * SERVER LANE. Turns the zod-generated JSON Schema into something Cortex AI_COMPLETE
 * structured output accepts. Pure (no Snowflake imports) so scripts can use it offline.
 *
 * What z.toJSONSchema (draft-7) emits for our contract, and what we do with it:
 *  - minimum/maximum/minLength/maxLength/pattern/minItems/maxItems/...  -> stripped
 *    (Cortex rejects them; validateCartridge enforces the bounds instead)
 *  - tuples (rig pivots [x, y]) as `items: [..]` + `additionalItems`    -> `items: <one schema>`
 *  - discriminated unions (Shape rect|circle) as `oneOf`                -> `anyOf`
 *  - unions of literals (ability slot 1|2|3|4) as `anyOf` of `const`   -> one `enum`
 *  - `const`                                                           -> one-value `enum`
 *  - `$schema`, `$id`, `default`, `examples`, `not`, `if/then/else`    -> stripped
 * Set CORTEX_FLATTEN_UNIONS=1 to also merge object unions into one object
 * (fallback if a model rejects anyOf).
 */

/** Keywords Cortex structured output rejects or that we drop as unsupported/unneeded. */
const STRIP = new Set([
  "multipleOf", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minLength", "maxLength", "format", "pattern",
  "uniqueItems", "contains", "minContains", "maxContains", "minItems", "maxItems", "additionalItems",
  "patternProperties", "minProperties", "maxProperties", "propertyNames",
  "$schema", "$id", "default", "examples", "not", "if", "then", "else", "dependencies",
  "dependentRequired", "dependentSchemas", "unevaluatedProperties", "unevaluatedItems", "prefixItems",
]);

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

export type SafeSchemaOptions = { flattenUnions?: boolean };

export function cortexSafeSchema(schema: unknown, opts: SafeSchemaOptions = {}): unknown {
  const flatten = opts.flattenUnions ?? process.env.CORTEX_FLATTEN_UNIONS === "1";
  return clean(schema, flatten);
}

function clean(node: unknown, flatten: boolean): unknown {
  if (Array.isArray(node)) return node.map((n) => clean(n, flatten));
  if (!isObj(node)) return node;

  const out: Json = {};
  for (const [k, v] of Object.entries(node)) {
    if (STRIP.has(k)) continue;
    if (k === "properties" && isObj(v)) {
      // Keys here are field names, not keywords: keep them all.
      out.properties = Object.fromEntries(Object.entries(v).map(([name, sub]) => [name, clean(sub, flatten)]));
    } else if (k === "$defs" || k === "definitions") {
      out[k] = isObj(v) ? Object.fromEntries(Object.entries(v).map(([name, sub]) => [name, clean(sub, flatten)])) : v;
    } else if (k === "items" && Array.isArray(v)) {
      out.items = mergeTupleItems(v.map((n) => clean(n, flatten)));
    } else if (k === "oneOf") {
      out.anyOf = clean(v, flatten);
    } else if (k === "const") {
      out.enum = [v];
    } else {
      out[k] = clean(v, flatten);
    }
  }
  // prefixItems (draft 2020-12 tuples) -> plain items
  if (Array.isArray(node.prefixItems) && out.items === undefined) {
    out.items = mergeTupleItems(node.prefixItems.map((n) => clean(n, flatten)));
  }
  if (!out.type && out.items !== undefined) out.type = "array";

  if (Array.isArray(out.anyOf)) return simplifyUnion(out, flatten);
  return out;
}

/** A tuple becomes a plain array of the (merged) item schema. */
function mergeTupleItems(items: unknown[]): unknown {
  if (items.length === 0) return {};
  const first = JSON.stringify(items[0]);
  if (items.every((i) => JSON.stringify(i) === first)) return items[0];
  return { anyOf: items };
}

function simplifyUnion(node: Json, flatten: boolean): Json {
  const branches = node.anyOf as unknown[];
  const rest = Object.fromEntries(Object.entries(node).filter(([k]) => k !== "anyOf"));

  // Single branch: inline it.
  if (branches.length === 1 && isObj(branches[0])) return { ...rest, ...branches[0] };

  // Union of enums/consts of one primitive type -> one enum.
  const enumOnly = branches.every((b) => isObj(b) && Array.isArray(b.enum) && Object.keys(b).every((k) => k === "enum" || k === "type"));
  if (enumOnly) {
    const types = new Set(branches.map((b) => (b as Json).type).filter(Boolean));
    if (types.size <= 1) {
      const values = [...new Set(branches.flatMap((b) => (b as Json).enum as unknown[]))];
      const type = [...types][0] ?? inferType(values);
      return { ...rest, ...(type ? { type } : {}), enum: values };
    }
  }

  // Optional fallback: merge object unions into one object.
  if (flatten && branches.every((b) => isObj(b) && b.type === "object" && isObj(b.properties))) {
    const properties: Json = {};
    const requiredSets = branches.map((b) => new Set(((b as Json).required as string[]) ?? []));
    for (const b of branches as Json[]) {
      for (const [name, sub] of Object.entries(b.properties as Json)) {
        const prev = properties[name];
        if (isObj(prev) && isObj(sub) && Array.isArray(prev.enum) && Array.isArray(sub.enum)) {
          properties[name] = { ...prev, enum: [...new Set([...prev.enum, ...sub.enum])] };
        } else if (prev === undefined) {
          properties[name] = sub;
        }
      }
    }
    const required = Object.keys(properties).filter((name) => requiredSets.every((s) => s.has(name)));
    return { ...rest, type: "object", properties, required };
  }

  return node;
}

function inferType(values: unknown[]): string | undefined {
  if (values.every((v) => typeof v === "string")) return "string";
  if (values.every((v) => Number.isInteger(v))) return "integer";
  if (values.every((v) => typeof v === "number")) return "number";
  if (values.every((v) => typeof v === "boolean")) return "boolean";
  return undefined;
}

// ---------------------------------------------------------------------------
// Risk report (used by server/print-schema.ts)
// ---------------------------------------------------------------------------

const ALLOWED = new Set(["type", "properties", "required", "items", "enum", "anyOf", "additionalProperties", "description", "title", "$defs", "$ref"]);
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

export type SchemaRisks = { keywords: Record<string, number>; badPropertyNames: string[]; refs: string[]; nestedDefs: string[] };

/** Lists every keyword outside a conservative allow-list, odd property names, and $ref/$defs placement. */
export function schemaRisks(schema: unknown): SchemaRisks {
  const risks: SchemaRisks = { keywords: {}, badPropertyNames: [], refs: [], nestedDefs: [] };
  const walk = (node: unknown, path: string, depth: number) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`, depth));
    if (!isObj(node)) return;
    for (const [k, v] of Object.entries(node)) {
      if (k === "properties" && isObj(v)) {
        for (const [name, sub] of Object.entries(v)) {
          if (!SAFE_NAME.test(name)) risks.badPropertyNames.push(`${path}.${name}`);
          walk(sub, `${path}.${name}`, depth + 1);
        }
        continue;
      }
      if (!ALLOWED.has(k)) risks.keywords[k] = (risks.keywords[k] ?? 0) + 1;
      if (k === "$ref") risks.refs.push(`${path}: ${String(v)}`);
      if ((k === "$defs" || k === "definitions") && depth > 0) risks.nestedDefs.push(path);
      walk(v, `${path}.${k}`, depth + 1);
    }
  };
  walk(schema, "$", 0);
  return risks;
}
