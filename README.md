# Vizly Application

This repository contains the open application layer for Vizly. The proprietary editor implementation is consumed through `@vizly/contracts` and `@vizly/core`; `package.json` and `package-lock.json` record the selected versions or local package artifacts. The app imports React bindings from `@vizly/core/react` so local Core package validation uses a single Core instance.

Once released, the packages are installable anonymously from npm. The MIT license for this application does not cover the proprietary `@vizly/core` package; commercial production deployment of Core requires separate authorization.

The website pins its compiled Core package at
`vendor/vizly-core-0.1.0-alpha.9-ea4af881c4e9d3dd.tgz`.
`npm ci` installs that artifact using the integrity recorded in the lockfile;
the package contains compiled code and declarations, without private sources.
Its SHA256 is `ea4af881c4e9d3dddd7647d2cf73fce75fb0c670e7eba1c172277cd3a08f70ed`.
This local package delivery does not publish a new npm SDK version.

## Development

For email/password and Magic Link sign-in, copy `.env.example` to `.env.local`
and set your Supabase project URL and frontend publishable/anon key. Keep
`.env.local` untracked and never use a secret or service-role key. Restart Vite
after changing environment files. Without this configuration, local editing
remains available but sign-in and cloud features are disabled.

For hosted deployments, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
in the build environment and rebuild/redeploy; Vite embeds them at build time.
Configure Supabase Auth's Site URL and redirect allowlist for each application
origin (including `http://localhost:5173` when testing Magic Links locally).

```sh
npm ci
npm run check
```

`npm run check` runs typecheck, lint, the complete CI unit-test entry, RLS and
S3 tests, the application build, and the collaboration-server build. `npm run
test`, `npm run test:ci`, and `npm run test:full` use the same unit-test entry.
Run `npm run test:e2e` separately for both browser regression groups. Local
checks do not establish hosted CI or deployed-service acceptance.

Real-time collaborative editing also needs a separate authenticated WebSocket
service. Supabase login and document storage alone do not provide this service.
See [Collaboration setup and deployment](COLLABORATION.md) for configuration,
durability requirements, and the distinct-account acceptance checklist.

`npm run collaboration:auth-load` builds the collaboration server and runs five
sequential rounds at 1, 4 and 8 same-room peers, each sending eight awareness
queries. `COLLABORATION_AUTH_LOAD_ROUNDS` accepts 3–10. The loopback server and
Supabase authorizer/SDK are real; upstream HTTP is a controlled 10ms synthetic
transport with no project credentials. JSON on stdout records Auth QPS, HTTP
amplification, queue wait, response/auth p50/p95, and post-burst revocation.
Missing responses, unexpected request counts or leaked revoked responses fail
the command. Background permission rechecks are set to 60 seconds to isolate
per-message cost; this is not a live Supabase capacity or editing-load result.
The production server reuses a permission result only for synchronous read
replies in that same message handler. Broadcasts and responses after async work
still recheck access; no positive-result TTL cache is introduced.

`npm run collaboration:mixed-load` adds five rounds of two independent rooms
with four peers each. Each peer sends 30 cursor frames and two durable edits;
the verifier requires final cursors, exact peer/persisted document equality,
room isolation, rejection of a revoked writer, and continued saves in the other
room. `COLLABORATION_MIXED_LOAD_ROUNDS` accepts 3–10. This uses real loopback
WebSockets/Yjs with controlled 30ms authorization and 5ms in-memory persistence,
keeping default periodic permission rechecks enabled. JSON reports queue wait,
authorization checks and final-input-to-convergence time; these are local
baselines, not a production latency target or live Auth/database capacity.

## User flow

- Workspace first visit: open the app root, review local, cloud, shared, and
  template diagram collections, then create or open a diagram.
- Diagram editing: open `/?diagram=<id>`, wait for the canvas and saved status,
  change layout or content, and confirm local save or cloud-save feedback.
- Documentation: open `#/docs`, search for a help topic, and return to the
  workspace.
- Storage setup: open `#/storage-config`, enter provider settings, test the
  connection, and save only when the validation succeeds.
