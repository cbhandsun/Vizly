# Real-time collaboration

Supabase supplies identity, document storage, and document membership. Yjs
merges concurrent edits. Vizly's WebSocket backend transports document updates
and presence between browsers. The backend is a separate service; there is no
default public endpoint. A generic public Yjs server does not implement Vizly's
document authorization and recovery protocol.

The application only requests automatic collaboration for an active document
with a matching Supabase cloud identity. Local copies and S3 documents do not
automatically join a cloud room.

## Local setup

Build the server with `npm run collaboration:build`. Create an untracked
`.env.collaboration.local` in the application repository:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_LEGACY_ANON_KEY
VIZLY_COLLABORATION_PORT=5420
VIZLY_COLLABORATION_ORIGINS=http://localhost:5173
VIZLY_COLLABORATION_DATA_DIR=.collaboration-data
```

Use the same Supabase project as the frontend. Never supply a secret or
service-role key. Origins are exact browser application origins, separated by
commas when more than one is needed; they do not include paths or trailing
slashes. Set the port and origin to those actually used by your local preview.

Start the backend with `npm run collaboration:start`. It listens on loopback
(`127.0.0.1`). `GET http://127.0.0.1:5420/health` reports process readiness; a
200 response does not verify authentication, synchronization, or persistence.

Configure the frontend's untracked `.env.local` with:

```dotenv
VITE_YJS_WEBSOCKET_URL=ws://127.0.0.1:5420
```

Retain the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Restart the
development frontend after changing its environment. For a built preview,
rebuild with the selected environment because Vite embeds configuration into
the browser assets. Never put access tokens into this URL.

The backend checks each user's Supabase identity and document membership.
Owners and editors can edit; viewers cannot write document updates. Connected
sessions are periodically rechecked, so permission removal and token expiry
must be tested with existing connections as well as new ones.

## Production deployment

Deploy the Node backend behind a TLS reverse proxy on the same host and expose
a `wss://` endpoint. The proxy must forward WebSocket upgrades and the protected
`/recovery/` HTTP endpoints without rewriting their paths. Allow only the actual
frontend origins and rebuild the frontend with the deployed endpoint.

Use a persistent writable directory for `VIZLY_COLLABORATION_DATA_DIR`. Room
state includes diagram content and recovery records: restrict directory access,
retain backups outside ephemeral application storage, and verify restoration.
Do not capture authorization headers, query credentials, or WebSocket payloads
in proxy logs. The application logger records bounded event names.

The current file-backed backend is a single-process design. Do not start
multiple independent replicas against one directory or assume that separate
replicas share live rooms. Horizontal deployment requires shared coordination
and persistence before it can preserve concurrent document state.

### Separate Vercel projects

The document synchronization hook now connects admitted atomic room reads to
metadata-only commit notices. Reads and acceptance run in the same room queue
as local commits, preventing a stale fetched state from racing a newer local
commit. It checks generation, monotonic versions, unchanged contents for an
unchanged version, and preservation of committed structures and deletions.
Bursts coalesce; reconnect and periodic refresh catch missed notices. A failure
fences the room. Subscription and lease disposal failures now fail shutdown
after socket and HTTP cleanup instead of being reported as successful shutdown.

Current regression covers two independent real loopback WebSocket server
instances with separate synthetic editor identities and shared synthetic
atomic storage/notification fixtures: concurrent edits, deletion, viewer
delivery, dropped notices, transport/client reconnect, and generation fencing.
Cross-instance cursor presence, disconnect tombstones, stale-frame rejection,
reconnect refresh and revoked identity removal are also covered using synthetic
fixtures. These checks do not establish actual Supabase transport, real-account
authorization, deployed function expiry, or production recovery.
The private Supabase notification adapter and restrictive backend-topic policy
are now integrated with the main backend and unified local regression entrypoint.
The sequential complete App run, including the backend, passed all 2291 cases
across all 303 expected files, with no pending tests, inventory gaps or source
drift. Earlier incomplete runs and focused retries remain in the audit records;
the complete sequential run supplies the current full-suite acceptance.
Subsequent changes were limited to database SQL and RLS verification scripts;
the final integrated RLS and full lint gates passed. SDK transport tests use a
synthetic loopback server, so actual cloud authentication and production topic
isolation remain unverified. The production policy is applied. The running
local file-backed startup is unchanged. The current unified PostgreSQL gate
passed, including observed advisory-lock overlap, stale CAS rejection and
repeated migrations.

