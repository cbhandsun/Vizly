# Project audit

## Overall judgment

0 review item(s) and 0 evidence gap(s) were identified. Static matches are candidate evidence, not proof that the related design or control is healthy.

## Scope and limits

- Audit level: deep
- Coverage strategy: risk-driven-comprehensive
- Evidence expectation: risk-driven comprehensive runtime, accessibility, security, and delivery evidence
- Required experience scenarios: first-visit, core-flow, result-followup, state-feedback, recovery, responsive, keyboard, console-network
- Runtime gates required by level: yes
- Audit mode: experience
- Audit domains: visual-interaction
- Project profile: application
- Static analysis: enhanced-scoped-candidate-scan-completed
- Runtime verification: not-verified
- Experience verification: manifest-supplied
- Visual verification: evidence-manifest-supplied
- Scanned files: 10000
- Warnings: 0
- Not verified: 0

## Review items

- No confirmed warning-level static findings. This does not close the evidence gaps below.

## Evidence gaps

- No evidence gaps were recorded for the requested scope.

## Requested review coverage

- 视觉、交互与无障碍: visual-interaction-evidence: observed; interaction-feedback-evidence: observed; responsive-evidence: observed; accessibility-evidence: observed; experience-review: observed

## Evidence inventory

| Area | Assessment | Status | Evidence | Candidate signal |
| --- | --- | --- | --- | --- |
| project-profile | observed | observed | package.json:1 | Node package profile; 4711 text source file(s) examined |
| visual-interaction-evidence | observed | observed | scripts/lib/test-ci-runner-policy.test.mjs:35, src/app/__tests__/AntdThemeBridge.test.tsx:1, src/app/__tests__/AppRouteError.test.tsx:2 (+22 more) | 199 candidate component or browser interaction test detected |
| responsive-evidence | observed | observed | .coverage/lcov-report/prettify.js:2, .coverage/prettify.js:2, src/components/shared/EnhancedStyleSwitcher.tsx:233 (+22 more) | 127 candidate responsive layout detected |
| accessibility-evidence | observed | observed | public/assets/startup-resource-guard.v1.js:24, scripts/generate-precompiled-display-routes.mjs:109, scripts/lib/display-routing-browser-capture.mjs:148 (+22 more) | 385 candidate accessibility semantic detected |
| interaction-feedback-evidence | observed | observed | .coverage/lcov-report/sorter.js:192, .coverage/sorter.js:192, scripts/lib/display-routing-browser-export-audit.mjs:373 (+22 more) | 374 candidate interaction or user-feedback implementation detected |
| experience-review | observed | observed | .common-tools/reports/layout-routing-audit/experience-evidence/screenshots/first-visit-desktop.png:1, .common-tools/reports/layout-routing-audit/experience-evidence/experience-console-summary.json:1, .common-tools/reports/layout-routing-audit/experience-evidence/screenshots/core-flow-diagram.png:1 (+12 more) | 8/8 required experience scenario(s) verified; 0 failed, 0 not verified |

## Local runtime gates

| Gate | Status | Duration (ms) |
| --- | --- | ---: |
| not requested | not-verified | 0 |

## Experience evidence

- Supplied scenarios: 8
- A supplied manifest proves only that bounded capture files exist. Inspect every screenshot and console/network artifact before promoting a scenario to verified health.

## Interpretation

- Audit level controls depth and evidence expectations; it does not authorize browser automation, project gates, or remote upload.
- `observed` means candidate source or artifact evidence was found; it is not a design-quality pass.
- `not-verified` requires real browser, keyboard, responsive, accessibility, network, gate, or deployment evidence.
- Runtime gates run only when explicitly requested locally; this audit never runs project code by default.
- Possible-secret evidence identifies only relative paths and line numbers. It never includes matched values.