- Share recovery: open an invalid `#/shared/<id>` link and confirm the user can
  return to the workspace without data loss.

## AI credentials

API keys stay in the current page’s memory for both signed-in and anonymous
users. Re-enter your key after a reload, sign-out, account switch, or a new
login session. Provider, endpoint, model and prompt settings can still be saved
and synced without the key. The configuration dialog shows when re-entry is
required. Older saved credential records are retained, but are not automatically
loaded or overwritten by new settings.

## Release readiness

Before promoting a build, run `npm ci`, `npm run check`, and a browser smoke
against the built app or deployment for the workspace, diagram, docs, storage,
share, and unknown-route paths. Record the commit SHA, package versions, and
deployment URL as artifact provenance for the release. If a deployment fails,
roll back to the previous known-good deployment, keep the npm package versions
unchanged, and re-run the same smoke before retrying.

License: MIT.

The export omitted 1 application test file(s) that still depend on private Core internals. Their paths are recorded in `open-app-manifest.json` and must be migrated to public SDK contracts before they can move into this repository.

### Version save status

Version history shows whether a snapshot is confirmed in cloud storage or retained only on this device. Local snapshots record their account, selected provider and sync state; switching accounts does not adopt another account's pending snapshots. Historical records without ownership remain marked as legacy local records and cannot be uploaded through retry.

Signed-in Supabase snapshots are committed to IndexedDB together with a durable upload task before any network write. Automatic sync resumes on startup or reconnection for the original account and provider. Uploads use a fixed UUID as the remote version primary key; a duplicate is accepted only after an authorized readback matches the original author, diagram and complete payload. Session changes cancel outstanding work, and requests retain the original account's authorization. Anonymous and legacy snapshots are not automatically adopted by an account; S3 versions remain local.

The history panel distinguishes queued uploads, scheduled retries, stopped retries and a full queue. Each upload times out after 15 seconds. Network and unknown failures back off from 2 seconds, with at most 8 automatic attempts; permission, authentication, configuration and data failures stop automatic retries. **Retry cloud sync** remains available after fixing the cause. The queue holds at most 512 tasks; when full, new snapshots are retained locally for manual sync. No pending task or snapshot is evicted to make room. **Export local copy** downloads the canvas JSON; export before clearing browser storage or moving devices.

To roll back automatic sending, rebuild this client with `VITE_VERSION_AUTOSYNC_ENABLED=false` using the normal release gates. This keeps local-first saves, the queue, manual retry and export, and displays a paused status. Rebuild with the flag omitted or set to `true` to resume pending tasks for the original account; blocked tasks still require manual retry. Retain IndexedDB v3 compatibility: do not clear storage or deploy a client that insists on opening database version 2. This switch is a build-time setting, not a live server toggle. Browser/transport tests cover the implementation; real PostgreSQL concurrency/RLS and full release acceptance remain T04 gates.

### Database installation and forward upgrades (T02)

Use `scripts/database-path.mjs` for the two supported paths. The original eleven files in `supabase/migrations/` are preserved byte-for-byte as historical definitions; they are **not a complete empty-database chain**. Some were review proposals for a specific deployed schema. The new, CLI-named files and ordered forward chain are registered in `supabase/database-paths/manifest.json`. Do not replay the original directory over an existing database or use it as the new installation path.

The forward chain now appends the AI gateway shared-resource migration after
the existing contract step. Both `empty` and `upgrade` install its private
tables and backend-only RPCs. Existing baseline/contract files and their
receipt hashes are unchanged; matching receipts skip previously applied work,
including active leases, counters and customized policy. Extension sources are
hash-pinned separately in the manifest and verified by
`node scripts/build-database-paths.mjs --check`.

Do not mix a standalone installation of the AI migration with this path and
then delete or invent a receipt. If `vizly_ai` already exists without a matching
path receipt, upgrade fails atomically and asks for inventory reconciliation.
Review that environment's actual schema and backup before deciding how to
adopt it; this tool does not infer that existing private tables are compatible.

