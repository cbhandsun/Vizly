# Vizly Application

This repository contains the open application layer for Vizly. The proprietary editor implementation is consumed through `@vizly/contracts` and `@vizly/core`; `package.json` and `package-lock.json` record the selected versions or local package artifacts. The app imports React bindings from `@vizly/core/react` so local Core package validation uses a single Core instance.

Once released, the packages are installable anonymously from npm. The MIT license for this application does not cover the proprietary `@vizly/core` package; commercial production deployment of Core requires separate authorization.

This website release pins its accepted compiled Core package under `vendor/`.
`npm ci` installs that artifact using the integrity recorded in the lockfile;
the package contains compiled code and declarations, without private sources.
Its SHA256 is `b144a649eec9476f18e104463d4c995fc1ddff3466b73c64990aa0c8fa3b497e`.
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