The proposed Vercel layout keeps the existing `vizly` frontend project and uses
a separate `vizly-collaboration` backend project. This separates releases,
rollback, runtime logs and backend-only configuration. Both projects can serve
the same product; the frontend connects to the backend's HTTPS/WSS origin.
The separate `vizly-collaboration` project is now provisioned with Vercel
Authentication protection. A capability-only staging deployment has completed
a real cloud WebSocket upgrade, received the exact fixed probe receipt and
closed with code 1000. This establishes platform capability for this account;
the probe alone does not establish application collaboration. The actual
backend and compiled frontend are now deployed as protected previews at
`https://collab-preview.vizly.fun` and `https://preview.vizly.fun`. Authenticated
backend health returned 200 and an invalid-origin WebSocket upgrade returned
403. Unauthenticated preview requests can redirect to Vercel sign-in; ordinary
product access and real-account collaboration remain unaccepted. The existing
production frontend endpoint is unchanged.

Vercel Functions support WebSockets with Fluid compute; project capability has
now been verified with the cloud probe above. However, a connection
ends at the function's maximum duration, and a new connection can reach a
different instance. Splitting projects does not provide shared rooms or make
local files durable. See https://vercel.com/docs/functions/websockets.

The local `server/collaboration/index.ts` continues to start a file-backed
loopback listener. Production instead uses `server/collaboration/vercel.ts`,
which exports an unbound HTTP server and composes Supabase atomic storage,
admission/recovery leases, private document notifications and bounded presence.
The bundled production artifact has passed local execution checks and deployed
successfully as a protected preview. Before production release:

- Accept the complete backend regression and actual migration role/CAS gate.
- The migrations `supabase/migrations/20261009160702_collaboration_atomic_room_store.sql`
  and `20261009160720_private_backend_room_topics.sql` are applied. Live metadata
  confirms all three tables have RLS and deny browser roles; seven invoker RPCs
  allow only the backend role, and backend topics have a restrictive client
  policy. Actual private Realtime transport still requires cloud acceptance.
- Verify bounded reconnection, resynchronization and authorization checks
  after maximum-duration closure and deployment replacement.
- Set the exact frontend origin allowlist and deploy the public WSS endpoint;
  keep database credentials exclusively in backend configuration.

Do not replace these requirements with a larger timeout, local `/tmp` storage,
or an assumption that both accounts always reach one instance. Resource
provisioning, plan availability and operating cost remain to be confirmed.

