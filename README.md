# Vizly Application

This repository contains the open application layer for Vizly. The proprietary editor implementation is consumed through exact-version public npm packages: `@vizly/contracts@0.1.0-alpha.2` and `@vizly/core@0.1.0-alpha.3`. The app imports React bindings from `@vizly/core/react` so local Core package validation uses a single Core instance.

Once released, the packages are installable anonymously from npm. The MIT license for this application does not cover the proprietary `@vizly/core` package; commercial production deployment of Core requires separate authorization.

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

`npm run check` is the local release gate for the public app. It runs typecheck,
lint, the stable CI test shard, and a production build. Use `npm run test` for
the same stable test shard. Use `npm run test:full` when investigating broader
coverage locally; it can emit jsdom pseudo-element diagnostics from legacy
component cases and is not the pull-request gate.

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

## Release readiness

Before promoting a build, run `npm ci`, `npm run check`, and a browser smoke
against the built app or deployment for the workspace, diagram, docs, storage,
share, and unknown-route paths. Record the commit SHA, package versions, and
deployment URL as artifact provenance for the release. If a deployment fails,
roll back to the previous known-good deployment, keep the npm package versions
unchanged, and re-run the same smoke before retrying.

License: MIT.

The export omitted 1 application test file(s) that still depend on private Core internals. Their paths are recorded in `open-app-manifest.json` and must be migrated to public SDK contracts before they can move into this repository.
