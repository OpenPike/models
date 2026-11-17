// A small JSON Schema (2020-12) checker for the keywords catalog.schema.json and
// prices.schema.json use. No dependencies, so the public repo's CI needs no install.
// An unsupported keyword is an error, so a schema can never rely on a check that is not run.
// Any standard validator (ajv and others) gives the same answers for these schemas.

const ANNOTATIONS = new Set(["$schema", "$id", "$comment", "title", "description", "examples", "default", "$defs"]);
const SUPPORTED = new Set([
  "$ref", "type", "enum", "const", "pattern", "format", "minimum", "exclusiveMinimum",
  "minLength", "minItems", "uniqueItems", "items", "properties", "required",
  "additionalProperties", "propertyNames", "minProperties",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isUri(value) {
  try {
    return Boolean(new URL(value).protocol);
  } catch {
    return false;
  }
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
}

function at(path, key) {
  return typeof key === "number" ? `${path}[${key}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

/**
 * Validates `value` against `schema`. `root` is the schema that `#/$defs/...` refs resolve in.
 * Returns a list of "path: message" strings, empty when valid.
 */
export function validateSchema(value, schema, root = schema, path = "$") {
  const errors = [];
  for (const key of Object.keys(schema)) {
    if (!ANNOTATIONS.has(key) && !SUPPORTED.has(key)) throw new Error(`schema keyword "${key}" is not supported`);
  }
  if (schema.$ref) {
    const match = /^#\/\$defs\/([\w-]+)$/.exec(schema.$ref);
    if (!match || !root.$defs?.[match[1]]) throw new Error(`cannot resolve $ref ${schema.$ref}`);
    errors.push(...validateSchema(value, root.$defs[match[1]], root, path));
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      return [...errors, `${path}: expected ${types.join(" or ")}, got ${typeOf(value)}`];
    }
  }
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: is too short`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
    if (schema.format === "date" && !isDate(value)) errors.push(`${path}: is not a valid YYYY-MM-DD date`);
    if (schema.format === "uri" && !isUri(value)) errors.push(`${path}: is not a valid URI`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: must be at least ${schema.minimum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      errors.push(`${path}: must be greater than ${schema.exclusiveMinimum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: needs at least ${schema.minItems} item(s)`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      errors.push(`${path}: items must be unique`);
    }
    if (schema.items) value.forEach((item, i) => errors.push(...validateSchema(item, schema.items, root, at(path, i))));
  }
  if (typeOf(value) === "object") {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(`${path}: needs at least ${schema.minProperties} entr(ies)`);
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}: missing required "${key}"`);
    }
    for (const key of keys) {
      if (schema.propertyNames) errors.push(...validateSchema(key, schema.propertyNames, root, `${at(path, key)} (name)`));
      const sub = schema.properties?.[key];
      if (sub) errors.push(...validateSchema(value[key], sub, root, at(path, key)));
      else if (schema.additionalProperties === false) errors.push(`${path}: unknown field "${key}"`);
      else if (typeof schema.additionalProperties === "object") {
        errors.push(...validateSchema(value[key], schema.additionalProperties, root, at(path, key)));
      }
    }
  }
  return errors;
}
