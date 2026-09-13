# Layout and Routing Capability Review - September 2026

## Executive summary

Vizly's flowchart layout and connector stack is now past the "basic React Flow renderer" tier. The current implementation owns a domain-specific layout pipeline, orthogonal/dogleg routing, terminal anchoring, final safety repair, commercial-clearance checks, precompiled route artifacts, and browser-backed smoke verification. That puts it ahead of commodity documentation renderers and most React Flow examples for enterprise flowcharts.

It is not yet at the level of a general-purpose commercial graph engine such as yFiles. The main remaining gap is not another small micro-optimization; it is productizing the routing engine as an observable, deterministic, bounded subsystem with formal contracts for ports, lane constraints, edit stability, partial recomputation, and degraded fallback.

This document intentionally avoids committing local trace evidence. The `.common-tools/` and `.common-tools-audit/` folders remain local audit/profiling evidence and should not be committed.

## Scope reviewed

- Flowchart node layout and compact layout selection.
- Orthogonal/dogleg connector routing and final path safety.
- Terminal/port anchoring, endpoint order, stubs, and parallel-edge readability.
- Large-diagram precompiled route generation and browser smoke flow.
- Recent optimization commits up to `4d9ac8e8 Reuse exact commercial clearance node lookup`.

Out of scope for this checkpoint: unrelated warehouse 3D, storage/S3, template/version-history, package changes, and local Common Tools evidence directories currently present in the working tree.

## Current capability level

### Strengths

1. **Domain-specific layout semantics**
   - Supports swimlane/container-aware spacing and flow-envelope compaction.
   - Uses quality scoring to choose among candidate layouts rather than accepting a single generated arrangement.
   - Preserves terminal/edit stability where candidate quality is tied.

2. **Connector readability and safety**
   - Has explicit endpoint anchoring, terminal axis handling, final safety checks, commercial clearance, and post-render finalization.
   - Handles redundant or unsafe finalization paths with short-circuit/no-op guards, reducing unnecessary recomputation while preserving safety semantics.
   - Contains diagnostics for strict crossing and candidate routing phases.

3. **Large-diagram operational path**
   - Uses precompiled display route artifacts and checks them separately.
   - Keeps build, bundle, and route generation gates distinct instead of treating TypeScript/build success as visual acceptance.
   - Uses local browser/CDP verification for high-risk rendering paths.

4. **Recent performance hygiene**
   - Recent commits reduced repeated node lookup, repeated final readiness work, redundant relock, redundant quality scoring, and no-op repair passes.
   - These optimizations are valuable because they remove algorithmic duplication without changing the routing model or weakening safety rules.

### Current constraints

1. **Routing is still heavily heuristic**
   - The pipeline has many specialized repair and scoring stages. That is pragmatic, but it makes correctness harder to explain than a single formal routing model.

2. **Trace variance is high**
   - Single-run `routeMs` changes are noisy. Future performance conclusions should use repeated samples, fixed presets, and phase-level deltas instead of one-off timings.

3. **Fallback behavior needs stronger product definition**
   - When an ideal route is impossible, the system should have explicit degraded states: acceptable crossing, warning overlay, manual-edit affordance, or compact reroute fallback.

4. **Manual connector editing is not yet first-class**
   - The engine is strongest in automatic display routing. Industry products often combine automatic routing with user-overridable paths, route locks, and repair-on-edit semantics.

## Industry comparison

| Capability area | Vizly today | Mermaid | React Flow + common layout libs | GoJS | yFiles |
| --- | --- | --- | --- | --- | --- |
| Node layout | Domain-specific candidate scoring and lane/container handling | Declarative diagram rendering; Mermaid now defaults flowcharts to ELK for larger/complex diagrams | React Flow delegates layout; official docs list Dagre/D3/ELK options and note React Flow does not ship its own layout engine | Built-in layouts and diagram model | Broad commercial automatic layout family |
| Edge routing | Custom orthogonal/dogleg routing, terminals, final safety, commercial clearance | Mostly renderer-level layout output | Edge routing is limited; React Flow points to libavoid/custom techniques for node-avoiding routes | Orthogonal, AvoidsNodes, routers, jump-over/gap, endpoint segment controls | Orthogonal/channel/bus routers, port candidates, grid routing, grouped graph support |
| Incremental/edit stability | Some terminal-preserving and no-op safeguards; improving | Limited | App-specific | Stronger built-in interactive model | Mature incremental layout/routing concepts |
| Large graph readiness | Precompiled routes, bundle/build checks, CDP smoke | Good for documentation diagrams, less app-specific control | Depends on chosen engine and app implementation | Mature but still requires modeling/perf tuning | Mature and configurable |
| Product UX around routing | Status/overlay and diagnostics exist, but manual route lifecycle is still immature | Minimal | App-built | Richer diagram interactions | Rich commercial-grade tooling |

### Interpretation

- **Ahead of Mermaid** for application-grade interactive editing, custom safety, and domain-specific large-flow handling. Mermaid is excellent for text-to-diagram documentation, not for Vizly-style editable routing control.
- **Ahead of default React Flow** because Vizly implements its own layout/routing decisions. React Flow's own documentation positions layout and edge routing as external/custom concerns.
- **Comparable to parts of GoJS** on orthogonal route presentation and endpoint control, but GoJS has a more mature built-in interaction/router abstraction and route editing surface.
- **Behind yFiles** in generality and formal routing breadth. yFiles exposes mature orthogonal, channel, bus-style, grid, port-candidate, grouped-graph, and incremental concepts that Vizly currently approximates through specialized pipeline stages.

