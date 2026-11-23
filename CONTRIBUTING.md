# Contributing

Thanks for helping keep these prices right. Pull requests are welcome for wrong or missing prices, new models, and catalog fixes.

## How changes land

This repo is published from OpenPike's main repository. When your pull request is ready, we copy it there (you stay credited as a co-author of the commit), and the next sync publishes it here. Then we close your pull request with a link to the published commit. So your pull request is closed, not merged, even when it is accepted.

## Changing or adding a price

1. **Link the provider's own pricing page** in the pull request, and use it as `source`. Prices from resellers, aggregators, blog posts or screenshots are not accepted. Price data the provider publishes itself counts as its own page (for example Nebius's `models_info`). For the `openrouter` provider, OpenRouter is the seller, so its own models API is the source.
2. **Set `as_of`** to the day you read the page (`YYYY-MM-DD`).
3. **Keep dates; never delete a price that was in force.** When a provider changes a price, add a dated entry to the model's `changes` list (`from` is the first day the new price applies, oldest first) instead of overwriting the old numbers, so requests made before the change keep their price. Overwrite the base rates only to fix a mistake.
4. **One provider per pull request.** Several models from the same provider are fine.
5. Model names (the keys in `prices.json`) are `<provider slug>/<model id>`, with the model id exactly as the provider's API takes it.
6. Service tiers (`service_tiers`) are read from the provider's own pricing page too: a `multiplier` when one factor applies to every rate, or a full rate set when the page lists them per tier. Use the tier name the provider's response reports.
7. Rates are US dollars per 1 million tokens. Leave out `cached_input`, `cache_write` or `cache_write_1h` when the provider does not offer that price (the input price is used).

## Adding or confirming a provider

Start from the [tracking issue](https://github.com/OpenPike/models/issues/1), which lists every provider still switched off and who is on it. For a provider with no issue of its own, open one with the **Confirm a provider** form (New issue): it asks for exactly the evidence below.

A new provider goes into `catalog.json` with `"enabled": false` and `"verify": true`, and a `baseUrl` from the provider's own API documentation (or `null` if you cannot find one). We never guess an address.

**What switches a provider on.** You do not need OpenPike to hold a key for it, and you do not need a key yourself. We switch it on as **Available** with a link to the provider's own API docs showing the base URL, plus either:

- a keyless check: `POST <baseUrl>/chat/completions` with no key answers 401 or 403 (any body), or a 400 whose error says authentication or the API key is missing, or
- a redacted `curl` response from `POST <baseUrl>/chat/completions` with a 200 and a `usage` block. **Never paste a key**; replace it with `REDACTED`.

Before porting, we run the keyless check ourselves either way. A 404, a redirect, an HTML page, a 200 or a DNS error does not pass. Then the entry gets `"enabled": true` and `"verify": false`. **Tested** on the docs Providers page is reserved for providers that passed OpenPike's own live test, recorded in `liveTested`; leave that field alone.

If the address has something per customer in it (an account ID, a project, a region you pick), say so: that needs a code change rather than a catalog edit.

## Before you open the pull request

Run the checks (Node 20 or later, nothing to install):

```
node scripts/validate.mjs
```

CI runs the same checks on your pull request. They validate both files against the schemas and the rules the gateway relies on: unique slugs, known providers, valid dates, no negative prices, changes in date order.
