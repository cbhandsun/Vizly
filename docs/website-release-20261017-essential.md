# Website release: 2026-10-17

Published the connection gesture and fractional line-jump geometry repairs. Later label and dense-layout optimization remains outside this release.

- Website: https://www.vizly.fun
- Public runtime source: `0f77e1b23ec86d562bb1397e2b4fa02e756ad064`
- Public runtime source tree: `6477dc70c6c63671d9cfe1da2a3f4f38ec18c2a8`
- Local Core artifact SHA256: `a6d84fef1319ddd4d9d133807380f7f58419838a43dc03835ded6f14c4a58456`
- Production deployment: `dpl_GU4gtPwcdq9ed94SXsPFzCPxmWwL`
- Both formal domains point to the deployment. The original preview deployment was restored.

## Verification

The candidate passed typecheck, lint and production build. All 2,134 installed Core files matched the selected compiled artifact; other dependency lock entries were unchanged. Two connection-drag browser cases and six viewer-role, downgrade and persistence-failure browser cases passed. Fifteen protected candidate resources matched the prepared output. After promotion, all 401 production resources matched; first load and reload displayed 45 nodes and 44 labels without page errors.

The strict desktop label test still failed with one unresolved label; the previous production baseline also failed that test. This remains a deferred issue, not a passing gate. GitHub run 38943149754 failed Browser acceptance (main) and its aggregate gate. The optimization PRs remain unmerged.

Authentication and collaboration modules and the collaboration backend deployment were unchanged. Earlier real two-account acceptance is retained as historical evidence; this release did not repeat it. Protocol-fixture role tests do not constitute new two-account authentication acceptance.

## Delivery states

1. Core local: selected source previously passed SDK build, source/test-support types, scoped lint and package boundaries, plus 18 rendering and 69 related regressions; no full-suite green claim.
2. Public local: typecheck, lint, build and eight scoped browser cases passed; the strict label case remains failed.
3. Local tarball: 2,134 files matched; compiled-only boundary verified.
4. npm: not published.
5. Anonymous registry: no new package acceptance.
6. CI: historical public run remains failed; no merge or merged-main CI claim.

## Rollback

Previous frontend deployment: `dpl_FGZhEApx1ZDjfiPAhbPctMdqBHZK`.

```text
vercel rollback https://vizly-exls43et4-hongtaos-projects-76c46461.vercel.app --scope hongtaos-projects-76c46461
```

This frontend release does not deploy or roll back the collaboration backend, database or AI function.
