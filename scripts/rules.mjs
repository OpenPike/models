// Checks for catalog.json and prices.json: the JSON Schemas, then the rules the OpenPike gateway
// relies on that a schema cannot express. Pure functions, no I/O. Used by `validate.mjs` (the
// public repo's CI and `node scripts/validate.mjs`) and by the monorepo's tests.

import { isDate, validateSchema } from "./schema.mjs";

const ROUTING_FIELDS = ["adapter", "baseUrl", "formats", "auth"];

/** Errors in the catalog, as "path: message" strings. Empty when valid. */
export function checkCatalog(catalog, schema) {
  const errors = validateSchema(catalog, schema);
  if (errors.length) return errors;

  const seen = new Map();
  catalog.providers.forEach((p, i) => {
    const path = `catalog.providers[${i}] (${p.slug})`;
    if (seen.has(p.slug)) errors.push(`${path}: duplicate slug, also at providers[${seen.get(p.slug)}]`);
    else seen.set(p.slug, i);

    // An enabled, verified provider receives traffic, so it needs everything an adapter uses.
    if (p.enabled && p.verify !== true) {
      for (const field of ROUTING_FIELDS) {
        if (p[field] == null) errors.push(`${path}: enabled and verified, so "${field}" is required (or set "verify": true)`);
      }
    }
    if (p.verify === true && p.liveTested) errors.push(`${path}: "liveTested" needs a confirmed provider, but "verify" is true`);
    for (const format of Object.keys(p.liveTested ?? {})) {
      if (!(p.formats ?? []).includes(format)) errors.push(`${path}: liveTested.${format} is not one of its formats`);
    }
    if (p.messagesBaseUrl !== undefined && !(p.formats ?? []).includes("messages")) {
      errors.push(`${path}: "messagesBaseUrl" needs "messages" in formats`);
    }
    if (p.messagesBaseUrl !== undefined && p.adapter === "anthropic") {
      errors.push(`${path}: "messagesBaseUrl" is for providers whose adapter is not anthropic`);
    }
    if (p.adapter === "systemone" && !(p.formats ?? []).includes("systemone")) {
      errors.push(`${path}: the systemone adapter needs "systemone" in formats`);
    }
  });
  return errors;
}

/**
 * Errors in the price table, as "path: message" strings. `catalog` must already be valid.
 * `today` (YYYY-MM-DD, UTC) bounds `as_of`: a price cannot have been read in the future.
 */
export function checkPrices(prices, schema, catalog, today = new Date().toISOString().slice(0, 10)) {
  const errors = validateSchema(prices, schema);
  if (errors.length) return errors;

  const slugs = new Set(catalog.providers.map((p) => p.slug));
  // One day of slack for time zones: someone east of UTC may write tomorrow's UTC date.
  const latest = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  for (const [model, price] of Object.entries(prices.prices)) {
    const path = `prices[${JSON.stringify(model)}]`;
    const slug = model.slice(0, model.indexOf("/"));
    if (!slugs.has(slug)) errors.push(`${path}: provider "${slug}" is not in catalog.json`);
    if (price.as_of > latest) errors.push(`${path}: as_of ${price.as_of} is in the future`);
    checkTiers(price.tiers, `${path}.tiers`, errors);

    let previous = null;
    (price.changes ?? []).forEach((change, i) => {
      if (previous !== null && change.from <= previous) {
        errors.push(`${path}.changes[${i}]: from ${change.from} must be after the previous change (${previous}); keep changes oldest first`);
      }
      if (change.from <= price.as_of) {
        errors.push(`${path}.changes[${i}]: from ${change.from} is not after as_of ${price.as_of}; update the base rates instead`);
      }
      checkTiers(change.tiers, `${path}.changes[${i}].tiers`, errors);
      previous = change.from;
    });
  }
  return errors;
}

function checkTiers(tiers, path, errors) {
  const thresholds = new Set();
  for (const [i, tier] of (tiers ?? []).entries()) {
    if (thresholds.has(tier.above_prompt_tokens)) {
      errors.push(`${path}[${i}]: another tier already starts above ${tier.above_prompt_tokens} prompt tokens`);
    }
    thresholds.add(tier.above_prompt_tokens);
  }
}

export { isDate };
