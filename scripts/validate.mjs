#!/usr/bin/env node
// Validates catalog.json and prices.json against their schemas and the gateway's rules.
//
//   node scripts/validate.mjs            in OpenPike/models
//   node validate/validate.mjs           in packages/providers of the monorepo
//
// Node 20 or later, no install needed. Exits 1 and lists every problem when a file is invalid.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCatalog, checkPrices } from "./rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => {
  try {
    return JSON.parse(readFileSync(join(root, name), "utf8"));
  } catch (error) {
    console.error(`${name}: ${error.message}`);
    process.exit(1);
  }
};

const catalog = read("catalog.json");
const catalogErrors = checkCatalog(catalog, read("catalog.schema.json"));
const priceErrors = catalogErrors.length ? [] : checkPrices(read("prices.json"), read("prices.schema.json"), catalog);
const errors = [...catalogErrors.map((e) => `catalog.json: ${e}`), ...priceErrors.map((e) => `prices.json: ${e}`)];

if (errors.length) {
  for (const error of errors) console.error(error);
  if (catalogErrors.length) console.error("prices.json was not checked: fix catalog.json first.");
  process.exit(1);
}
const count = Object.keys(read("prices.json").prices).length;
console.log(`ok: ${catalog.providers.length} providers, ${count} priced models`);
