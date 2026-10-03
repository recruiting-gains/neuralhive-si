# NeuralHive

Build SI teammates in minutes. Static site + Cloudflare Pages Functions, deployed by pushing to `main`
(Git-connected Pages project, no build step, output directory = repo root).

## Layout

| Path | What |
| --- | --- |
| `index.html`, `script.js` | Landing page + free preview (calls `POST /api/preview`) |
| `app.html`, `app.js` | The app: license activation, agents, chat (served at `/app`) |
| `terms.html`, `privacy.html` | Legal pages |
| `theme.js`, `theme.css` | Shared Tailwind CDN config + styles for app/legal pages |
| `functions/api/*` | API routes (Pages Functions) |
| `functions/_lib/*` | Shared server code (not routed: no `onRequest` exports) |
| `functions/_middleware.js` | Same-origin enforcement, API headers, hides repo source files |
| `_routes.json` | Which paths invoke Functions (API + hidden source paths only) |
| `_headers` | Security headers (CSP etc.) for static pages |
| `tests/` | Node tests with mocked KV / Workers AI / Gumroad |

## Pages dashboard configuration (Settings → Functions / Variables)

Add these for **Production** (and Preview if you use preview deployments), then redeploy:

| Name | Type | Value |
| --- | --- | --- |
| `AI` | Workers AI binding | (your account's Workers AI) |
| `NH_KV` | KV namespace binding | a KV namespace, e.g. `neuralhive` |
| `GUMROAD_PRODUCT_ID` | Environment variable (plain text, optional) | Defaults to `JN-C9Y88NN8W2i-lku9rpQ==` (NeuralHive Pro). Set only to override. |

No secrets are needed: Gumroad's license verify endpoint is public and only requires the product id + license key.

There is intentionally **no `wrangler.toml`**: a Pages-valid one (with `pages_build_output_dir`) would become the source of
truth and override the bindings configured in the dashboard. Local dev passes bindings as CLI flags instead.

## API

All endpoints are same-origin JSON. Authenticated endpoints take `Authorization: Bearer <session token>`.
Errors look like `{ "error": "Human readable message", "code": "machine_code" }`.

| Method & path | Auth | Body / query | Notes |
| --- | --- | --- | --- |
| `POST /api/activate` | – | `{ license_key }` | Verifies with Gumroad, returns `{ token, email, expires_in }` (30-day session) |
| `GET /api/session` | ✓ | – | `{ email, created, limits }` |
| `POST /api/logout` | ✓ | – | Deletes the session |
| `GET /api/templates` | – | – | Template list (prompts stay server-side) |
| `GET /api/agents` | ✓ | – | `{ agents, max }` |
| `POST /api/agents` | ✓ | `{ name, template, instructions }` | `template`: recruiting, support, sales, dev, data, marketing, custom. Max 20 agents |
| `DELETE /api/agents/:id` | ✓ | – | Also deletes the agent's history |
| `GET /api/chat?agent_id=` | ✓ | – | Last 50 stored messages |
| `POST /api/chat` | ✓ | `{ agent_id, messages }` | Uses the last `user` message; context comes from stored history |
| `POST /api/preview` | – | `{ prompt }` | Free agent plan: `{ plan: { name, role, tasks[3], first_reply } }` |

### Licensing

* Gumroad `POST https://api.gumroad.com/v2/licenses/verify` with `product_id`, `license_key`, `increment_uses_count=false`.
* Rejected when `refunded`, `chargebacked`, disputed (and not won), or `subscription_failed_at` / `subscription_ended_at` is set.
  `subscription_cancelled_at` alone does **not** revoke access: cancelled subscribers keep access until the paid period ends (`subscription_ended_at`).
* Every authenticated call re-verifies with Gumroad at most once per 24h per license (cached in KV); inactive licenses get
  `402 subscription_inactive` and the session is deleted. If Gumroad is unreachable, a license verified within the last 72h keeps working.

### Limits

* 100 chat messages / day / license
* 3 free previews / day / IP
* 30 unauthenticated calls (activation attempts + previews) / day / IP
* Counters are daily (UTC) in KV, so they are approximate under heavy concurrency.

### Models

* Chat: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, falling back to `@cf/meta/llama-3.1-8b-instruct` on error.
* Free preview: `@cf/meta/llama-3.1-8b-instruct-fast`, falling back to `@cf/meta/llama-3.1-8b-instruct` (cost control).

### KV keys

`sess:<token>` · `licv:<license-hash>` · `agents:<license-hash>` · `hist:<license-hash>:<agent-id>` · `rl:<scope>:<id-hash>:<YYYY-MM-DD>`
(license keys and IPs are SHA-256 hashed in key names).

## Local development

```bash
# Static site + Functions with a local KV namespace (Workers AI needs a logged-in account, so it's omitted here;
# AI endpoints then return 503 "missing AI binding").
npx wrangler@3 pages dev . --kv NH_KV --port 8788

# Tests (Node 20+, no dependencies): mocked KV, Workers AI and Gumroad
node --test tests/
```