Production requires these backend environment variables:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_LEGACY_ANON_KEY
SUPABASE_SERVER_KEY=YOUR_BACKEND_SECRET_KEY
VIZLY_COLLABORATION_ORIGINS=https://YOUR_FRONTEND_ORIGIN
```

`SUPABASE_SERVER_KEY` must be an `sb_secret_` key, stored as a Vercel Secret.
It is only for this production entrypoint and must never enter `VITE_*`
variables, frontend assets, logs or version control. Production origins must
be exact HTTPS origins; HTTP localhost is rejected. Use an HTTPS frontend
preview for cloud acceptance. Keep deployment protection and provide a verified
public backend domain before admitting ordinary product users.

### Committed state returned by a shared store

`RoomPersistence.save` can return the full committed Yjs state, including edits
accepted concurrently by another instance. The server validates that receipt,
checks that it retains every submitted structure and deletion, then broadcasts
the accepted difference to local peers. A stale or invalid receipt fails closed;
state vectors alone cannot detect omitted deletions. The existing file store
continues to return no receipt because its writes are serialized locally.

This contract is covered by unit and actual loopback WebSocket regressions in
the unified test entrypoint. It does not provide an external store, atomic
cross-instance writes, remote-room notifications or distributed recovery leases.
Those remain deployment requirements above.

`atomicRoomCommit.ts` and `supabaseAtomicRoomStore.ts` now provide a bounded
compare-exchange commit loop and backend RPC adapter. Each save uses the
generation held by the admitted room, merges the latest stored Yjs state after
a version conflict, and retains the checkpoint base. The adapter uses a
backend-only Supabase secret key, limits response bytes and request duration,
disables automatic retries, and returns only sanitized storage errors. This
credential is separate from the publishable key used for user authorization;
it must never enter frontend environment variables or browser bundles.

The atomic-store SQL now has a CLI-generated migration at
`supabase/migrations/20261009160702_collaboration_atomic_room_store.sql`.
`npm run test:rls`, included in `npm run check`, reads this actual migration and
the private-topic migration to verify client-role denial, repeated execution,
invalid-input paths and competing transactions on isolated PostgreSQL. The
latest actual gate passed with observed advisory-lock contention. Both
migrations are applied and their filenames match the cloud migration history. Distributed
admission/recovery leases, reconciliation and fanout are composed in the
production entrypoint, while the running local server still uses file storage.

The review fixture now also coordinates edit/recovery leases. SQL serializes
admission, renewal, commit and recovery for each diagram. Leases expire after
30 seconds; the server uses a conservative monotonic 20-second lifetime and
heartbeats, closes peers on loss, and refuses a late persistence response after
loss. Atomic writes require the admitted lease ID; the earlier unleased RPC
signature is removed. These server hooks are optional and are not enabled in
the currently running file-backed service.

Recovery requires an exclusive live lease and no active editor leases on any
instance. One SQL transaction verifies the confirmed digest, preserves a
digest-verified backup, replaces the record, changes the generation and removes
the old leases. Old generations and expired leases cannot write or renew.
The fixture caps concurrent leases at 128 per diagram and backups at 32;
capacity errors fail recovery without deleting backups. Operational retention
and capacity need review before production rollout. Tests enter the existing
unit and isolated RLS gates. Runtime checkpoint reconciliation and cross-instance
document/presence notifications are composed in the production entrypoint.
Their actual cloud authentication, convergence and recovery still require
acceptance before production rollout.

`createAtomicCheckpointPersistence` now binds reads, room edits and checkpoint
coordination to one admitted room and generation. Checkpoint CAS conflicts
re-read current storage and recompute cloud reconciliation. An older accepted
server snapshot must be contained in current storage; it cannot replace newer
remote edits. Direct checkpoint proposals reconcile their edits against their
own cloud base, preserve both CRDT histories, and reject overlapping changes.
Returned committed state is consumed by the coordinator, including in the
file-store fallback contract. These primitives are locally tested and composed
with cross-instance notifications in the deployed production entrypoint
preview. The separate running local file-backed service is unchanged; actual
cloud acceptance and production rollout remain incomplete.

`createDistributedRoomRegistry` now owns admitted storage bindings and exclusive
recovery operations. Saves reuse the admitted lease; they cannot create a fresh
generation. Closing a room removes its binding, and shutdown waits for pending
claims and recovery cleanup. Recovery conflicts remain visible to the request;
release failures make shutdown fail. Re-entrant abort observers share one stop
promise and do not release a lease twice.

`createSupabaseRoomRuntime` composes this registry with the backend RPC adapters.
Local regression exercises the registry/coordinator/server through actual
WebSocket peers using synthetic lease/storage fixtures. This verifies the
single-instance composition, not real Supabase credentials or cross-instance
delivery. The local entrypoint `server/collaboration/index.ts` remains
file-backed. The deployed Vercel entrypoint `server/collaboration/vercel.ts`
composes the distributed runtime through `createProductionCollaborationRuntime`.
Actual cloud delivery and distinct-account recovery remain release gates.

### Frontend artifact gate

The installed Core is a locally verified compiled package. A source deployment
must not assume that its version is available from the public registry or
upload private Core source to resolve an installation failure. Static frontend
artifacts can be prepared with:

```text
node scripts/prepare-vercel-static.mjs BUILD_DIRECTORY NEW_OUTPUT_DIRECTORY PROJECT_ID TEAM_ID
```

The output contains compiled assets, Vercel project metadata and Build Output
API v3 routing. Preparation rejects source directories, credentials, source
maps, symbolic links and literal loopback WebSocket endpoints. It also verifies
copied file hashes. This gate does not prove runtime connectivity, prevent
every possible secret embedded in JavaScript, or deploy the backend. Rebuild
with reviewed public production configuration before staging and validate the
actual deployed service using the acceptance steps below.

## Acceptance before rollout

- Use two genuinely different existing test accounts, not two tabs signed into
  the same account. Open one test cloud document as its owner and an editor.
- Edit from both browsers concurrently. Confirm both converge, preserve native
  node types and rich text, and keep the saved result after reload.
- Disconnect and reconnect one browser. Confirm pending edits and peer presence
  behave correctly without duplicating or overwriting document content.
- Verify a viewer cannot edit, an unrelated user cannot join, and revocation or
  expired authorization rejects writes from an already connected browser.
- Verify server restart persistence and backup restoration. Check owner-only
  recovery and confirm a local recovery copy remains independent of its cloud
  document.
- Run `npm run check` and `npm run test:e2e`, then verify the same flows against
  the deployed HTTPS/WSS service. Synthetic browser users and a passing health
  check do not replace distinct-real-account or deployed-service acceptance.