## Recently landed engineering value

Recent commits form one coherent batch: reduce duplicated finalizer/routing work while keeping safety gates intact.

- `a4ded4c3` - cache terminal-preserving stair metrics.
- `85ecfd85` - reuse clearance geometry in commercial repair.
- `afdd96ee` - avoid repeated commercial final readiness work.
- `3141490a` - reuse final safety stub evidence.
- `6b50eaaa` - short-circuit final safety hard rejects.
- `77ca979c` - skip no-op final safety stub repair.
- `dfba0b37` - reuse endpoint trunk sibling ordering.
- `d9c50b52` - reuse commercial clearance fixed point.
- `707aea46` - skip no-op terminal commit quality scoring.
- `19f275e0` - reuse terminal commit node lookup.
- `d777a461` - reuse topology terminal node lookup.
- `3cf8ae4a` - skip redundant commercial safety relock.
- `4d9ac8e8` - reuse exact commercial clearance node lookup.

The important part is not any single micro-gain. The batch moves the pipeline toward a better invariant: expensive safety and geometry stages should be lazy, shared within a transaction, and skipped when inputs are already proven unchanged.

## Priority gaps

### P0 - must resolve before calling the engine enterprise-grade

1. **Formal routing contract**
   - Define required invariants for every final display edge: terminal side, stub minimum, node clearance, lane/container respect, crossing policy, label safety, and fallback state.
   - Add a single verifier that can classify violations by severity and source phase.

2. **Deterministic acceptance matrix**
   - Establish fixed benchmark diagrams and sample counts for large WMS, dense parallel edges, swimlane/container, cross-lane, and edit-stability cases.
   - Store only compact committed fixtures/manifests; keep raw traces local.

3. **Explicit degraded routing UX**
   - If perfect routing is impossible, surface a stable degraded state rather than silently adding more repair passes.

### P1 - high leverage next improvements

1. **Incremental routing boundary**
   - Move from whole-pipeline re-finalization toward dirty-region routing keyed by changed nodes, changed handles, changed lanes, and affected edge neighborhoods.

2. **Manual route override lifecycle**
   - Add route lock, user-edited waypoints, stale-route detection, and revalidate-on-layout-change behavior.

3. **Lane/channel model**
   - Consolidate ad hoc trunk, sibling, stair, and clearance logic into explicit routing channels. This is the closest next step toward yFiles-style channel/bus concepts without replacing the engine.

4. **Phase budget telemetry**
   - Keep phase instrumentation but promote it to a stable developer report: median/p95 by preset, changed commit, and fail/pass thresholds.

### P2 - product polish and extensibility

1. **Interactive diagnostics**
   - Let users inspect why a route was placed where it was: blocked by node, lane constraint, terminal side, commercial clearance, label avoidance, or fallback.

2. **Template-level routing profiles**
   - Allow diagram templates to choose routing profiles: compact documentation, operational process, dense system map, swimlane process, or manual-first.

3. **Export/readability parity**
   - Ensure SVG/PNG/PDF export retains edge readability, labels, jump markers, and route warnings.

## Recommended next roadmap

### Phase 1 - stabilize the contract

- Write the routing invariant document and make it executable through a verifier.
- Add deterministic acceptance fixtures for the top five diagram classes.
- Gate precompiled route checks on semantic failures, not only build success.

### Phase 2 - make routing incremental

- Introduce dirty-region descriptors and edge-neighborhood invalidation.
- Cache immutable geometry snapshots per route transaction.
- Replace broad finalizer passes with targeted reroute/finalize steps.

### Phase 3 - productize user control

- Add route locks/manual waypoints.
- Add user-facing degraded route indicators.
- Add reroute selected edge / reroute affected region actions.

### Phase 4 - benchmark against commercial-grade behavior

- Compare against yFiles/GoJS conceptually by scenario, not by implementation details.
- Track acceptance outcomes: no node intersection, bounded crossings, stable endpoints, readable labels, acceptable route time, and no visual jumps after small edits.

## Validation policy for future batches

Use the lightest gate that proves the changed behavior, but do not substitute a weaker check for a broader claim.

- Routing/finalizer logic: focused Vitest files for worker pipeline, commercial detours, final endpoint evaluation/order, terminal commit, and topology incremental behavior.
- Architecture/type safety: `npm run typecheck`, `npm run check:explicit-any`, `npm run check:source-size`, `npm run check:architecture`.
- Browser/precompiled path: production build + preview + `npm run generate:precompiled-routes` + `npm run check:precompiled-routes` + `npm run check:bundle`.
- Local profiling: write raw traces under `.common-tools/reports/layout-routing-audit/`; do not commit them.

## Non-goals

- Do not replace the current engine with yFiles/GoJS solely to match a feature checklist.
- Do not keep chasing single-run route timing noise.
- Do not loosen safety rules, baselines, or tests to make benchmarks look better.
- Do not commit `.common-tools/` or `.common-tools-audit/` evidence directories.

## Source references for industry baseline

- yFiles automatic graph layout overview: https://docs.yworks.com/yfiles/doc/developers-guide/layout.html
- yFiles orthogonal edge routing options: https://docs.yworks.com/yfiles/doc/developers-guide/orthogonal_edge_router.html
- React Flow layouting overview: https://reactflow.dev/learn/layouting/layouting
- GoJS link routing overview: https://gojs.net/latest/learn/links
- Mermaid flowchart renderer configuration: https://mermaid.js.org/syntax/flowchart.html#renderer
