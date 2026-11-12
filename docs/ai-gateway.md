# Vizly AI Gateway

Vizly uses a Supabase Edge Function as an optional authenticated AI gateway. The
browser keeps the existing direct transport for anonymous sessions and local
providers such as Ollama. Authenticated remote-provider requests use the gateway
after a provider-key-free health probe confirms that the function is deployed.

## Runtime flow

1. The client validates the selected provider, model, and message boundary.
2. `GET /functions/v1/ai-gateway?health=1` checks gateway availability without
   sending the provider API key.
3. The authenticated request is sent to the Edge Function.
4. The function validates the browser origin, body size, provider origin, model,
   messages, and API key bounds.
5. `@supabase/server` verifies that the Bearer token belongs to an authenticated
   user; the public browser key cannot invoke the gateway as a user.
6. AI SDK selects the native OpenAI, Anthropic, or Google adapter when the
   configured provider and official origin match. Other allowed providers use
   the OpenAI-compatible adapter.
7. Text, reasoning, and schema-validated diagram tool calls return through the
   bounded `vizly-ai-gateway-v1` SSE protocol.
8. The browser validates tool calls again with the existing command policy before
   performing canvas operations.

The provider API key is forwarded for the current request and is never written by
the Edge Function. This gateway does not remove a BYOK key from browser memory;
server-managed credentials require a separate encrypted credential store.

## Required configuration

Set the production browser origins accepted by the function:

```text
AI_GATEWAY_ALLOWED_ORIGINS=https://vizly.example.com
```

Official OpenAI, Anthropic, Google, DeepSeek, SiliconFlow, and O3 origins are
allowed by default. Add exact origins for reviewed custom gateways:

```text
AI_GATEWAY_ALLOWED_PROVIDER_ORIGINS=https://models.example.com,https://proxy.example.com
```

Localhost and private-network provider targets are intentionally rejected by the
cloud function. Local Ollama continues to use browser-direct transport.

Custom providers can select either OpenAI-compatible Chat Completions or the
OpenAI Responses API. The browser uses `/chat/completions` or `/responses`
accordingly. Loopback HTTP endpoints (`localhost`, `127.0.0.1`, and `[::1]`)
always remain browser-direct. When gateway routing is explicitly enabled, remote
HTTPS Responses providers use the authenticated gateway and provider-origin allowlist.

The frontend route mode is controlled at build time:

```text
VITE_AI_GATEWAY_MODE=off
```

- `auto` probes the gateway and falls back to direct transport only when the
  function is absent.
- `required` fails closed when the gateway or authenticated session is missing.
- `off` sends model requests directly from the browser to the configured provider. Cloud document and configuration persistence still use Supabase.

`off` is the default, including when the setting is absent or unrecognized. Set `auto` or `required` explicitly to enable gateway routing.

## Remembering BYOK keys on this device

Without opt-in, provider keys live only in page memory. “Remember key encrypted
in this browser” saves an AES-GCM encrypted record in the browser's
`VizlyAICredentials` IndexedDB database, with a non-extractable CryptoKey stored
on the same device. Records are bound to the account, provider ID and Base URL;
reload restores matching records. The key and this device preference are
excluded from cloud configuration sync. “Delete key saved on this device”
removes the encrypted record and clears the current runtime key. This protects
against plaintext storage inspection, but scripts controlling the website can
still use credentials available to that website.

## Deployment

The gateway accepts the website's `system` messages at its request boundary and
maps them to AI SDK 7 `instructions`; only user/assistant messages enter the SDK
`messages` array. Diagram-tool guidance is appended to the first system
instruction. Passing system messages directly through the SDK prevented actual
website requests from reaching the provider, even though user-only fixtures
passed. The real website/Auth/Edge/PostgREST fixture now covers this boundary.

The SSE response reads upstream on demand with one queued event. Cancelling
the response body aborts the generation signal and releases its iterator;
request cancellation is also forwarded when the runtime delivers it. This
application-level cleanup is covered by tests. On Edge Runtime v1.76.2, an idle
stream initially failed prompt cleanup because HTTP disconnect detection waited
for another write. The response now emits an SSE comment every 500ms while
waiting for upstream data. Comments contain no model content, count toward the
stream byte budget, and stop under backpressure; only one upstream read remains
in flight. Cancellation clears the pending heartbeat timer.
A trusted-HTTPS fixture verified active-stream cancellation (202ms observed)
and, after the fix, idle-stream cancellation (1013ms observed): upstream closed,
usage recorded `cancelled`, and the next request reused the single concurrency
slot at the unchanged 1.2-second checkpoint. These are isolated observations,
not a production latency SLA. Production proxies and buffering still need
deployment acceptance; client-side abort alone is not proof of upstream cleanup.
Late results after cancellation are
discarded and upstream errors remain redacted. The existing total/first-chunk/
inter-chunk SDK timeouts remain configured. Real Edge testing showed that SDK
configuration alone did not end a stalled response at 30 seconds. The gateway
therefore also checks provider progress independently, emits a sanitized error
and records `timeout` after 30 seconds without semantic output. Keepalive
comments do not reset that deadline. Provider adapters also explicitly cancel
their response reader when the fetch signal aborts: abort alone left a quiet
upstream body connected in the tested runtime. The real HTTPS timeout fixture
now passes response termination, upstream socket closure and lease reuse
(30375ms to the timeout response in one isolated run). These observations do
not replace production proxy or real-model workload acceptance.
`AI_GATEWAY_MAX_OUTPUT_TOKENS` sets the
server-owned generation cap (integer 1–65536; provisional default 16384).
Invalid configuration rejects generation with 503; clients cannot override
this cap. Validate the default with representative real-model diagram output
before production rollout. Encoded event and total stream byte caps are described
below.

