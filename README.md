# Vizly Application

This repository contains the open application layer for Vizly. The proprietary editor implementation is consumed through exact-version public npm packages: `@vizly/contracts@0.1.0-alpha.0`, `@vizly/core@0.1.0-alpha.0`, `@vizly/react@0.1.0-alpha.0`.

Once released, the packages are installable anonymously from npm. The MIT license for this application does not cover the proprietary `@vizly/core` package; commercial production deployment of Core requires separate authorization.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

License: MIT.

The export omitted 1 application test file(s) that still depend on private Core internals. Their paths are recorded in `open-app-manifest.json` and must be migrated to public SDK contracts before they can move into this repository.
