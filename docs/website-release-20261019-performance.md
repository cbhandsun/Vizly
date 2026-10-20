# Website release: 2026-10-19

Published the canvas rendering refinement, precompiled route snapshot caching, and comprehensive page performance optimizations (route prewarming, viewer static closure trimming, and 3D warehouse memory bounds).

- Website: https://www.vizly.fun
- Formal alias: https://vizly.fun -> https://www.vizly.fun
- Local Core artifact: `vendor/vizly-core-0.1.0-alpha.8-6033925ef9c29d23.tgz` (derived from `vizly-core` `62969b1`)
- Production deployment: `dpl_CzVfuzyWTNGDgE3sM6fuNBHhHkVo`
- Deployment URL: `https://vizly-a8ddtska6-hongtaos-projects-76c46461.vercel.app`
- Previous live formal deployment: `dpl_95Ek7BLtKKE3gxSCPJacMmjy6QXy`
- Preview alias: `preview.vizly.fun` retains deployment `dpl_2J6nG44KYpdbN2AmbBnuMVKiE7Ff` with Vercel deployment protection enabled.

## Verification

The candidate passed typecheck, lint, and production build (`npx vite build --mode production`, 419 files in prepared static output). Staged via `deploy-prepared-vercel-static.mjs` to `dpl_CzVfuzyWTNGDgE3sM6fuNBHhHkVo`.
Promoted via Vercel CLI to formal production domains.
Live verification confirmed:
- `https://www.vizly.fun`: HTTP 200 OK, root container present, main bundle `/assets/index-Cmlpy8ts.js` verified.
- `https://vizly.fun`: HTTP 307 redirect to `https://www.vizly.fun/`.
- `https://preview.vizly.fun`: HTTP 302 protected with SSO/deployment protection.

## Delivery states

1. Core private repository: PR #6 / PR #7 merged on `origin/main` (`62969b1`), local tarball packaged.
2. Public application repository: typecheck, lint, production build, and performance regressions passed.
3. Local tarball integration: 419 files staged without source leakage or credentials.
4. npm: not published (local compiled package delivery only).
5. Anonymous registry: no npm release requested.
6. CI: GitHub Actions passing on reviewed PRs.

## Rollback

```text
vercel rollback https://vizly-gifq90ed6-hongtaos-projects-76c46461.vercel.app --scope hongtaos-projects-76c46461
```
Or promote prior deployment:
```text
vercel promote dpl_95Ek7BLtKKE3gxSCPJacMmjy6QXy --scope hongtaos-projects-76c46461 --yes
```
