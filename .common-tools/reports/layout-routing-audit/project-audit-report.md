# Project audit

## Overall judgment

0 review item(s) and 2 evidence gap(s) were identified. Static matches are candidate evidence, not proof that the related design or control is healthy.

## Scope and limits

- Audit level: standard
- Coverage strategy: representative-journeys
- Evidence expectation: representative journey, state, viewport, and related code evidence
- Required experience scenarios: first-visit, core-flow, state-feedback, responsive, keyboard
- Runtime gates required by level: yes
- Audit mode: enhanced
- Audit domains: product-journey, visual-interaction, engineering-delivery
- Project profile: application
- Static analysis: enhanced-scoped-candidate-scan-completed
- Runtime verification: not-verified
- Experience verification: not-verified
- Visual verification: not-verified
- Scanned files: 10000
- Warnings: 0
- Not verified: 2

## Review items

- No confirmed warning-level static findings. This does not close the evidence gaps below.

## Evidence gaps

| Area | Missing verification | Next evidence |
| --- | --- | --- |
| runtime-gates | runtime gates were not requested; static evidence does not prove tests, builds, SCA or production behavior | Run the declared check, lint, typecheck, test, and build gates only with explicit authorization. |
| experience-review | 5 required experience scenario(s) are not verified for the selected audit level | Capture and inspect the primary journey, responsive, keyboard, accessibility, console, and network scenarios. |

## Requested review coverage

- 产品闭环: product-entrypoints: observed; product-flow-evidence: observed; journey-state-evidence: observed
- 视觉、交互与无障碍: visual-interaction-evidence: observed; interaction-feedback-evidence: observed; responsive-evidence: observed; accessibility-evidence: observed; experience-review: not-verified
- 工程与交付: package-manifest: observed; dependency-lock: observed; automated-tests: observed; ci-workflows: observed; observability-evidence: observed; operations-evidence: observed; release-governance-evidence: observed; runtime-gates: not-verified

## Evidence inventory

| Area | Assessment | Status | Evidence | Candidate signal |
| --- | --- | --- | --- | --- |
| project-profile | observed | observed | package.json:1 | Node package profile; 4682 text source file(s) examined |
| product-entrypoints | observed | observed | src/App.tsx:1, src/app/index.ts:1, src/components/warehouse-3d/DigitalTwinUI.tsx:1 (+22 more) | 26 candidate application entrypoint detected |
| product-flow-evidence | observed | observed | docs/DOM_SVG_Rendering_Research_and_Implementation_Plan.md:165, docs/Flowchart_Connection_Port_Design_Analysis.md:68, docs/Gap_Analysis_and_Improvement_Plan.md:39 (+17 more) | 20 candidate user-flow document detected |
| visual-interaction-evidence | observed | observed | scripts/lib/test-ci-runner-policy.test.mjs:35, src/app/__tests__/AntdThemeBridge.test.tsx:1, src/app/__tests__/AppRouteError.test.tsx:2 (+22 more) | 198 candidate component or browser interaction test detected |
| responsive-evidence | observed | observed | .coverage/lcov-report/prettify.js:2, .coverage/prettify.js:2, src/components/shared/EnhancedStyleSwitcher.tsx:233 (+22 more) | 127 candidate responsive layout detected |
| accessibility-evidence | observed | observed | public/assets/startup-resource-guard.v1.js:24, scripts/generate-precompiled-display-routes.mjs:109, scripts/lib/display-routing-browser-capture.mjs:148 (+22 more) | 384 candidate accessibility semantic detected |
| package-manifest | observed | observed | package.json:1 | package.json detected |
| dependency-lock | observed | observed | package-lock.json:1 | lockfile detected |
| automated-tests | observed | observed | scripts/lib/architecture-boundaries.test.mjs:1, scripts/lib/bundle-static-import-graph.test.mjs:1, scripts/lib/coverage-policy.test.mjs:1 (+22 more) | 1183 test file(s) detected |
| ci-workflows | observed | observed | .github/workflows/ci.yml:1, .github/workflows/display-routing-matrix.yml:1, .github/workflows/routing-performance.yml:1 | 3 CI workflow file(s) detected |
| operations-evidence | observed | observed | .github/workflows/ci.yml:1, .github/workflows/display-routing-matrix.yml:1, .github/workflows/routing-performance.yml:1 | 3 deployment, health or CI evidence detected |
| journey-state-evidence | observed | observed | .coverage/lcov-report/prettify.js:2, .coverage/lcov-report/sorter.js:36, .coverage/prettify.js:2 (+22 more) | 652 candidate loading, empty, success, error, or recovery UI state detected |
| interaction-feedback-evidence | observed | observed | .coverage/lcov-report/sorter.js:192, .coverage/sorter.js:192, scripts/lib/display-routing-browser-export-audit.mjs:373 (+22 more) | 372 candidate interaction or user-feedback implementation detected |
| observability-evidence | observed | observed | .codex-ci-install-134/package-lock.json:615, .codex-ci-install-134/package.json:37, README.md:56 (+22 more) | 305 candidate observability, telemetry, or structured logging implementation detected |
| release-governance-evidence | observed | observed | .github/workflows/ci.yml:16, .github/workflows/display-routing-matrix.yml:36, .github/workflows/routing-performance.yml:114 | 3 candidate release, health, rollback, smoke, artifact, or SBOM control detected |
| runtime-gates | not-verified | not-verified | none | runtime gates were not requested; static evidence does not prove tests, builds, SCA or production behavior |
| experience-review | not-verified | not-verified | none | 5 required experience scenario(s) are not verified for the selected audit level |

## Local runtime gates

| Gate | Status | Duration (ms) |
| --- | --- | ---: |
| not requested | not-verified | 0 |

## Experience evidence

- Supplied scenarios: 0
- A supplied manifest proves only that bounded capture files exist. Inspect every screenshot and console/network artifact before promoting a scenario to verified health.

## Interpretation

- Audit level controls depth and evidence expectations; it does not authorize browser automation, project gates, or remote upload.
- `observed` means candidate source or artifact evidence was found; it is not a design-quality pass.
- `not-verified` requires real browser, keyboard, responsive, accessibility, network, gate, or deployment evidence.
- Runtime gates run only when explicitly requested locally; this audit never runs project code by default.
- Possible-secret evidence identifies only relative paths and line numbers. It never includes matched values.
