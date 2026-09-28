# Release and Rollback

Vizly public app releases are gated by the repository CI workflow and by a local
Core package integration check when `@vizly/core` is tested from a local tarball.

## Release gates

- Run `npm run check` before a release candidate is tagged.
- For local Core integration, install the approved `.tgz` from `vizly-core`,
  then rerun `npm run check` in this repository.
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