Authentication retains the verified account ID for resource accounting and
rejects signed anonymous sessions. It never derives this identity from caller
headers, request JSON or editable user metadata. Generation now requires
shared admission for that verified account before the provider is invoked.

The shared admission migration is
`supabase/migrations/20261026191139_ai_gateway_shared_resource_leases.sql`.
It adds private `vizly_ai` tables and service-role-only, security-invoker RPCs
`vizly_acquire_ai_lease` / `vizly_release_ai_lease`. The backend must pass only
the verified account UUID and a server-generated lease UUID. The Edge Function
uses backend-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for these RPCs.
Never put the service-role key in a `VITE_*` variable or client request.
Install it through the documented `scripts/database-path.mjs empty|upgrade`
path on a rehearsed staging database before deploying this gateway revision.
The path appends the new migration while preserving prior receipts; do not mix
standalone SQL installation and path receipts without reconciliation.
Missing configuration, missing RPCs and store failures reject
generation with 503; they never fall back to unmetered generation. The health
probe checks authenticated protocol support, not database admission readiness.

Denied admission returns 429 with browser-readable `Retry-After` seconds.
Normal completion, consumer/request cancellation, setup/read errors and the
independent 120-second deadline trigger one release attempt. Release uses its
own five-second timeout, and Edge Runtime `waitUntil` keeps cleanup alive after
the response. If cleanup fails or the instance dies, the database TTL is the
fallback. RPC replies are byte-bounded and malformed or unsafe leases fail
closed. Service credentials, prompts and database errors are not returned.

Admission serializes on the user's window row. Initial database policy is 20
requests per 60-second window and two concurrent leases per user; the database
owner can update the private policy table, while the gateway role can only
read it. Leases expire after 150 seconds, exceeding the 120-second generation
deadline. Repeating the same live lease ID is idempotent; releasing a lease
does not refund the rate counter. Expired leases are removed during the next
admission for that user, and account deletion cascades to its quota records.
These defaults still need representative workload validation before rollout.

Encoded SSE events are capped at 256 KiB each, including JSON escaping and
framing. The complete response is capped at 4 MiB, reserving space for a terminal
error or completion frame. Text, reasoning and tool input share these budgets.
Overflow aborts generation, closes the response with a generic error (without
`[DONE]`) and releases admission. The response queue prefetches at most one event.
These limits bound gateway output; they cannot prevent the provider SDK from
allocating an oversized upstream event before handing it to the gateway.
The limits need representative provider validation before rollout. Real
Edge lifecycle verification remains pending. The resource adapter has passed an
isolated PostgreSQL 17.6 / PostgREST 12.2.12 HTTP integration run with signed test
JWTs, two adapter instances, shared concurrency/rate limits and role denials.
This does not exercise Supabase Auth, Kong or the production Edge runtime.

The Edge entry point writes one structured `ai_gateway_usage_v1` record for
each validated generation attempt reaching resource admission/configuration.
It contains a random request ID, a domain-separated SHA-256 of the verified
user ID, terminal outcome, elapsed milliseconds, emitted SSE bytes and the
provider's final input/output token counts. No prompts, outputs, tool arguments,
API keys, provider URLs, model names or raw errors enter this record. SDK raw
error logging and provider warning logging are disabled in this gateway.
Invalid/pre-auth requests and capability probes do not produce usage records.

The user hash is a stable pseudonym, not anonymous data: someone who knows the
user ID can recompute it. Restrict log access and retention accordingly. Token
counts absent on cancellation/failure or omitted by the provider remain `null`,
not zero; this is operational usage telemetry, not a billing ledger. Bytes count
frames enqueued by the gateway (including terminal frames), not confirmed client
delivery. The first terminal state wins; late callbacks cannot rewrite it.
Logging is best effort, hosted by Edge `waitUntil`; logging failure cannot block
generation or lease cleanup. Process crashes can lose a record. Production log
delivery/retention and real-provider token reporting still require verification.

The reproducible PostgREST harness and source hashes are under
`../quality-baseline/runs/t11-2026-10-26-postgrest/`. It uses ephemeral containers
on an internal network, no published ports and no business volumes. Test JWT
signing material is generated per run and removed with the temporary workspace.
PostgREST configuration follows its [configuration reference](https://docs.postgrest.org/en/v12/references/configuration.html).

Configure Edge Function secrets without committing them, then deploy with JWT
verification enabled:

```powershell
supabase secrets set AI_GATEWAY_ALLOWED_ORIGINS="https://vizly.example.com"
supabase secrets set AI_GATEWAY_ALLOWED_PROVIDER_ORIGINS="https://models.example.com"
supabase functions deploy ai-gateway
```

Do not deploy with `--no-verify-jwt`. The function also rejects missing Bearer
headers, while Supabase performs the actual JWT signature and expiry validation
before invocation.
