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

The frontend route mode is controlled at build time:

```text
VITE_AI_GATEWAY_MODE=auto
```

- `auto` probes the gateway and falls back to direct transport only when the
  function is absent.
- `required` fails closed when the gateway or authenticated session is missing.
- `off` keeps all requests on the legacy direct transport.

`auto` is the default.

## Deployment

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