Prerequisites: a Supabase platform database (its `auth.users`, `auth.uid()`, `auth.jwt()`, `realtime.messages`, `anon`, `authenticated`, and `service_role` already exist), PostgreSQL 17, an administrative connection, and `psql`/`pg_dump`/`pg_restore`. Set the connection using your normal libpq service/password-file configuration; the renderer needs no credentials and only prints SQL. Our disposable PostgreSQL tests create a **platform-only shim**; application tables come from the actual baseline, not test bootstrap tables.

From this repository, inspect an environment and produce a backup before upgrading:

```sh
node scripts/database-path.mjs inventory > /tmp/vizly-inventory.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/vizly-inventory.sql > /tmp/vizly-inventory.jsonl
pg_dump -Fc > /path/to/vizly-before-upgrade.dump
```

The inventory reports column types/default hashes, RLS, policy definitions, grants, function signatures/configuration/definition hashes, indexes, constraints, triggers, migration versions, row counts, invalid version references and orphan references. It does not emit business-row content. Retain the report with the backup; rehearse restoration into a separate database using `pg_restore --exit-on-error`, then run the chosen path and permission tests there first.

For a **new empty application schema**, render `empty`; for a **supported existing schema**, render `upgrade` instead:

```sh
node scripts/database-path.mjs empty > /tmp/vizly-database-plan.sql
# Existing environment: use this command instead of the line above.
node scripts/database-path.mjs upgrade > /tmp/vizly-database-plan.sql
psql -X -v ON_ERROR_STOP=1 -f /tmp/vizly-database-plan.sql
```

Each plan owns one bounded transaction, locks the managed tables, installs the security contract and records SHA-256 receipts in private `vizly_migrations.applied`. Repeating an identical applied file is a no-op; a changed applied-file checksum is rejected. Supabase's existing migration history is not rewritten and old migrations are not falsely marked as executed. Append future CLI-generated files to `forwardChain`; never edit already-applied files. `node scripts/build-database-paths.mjs --check` verifies the generated paths and pinned historical sources.

Supported existing schema: `diagrams` and collaborator identity columns use UUID; version `diagram_id` may be TEXT or UUID; version `author_id` stays TEXT and retains historical/null labels; shared `diagram_id` remains TEXT. Required client columns and unique keys are checked. Valid TEXT version references are checked against existing parents before conversion; their exact old spelling is kept in private `vizly_migrations.version_reference_map`. UUID conversation IDs can widen to TEXT without changing their serialized values, allowing the app's `conv_*` IDs. Unknown policies/history, invalid IDs, orphan references, incompatible types/keys and conflicting index shapes stop the transaction. Non-UUID historical diagram identifiers require a separately reviewed mapping; this path does not invent IDs, silently delete rows, or use `CASCADE` to discard unknown dependencies.

All seven business tables are checked for row-count/content-digest preservation inside the transaction (version references are normalized for that comparison); existing collaboration state, leases and recovery backups are also checked. New installations receive secure empty tables; existing customized templates are preserved, and historical template seed SQL is not replayed. Roll back a failed transaction normally; for an already committed upgrade, restore the rehearsed full backup into a replacement database and validate it before switching traffic. There is no destructive automatic down migration.

Run `npm run test:database` with Docker for the migration matrix and real dump/restore rehearsal. `npm run test:rls` now includes that matrix before the existing complete permission/CAS/realtime regressions, so the existing CI permission gate covers it. Tests use synthetic representative TEXT/UUID databases, not a production backup; production rollout still requires inventory and backup rehearsal for that exact environment.

### Secondary browser regression

Install the pinned Playwright engines with `npx playwright install firefox webkit`, then run `npm run test:e2e:compatibility`. This builds the website once and runs the same assertions in Firefox and WebKit: first-node creation and reload, persisted document permissions, actual downloads, storage validation and startup recovery. Mobile cases resize the viewport; they do not claim physical iOS/Android device coverage. `VIZLY_E2E_PORT` selects an unused local port (default 5410). A browser launch failure is an environment failure, never a passed application test. Chromium full regression remains `npm run test:e2e:main`; this smoke suite does not replace it.
