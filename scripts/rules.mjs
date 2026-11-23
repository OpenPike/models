// Checks for catalog.json and prices.json: the JSON Schemas, then the rules the OpenPike gateway
// relies on that a schema cannot express. Pure functions, no I/O. Used by `validate.mjs` (the
// public repo's CI and `node scripts/validate.mjs`) and by the monorepo's tests.

import { isDate, validateSchema } from "./schema.mjs";

const ROUTING_FIELDS = ["adapter", "baseUrl", "formats", "auth"];
const ADDRESS_FIELDS = ["baseUrl", "messagesBaseUrl"];

/** The last two labels of a URL's host ("docs.ai21.com" gives "ai21.com"), or null if it does not parse. */
function siteOf(url) {
  try {
    return new URL(url).hostname.split(".").slice(-2).join(".");
  } catch {
    return null;
  }
}

/** Errors in the catalog, as "path: message" strings. Empty when valid. */
export function checkCatalog(catalog, schema) {
  const errors = validateSchema(catalog, schema);
  if (errors.length) return errors;

  const seen = new Map();
  // Two providers on one address would send one provider's customer keys to the other.
  const addresses = new Map();
  // Which providers each site serves, from their addresses. Used to catch an entry copied from
  // another provider: its notes would cite that provider's docs even if the address was changed.
  const owners = new Map();
  for (const p of catalog.providers) {
    for (const field of ADDRESS_FIELDS) {
      const site = p[field] == null ? null : siteOf(p[field]);
      if (site === null) continue;
      if (!owners.has(site)) owners.set(site, new Set());
      owners.get(site).add(p.slug);
    }
  }
  catalog.providers.forEach((p, i) => {
    const path = `catalog.providers[${i}] (${p.slug})`;
    if (seen.has(p.slug)) errors.push(`${path}: duplicate slug, also at providers[${seen.get(p.slug)}]`);
    else seen.set(p.slug, i);
    for (const field of ADDRESS_FIELDS) {
      const url = p[field];
      if (url == null) continue;
      const other = addresses.get(url);
      if (other) errors.push(`${path}: ${field} ${url} is already used by ${other}`);
      else addresses.set(url, `${p.slug} (${field})`);
    }
    if (p.enabled && typeof p.notes === "string") {
      for (const url of p.notes.match(/https?:\/\/[^\s)"',]+/g) ?? []) {
        const site = siteOf(url);
        // Any other provider on that site counts, even if this one's address is there too: a copied
        // entry usually carries the copied address as well.
        const others = [...((site !== null && owners.get(site)) || [])].filter((slug) => slug !== p.slug);
        if (others.length) {
          errors.push(`${path}: notes cite ${url}, which is ${others.join(", ")}'s site, not this provider's`);
        }
      }
    }

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
    if (p.responsesVerify !== undefined && !(p.formats ?? []).includes("responses")) {
      errors.push(`${path}: "responsesVerify" needs "responses" in formats`);
    }
    if ((p.formats ?? []).includes("responses") && p.adapter !== undefined && p.adapter !== "openai" && p.adapter !== "openai-compatible") {
      errors.push(`${path}: the responses format needs the openai or openai-compatible adapter`);
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
    for (const [name, tier] of Object.entries(price.service_tiers ?? {})) {
      const full = tier.input !== undefined || tier.output !== undefined;
      if (tier.multiplier !== undefined && full) errors.push(`${path}.service_tiers.${name}: give a multiplier or a rate set, not both`);
      else if (tier.multiplier === undefined && (tier.input === undefined || tier.output === undefined)) {
        errors.push(`${path}.service_tiers.${name}: needs a multiplier, or both input and output`);
      }
    }

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
