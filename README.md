# OpenPike models

[![Validate](https://github.com/OpenPike/models/actions/workflows/validate.yml/badge.svg)](https://github.com/OpenPike/models/actions/workflows/validate.yml)

[OpenPike](https://openpike.dev) is a bring-your-own-key gateway for LLM APIs: your agents send requests to one endpoint, OpenPike forwards them with your own provider keys and gives you per-agent budgets, kill switches and spend reports. This repo holds the provider catalog and the price table the gateway uses to route requests and compute what each one cost.

Both files are the ones OpenPike runs in production. They are published here from OpenPike's main repository on every change, so what you read is what the gateway uses. Found a wrong or missing price? See [CONTRIBUTING.md](CONTRIBUTING.md).

The same data, as tables: [openpike.dev/docs/providers](https://openpike.dev/docs/providers/).

## Files

| File | What it holds |
| --- | --- |
| [`catalog.json`](catalog.json) | Every provider OpenPike knows about: whether it can receive requests, which API formats it speaks, its API base URL and how to authenticate. |
| [`prices.json`](prices.json) | Prices in US dollars per 1 million tokens, keyed by `provider/model`, each with the provider's pricing page and the date it was read. |
| [`catalog.schema.json`](catalog.schema.json), [`prices.schema.json`](prices.schema.json) | JSON Schemas (2020-12) for both files. Editors that understand `$schema` validate and autocomplete as you type. |
| [`scripts/validate.mjs`](scripts/validate.mjs) | Checks both files against the schemas and the rules the gateway relies on. Node 20 or later, nothing to install: `node scripts/validate.mjs`. CI runs it on every push and pull request. |

## `catalog.json`

`{ "version": 1, "providers": [ ... ] }`, one object per provider:

| Field | Meaning |
| --- | --- |
| `slug` | The provider part of a model name. A request for `deepseek/deepseek-flash` goes to the provider with slug `deepseek`. Unique. |
| `name` | Display name. |
| `tier` | How much work the provider needs: `native` (first-class support), `openai-compatible` (works through the OpenAI-compatible adapter), `special` (needs its own sign-in or adapter, such as Vertex AI or Bedrock), `planned`, or `excluded` (does not serve chat models: speech, image, video, embeddings). |
| `enabled` | `true` when the provider may receive requests. |
| `verify` | `true` while the base URL has not been confirmed with a live request. The provider stays off, whatever `enabled` says, until OpenPike has made a real request to it. |
| `adapter` | The gateway adapter that talks to it: `openai`, `openai-compatible`, `anthropic` or `systemone`. |
| `baseUrl` | API base URL from the provider's own documentation, without a trailing slash. `null` while it is not known yet (then `verify` is `true`). OpenPike never guesses one. |
| `formats` | API formats the provider serves natively: `chat` (OpenAI Chat Completions), `messages` (Anthropic Messages), `systemone` (TypeSafe System One). OpenPike does not translate between formats, so a provider is reachable only on its own formats' endpoints. |
| `auth` | How the key is sent: `bearer` (`Authorization: Bearer ...`) or `x-api-key`. |
| `messagesBaseUrl` | For a provider that is not Anthropic but also serves an Anthropic-compatible endpoint: that endpoint's base URL. |
| `messagesVerify` | `true` while `messagesBaseUrl` is unconfirmed; the `messages` format stays off until then. |
| `rejectsStreamOptions` | `true` when the provider rejects `stream_options`, so the gateway does not ask it for usage in the last streamed chunk. |
| `liveTested` | Per format, the last date (`YYYY-MM-DD`) that format passed OpenPike's live test against the real provider. The docs show those providers as Tested. |
| `notes` | Free text for people reading the file. |

A provider receives requests only when it is `enabled`, not `verify`, and has `adapter`, `baseUrl`, `formats` and `auth`.

## `prices.json`

`{ "version": 2, "prices": { "<provider>/<model>": { ... } } }`. The key is the model name exactly as a request sends it. All rates are **US dollars per 1 million tokens**.

| Field | Meaning |
| --- | --- |
| `input` | Uncached input (prompt) tokens. |
| `output` | Output tokens, including reasoning tokens where the provider bills them as output. |
| `cached_input` | Input tokens read from the provider's prompt cache. When absent, `input` is used. |
| `cache_write` | Input tokens written to the prompt cache (the 5-minute cache, for Anthropic). When absent, `input` is used. |
| `cache_write_1h` | Input tokens written to the 1-hour cache, used when the response reports them separately. When absent, `cache_write` is used. |
| `service_tiers` | Rates for a service tier the provider bills differently, keyed by the tier name the response reports (`priority`, `flex`). Each is either `{ "multiplier": 2 }` (times every rate in force, long-context tiers included) or a full rate set with `input` and `output` (and optionally `cached_input`, `cache_write`, `cache_write_1h`) where the provider publishes per-tier prices. The tier is read from the response, because a provider can downgrade a request. A response that reports a tier that is neither listed nor `default`, `auto` or `standard` is costed at the standard rate and marked estimated. |
| `tiers` | Long-context prices: a list of rate sets, each with `above_prompt_tokens`. When the whole prompt (cache reads and writes included) is above a tier's threshold, all of that request's tokens use the tier's rates. The highest matching tier wins. |
| `changes` | Price changes the provider has announced, oldest first. Each has a `from` date and the new rates (and `tiers`, when they change too; `[]` removes them). From 00:00 UTC on `from`, they replace the base rates. |
| `source` | The provider's own pricing page. Prices come only from there, never from resellers or aggregators. |
| `as_of` | The day the price was read from `source`. |
| `note` | Free text, for example which rate is used when the provider has several (DeepSeek's peak rate, an upper bound). |

A model with no entry is **unpriced**: requests to it work, but their cost is unknown and does not count toward budgets.

## How OpenPike computes cost

OpenPike never counts tokens itself. It reads the provider's own usage data from the response, then prices it with the rates in force when the request started (the latest `changes` entry on or before that day, else the base rates), picked by prompt size (`tiers`):

```
uncached = input tokens - cache reads - cache writes
cost     = uncached     * input
         + cache reads  * cached_input
         + 5m writes    * cache_write
         + 1h writes    * cache_write_1h
         + output tokens * output
```

`input tokens` is the whole prompt, cache reads and writes included, whatever the provider calls it. Rates are per 1M tokens, so the result is in micro-dollars (millionths of a dollar), rounded to a whole number per request.

## License

[MIT](LICENSE). Security issues: see [SECURITY.md](SECURITY.md).
