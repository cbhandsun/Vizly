# Release and Rollback

Vizly public app releases are gated by the repository CI workflow and by a local
Core package integration check when `@vizly/core` is tested from a local tarball.

## Release gates

- Run `npm run check` before a release candidate is tagged.
- For local Core integration, install the approved `.tgz` from `vizly-core`,
  then rerun `npm run check` in this repository.
- In a disposable integration checkout, use
  `node scripts/install-locked-core-artifact.mjs <approved-core.tgz>`.
  This runs `npm ci` against a temporary Core-only manifest/lock overlay,
  rejects dependency or peer graph changes, and verifies installed versions,
  URLs and integrity values. Source manifests are restored byte-for-byte;
  the installed Core remains available for the following validation gates.
  A later ordinary `npm ci` restores the source-declared Core package.
  Do not use `npm install --package-lock=false` for locked integration checks:
  it can resolve newer unrelated packages even when the source lock stays unchanged.
- Verify the application starts and loads a representative diagram without
  console errors.
- Keep the release artifact provenance clear: record the app commit, the
  `@vizly/core` package version, and whether Core came from npm or a local
  tarball.

## Health and smoke checks

- Build output must be produced by `npm run build`.
- A smoke check should open a representative diagram route and confirm nodes,
  edges, and controls render.
- Browser smoke evidence should avoid user content and credentials.

## Rollback

- Prefer reverting the public app commit when the regression is isolated to this
  repository.
- If the regression follows a Core package change, restore the last accepted
  `@vizly/core` version or tarball and rerun `npm run check`.
- If a deployment is already live, roll back to the last known healthy artifact
  from the hosting provider, then verify the smoke route again.

## Collaboration release procedure

The frontend (`vizly`) and backend (`vizly-collaboration`) are separate Vercel
projects in `hongtaos-projects-76c46461`. Keep a release record for each project:
deployment ID, target environment, exact artifact hashes, configuration names,
source fingerprint, test reports, migration versions and previous production
deployment. A Git SHA alone is insufficient when deploying a dirty local
worktree or a prebuilt artifact containing a locally packed Core.
Artifact preparation receipts describe that build step; keep deployment and
acceptance receipts separately so rebuilding cannot overwrite live status.

For compiled frontend previews, wait for `scripts/prepare-vercel-static.mjs`
to finish, then use `scripts/deploy-prepared-vercel-static.mjs` with the stage
directory, expected project ID, team ID, team scope and installed Vercel CLI
module path. The launcher requires the completed artifact receipt, verifies
the exact target and every asset hash, and explicitly pins the project/team
environment variables. An unfinished or mismatched stage must fail before
the CLI runs; do not let a raw deploy command automatically create a project.
Verify the returned deployment belongs to the expected project and is READY
before assigning a preview alias.

For production static staging, pass `production` and the intended production
WSS URL to the preparation script after the four existing arguments. The
completed receipt records that environment and the exact quoted endpoint in
compiled JavaScript. Pass `production` after the CLI module argument to the
deployment launcher. It rechecks the environment, endpoint and asset hashes,
then uses `--prebuilt --prod --skip-domain`; production domains are assigned
only after the staged deployment is accepted. Preview is still the default,
and legacy receipts can only deploy to preview. An environment mismatch or
missing compiled endpoint must fail before the Vercel CLI starts.

Both projects currently use Vercel protection mode `all_except_custom_domains`.
The custom aliases `preview.vizly.fun` and `collab-preview.vizly.fun` are reachable
without Vercel administrator authentication; immutable deployment URLs remain
protected. Record and verify the actual project protection settings for every
release. Application identity, role and origin checks still protect business
operations. A successful `/health` check proves process readiness only.
Accept the distinct-account scenarios in [COLLABORATION.md](COLLABORATION.md)
against these deployed services, including concurrent edits and deletion,
viewer denial, connected-session revocation, remote cursors, reconnection after
function expiry, persistence and recovery. Verify that a browser retaining an
old generation cannot restore discarded edits after recovery.

Before staging production:

1. Accept the current complete local gates and browser gates. Confirm test
   discovery matches the expected file inventory and that inputs did not change
   during the run. A focused retry does not replace a failed complete run.
2. Verify the applied atomic-store and private-topic migrations, their grants,
   RLS and RPC signatures on the selected Supabase project. Preserve the
   backend-only role boundary and a tested recovery backup.
3. Confirm Production and Preview configuration separately. Store
   `SUPABASE_SERVER_KEY` only as a backend Secret. Use exact HTTPS frontend
   origins and keep the production WSS URL out of the preview configuration.
4. Verify the immutable compiled Core package and clean-install delivery path.
   A `file:` path outside the application checkout is not available to a remote
   CI runner. A compiled tarball under the application's tracked `vendor/`
   directory is portable when its license permits distribution and its lockfile
   integrity matches the accepted artifact. Verify `npm ci` in a clean checkout.
   Do not publish an SDK or upload private Core source to bypass this gate.
5. Record the deployment currently serving each production domain. An older
   deployment marked READY is a rollback candidate, not proof it remains
   compatible with the current schema and frontend protocol.

Stage the backend with Production configuration without assigning production
domains (`vercel deploy --prod --skip-domain`). Validate that exact staged
deployment, including actual secret-key RPC and private Realtime access. Then
prepare the frontend with its intended production WSS endpoint and stage its
compiled artifact through the verified production static launcher described
above (`vercel deploy --prebuilt --prod --skip-domain`).
Use the project-specific authenticated access path for protected checks; never
embed a protection credential in frontend assets or in a URL.

Promote only the accepted staged **production** deployments. Promoting a
preview can rebuild it with different environment variables and does not
release the tested artifact. Assign the backend endpoint first and verify
origin admission, then release the frontend. Finally verify normal user access
without Vercel administrator authentication and repeat a bounded cloud
save/reload/collaboration smoke check. Record error rates, failed admissions,
lease/CAS failures, reconnect behavior and recovery outcomes using bounded
event metadata; exclude credentials, user content and WebSocket payloads.

## Collaboration rollback procedure

Record exact previous deployments before any domain assignment. There is no
accepted previous application collaboration backend yet: the capability probe
is not an application rollback target.

- For a frontend regression, restore the accepted previous frontend deployment
  and verify diagram load, local save/reopen and cloud save. Confirm its
  collaboration protocol remains compatible with the active backend.
- For a backend regression, restore an accepted compatible backend deployment
  and recheck admission, persistence and reconnect. If no compatible backend
  exists, release an accepted frontend configuration with collaboration
  unavailable and explicit disconnected status; do not route users to the
  capability probe or report unsynchronized edits as saved.
- Keep additive collaboration schema and stored room/recovery records during
  an application rollback. Do not drop tables, reopen client grants or restore
  the unleased RPC as a rollback shortcut. A data restoration is a separate
  operation requiring a verified backup and a generation change that fences
  old browsers and leases.
- `vercel rollback` disables automatic production domain assignment. Record
  that state; resume normal release assignment through `vercel promote` only
  after verifying the replacement deployment.

Health and rollback commands alone do not constitute a recovery drill. Keep
release acceptance incomplete until the exact restored deployment and the
retained data are verified through the browser and backend.

