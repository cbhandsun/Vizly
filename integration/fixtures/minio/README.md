This real S3 integration fixture builds MinIO from upstream commit
`0d7408fc9969caf07de6a8c3a84f9fbb10a6739e` (RELEASE.2025-04-22T22-12-26Z).
The source archive and Go build image are pinned by SHA256. Go verifies module
checksums from the upstream `go.sum`. The image contains the upstream AGPL
license; its corresponding source is the fixed archive in the Dockerfile.

The previously used published image is no longer anonymously retrievable.
Both integration entrypoints build this fixture with Docker caching before
creating their isolated service. The build context excludes repository files,
and test credentials are created only after the build. A source build has a
separate ten-minute bound within the unchanged CI job deadline. Existing
service/browser test and readiness deadlines are unchanged.
