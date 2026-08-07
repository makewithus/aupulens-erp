# AI Configuration — Azure OpenAI

Aupulens ERP's AI features (module assistants under `/api/*/ai-assistant`, and
the global AI Command Center at `/api/ai/command`) call **Azure OpenAI**. This
document covers what's required and how to configure it, locally and in a
deployment.

> **Status note (2026-08-06):** the codebase was migrated from Anthropic
> Claude to Azure OpenAI in Phase 0 of the CTO feature-spec rollout. The
> client abstraction is still named `lib/ai/claude.ts` — that's a deliberate
> naming decision to avoid touching every call site during the migration, not
> an oversight; see that file's top-of-file comment.

---

## 1. What you need

An Azure OpenAI resource with a **chat-completions model deployment** (e.g.
`gpt-4o` or a later chat-completions-capable model). A single deployment is
enough to get every AI feature in this app working — per-tenant model
overrides (`Organization.settings.ai.model`) are optional and layer on top of
this default.

## 2. Create the resource and deployment

1. Go to the [Azure Portal](https://portal.azure.com) or
   [Azure AI Foundry](https://ai.azure.com).
2. Create (or open an existing) **Azure OpenAI** resource.
3. Inside the resource, open **Model deployments** and deploy a
   chat-completions model. Give the deployment a name — you'll need this
   exact name below, and it is **not necessarily the same as the model
   name** (e.g. you might deploy `gpt-4o` under the deployment name
   `aupulens-chat`).

## 3. Get the four required values

From the resource's **Keys and Endpoint** page:

| Env var | Where to find it |
|---|---|
| `AZURE_OPENAI_API_KEY` | Either of the two listed keys ("KEY 1" / "KEY 2") |
| `AZURE_OPENAI_ENDPOINT` | The resource's endpoint URL, e.g. `https://your-resource.openai.azure.com/` |

From the deployment you created (**Model deployments** → your deployment →
"Target URI" / deployment details):

| Env var | Where to find it |
|---|---|
| `AZURE_OPENAI_CHAT_DEPLOYMENT` | The chat-model deployment name you chose in step 2 above |
| `AZURE_OPENAI_API_VERSION` | The `api-version` query param shown in the deployment's Target URI, e.g. `2024-10-21` |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | The name of an **embeddings** model deployment (e.g. `text-embedding-3-small`) — used by semantic/universal search |
| `AZURE_OPENAI_CHAT_DEPLOYMENT_LIGHT` | *(optional)* a cheaper/smaller chat deployment — see "Model tiering" below |

## 4. Set them

**Locally:** add these to your `.env` file (gitignored — never commit real
values):

```
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_VERSION=
AZURE_OPENAI_CHAT_DEPLOYMENT=
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=
AZURE_OPENAI_CHAT_DEPLOYMENT_LIGHT=   # optional, see Model tiering
```

`.env.example` has the same keys as placeholders — copy it to `.env` if
you're starting fresh (`cp .env.example .env`) and fill in real values.

## Model tiering (cost control)

High-volume, low-stakes AI calls (lead scoring, data-completion suggestions,
call/conversation summaries, Command Center intent classification) don't need
the same model as the reasoning-heavy Finance assistant. To route them to a
cheaper model:

1. In the Azure Portal, deploy a second, smaller/cheaper chat model in the
   **same** Azure OpenAI resource (e.g. `gpt-4o-mini`).
2. Set its deployment name as `AZURE_OPENAI_CHAT_DEPLOYMENT_LIGHT` in `.env`.

The code (`lib/ai/claude.ts`, `CLAUDE_LIGHT_MODEL`) automatically falls back to
`AZURE_OPENAI_CHAT_DEPLOYMENT` when the light deployment isn't set, so this is
safe to leave unset — those routes just use the main deployment until you add
a cheaper one. **This second deployment is a manual Azure Portal step** — the
app can't create it for you.

**In a deployment platform** (Vercel, Azure App Service, etc.): set the same
four keys as environment variables in that platform's settings — the app
reads them from `process.env` exactly the same way.

## 5. Per-workspace controls (kill-switch + spend cap)

AI usage is gated per-tenant, not just globally:

- **Kill-switch:** `Organization.settings.ai.disabled` (boolean). When `true`,
  every AI call for that tenant returns a gated `AI_DISABLED` result instead
  of calling Azure — no request is made, no spend is incurred.
- **Monthly call cap:** enforced per-tenant based on subscription tier via
  `getTierLimits(org.tier).aiCallsPerMonth` (`lib/constants/tiers.ts`).
  Usage is tracked in the `AiUsage` collection (`lib/ai/usage.ts`) and reset
  on a UTC calendar-month boundary. When the cap is hit, calls return a
  gated `AI_LIMIT_REACHED` result.
- **Per-tenant model/token override:** `Organization.settings.ai.model` (an
  Azure deployment name — lets one tenant use a different deployment than
  the platform default) and `Organization.settings.ai.maxTokensPerCall`.

All of this logic lives in `lib/ai/tenantAi.ts` (`callClaudeForTenant`,
`resolveTenantAiSettings`) — this is the function every AI route should call,
not the bare `callClaude`/`callClaudeWithHistory` in `lib/ai/claude.ts`
(those skip tenant gating entirely and should only be used for
internal/non-user-facing calls that shouldn't count against a tenant's
quota).

Whoever manages the Azure subscription and its cost can throttle spend per
workspace by adjusting `settings.ai.disabled` or the tier's
`aiCallsPerMonth` limit — no code change required.

## 6. Troubleshooting

**Error: "Azure OpenAI is not configured. Set AZURE_OPENAI_API_KEY, ..."**
One or more of the four env vars is missing or empty. Double-check `.env` has
all four set and that your dev server was restarted after editing it (Next.js
only reads `.env` at process start).

**HTTP 401 from Azure OpenAI itself (surfaces as a 500 from an `ai-assistant`
route):** `AZURE_OPENAI_API_KEY` is wrong, or doesn't match the resource
`AZURE_OPENAI_ENDPOINT` points at.

**HTTP 404 from Azure OpenAI:** usually `AZURE_OPENAI_CHAT_DEPLOYMENT` is
wrong or the deployment hasn't finished provisioning — deployment names are
case-sensitive and specific to your resource, not a public model ID.

**"The api-version ... is not supported" / similar version errors:**
`AZURE_OPENAI_API_VERSION` doesn't match what your resource/deployment
supports. Copy the exact value from the deployment's Target URI rather than
guessing.

**How to verify the connection is working:** the simplest check is to hit any
module AI assistant while logged in (e.g. `/finance/ai-assistant` — note this
page is currently not linked from the sidebar, see the audit notes; navigate
to it directly by URL) and send a message. A real response (not a "not
configured" or 500 error) confirms the four env vars are correct end-to-end.
There is currently no dedicated CLI/test-route for checking the connection
outside of exercising a real `ai-assistant` route — `tests/ai/claude.test.ts`
covers the client logic against a mocked Azure client, not a live connection.

## 7. Anthropic Claude removal

The `@anthropic-ai/sdk` package has been removed from `package.json`, and no
code imports it anymore (verified by repo-wide grep as part of the Phase 0
migration). `ANTHROPIC_API_KEY` is still present in `.env`/`.env.example` as
a **temporary rollback marker** — no code currently reads it. It should be
deleted from both files once Azure OpenAI has been confirmed working
end-to-end against a real resource (this could not be verified inside the
sandbox this migration was performed in, which has no real Azure credentials
— see the Phase 0 report for details). Once removed, there will be no
remaining reference to Anthropic/Claude as a provider anywhere in the
codebase or environment configuration.
