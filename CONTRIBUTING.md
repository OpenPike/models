# Contributing

Thanks for helping keep these prices right. Pull requests are welcome for wrong or missing prices, new models, and catalog fixes.

## How changes land

This repo is published from OpenPike's main repository. When your pull request is ready, we copy it there (you stay credited as a co-author of the commit), and the next sync publishes it here. Then we close your pull request with a link to the published commit. So your pull request is closed, not merged, even when it is accepted.

## Changing or adding a price

1. **Link the provider's own pricing page** in the pull request, and use it as `source`. Prices from resellers, aggregators, blog posts or screenshots are not accepted.
2. **Set `as_of`** to the day you read the page (`YYYY-MM-DD`).
3. **Keep dates; never delete a price that was in force.** When a provider changes a price, add a dated entry to the model's `changes` list (`from` is the first day the new price applies, oldest first) instead of overwriting the old numbers, so requests made before the change keep their price. Overwrite the base rates only to fix a mistake.
4. **One provider per pull request.** Several models from the same provider are fine.
5. Model names (the keys in `prices.json`) are `<provider slug>/<model id>`, with the model id exactly as the provider's API takes it.
6. Rates are US dollars per 1 million tokens. Leave out `cached_input`, `cache_write` or `cache_write_1h` when the provider does not offer that price (the input price is used).

## Adding a provider

Add it to `catalog.json` with `"enabled": false` and `"verify": true`, a `baseUrl` from the provider's own API documentation (or `null` if you cannot find one), and a link to that documentation in the pull request. A new provider stays `verify: true` until OpenPike confirms it with a live request; we flip it.

## Before you open the pull request

Run the checks (Node 20 or later, nothing to install):

```
node scripts/validate.mjs
```

CI runs the same checks on your pull request. They validate both files against the schemas and the rules the gateway relies on: unique slugs, known providers, valid dates, no negative prices, changes in date order.
