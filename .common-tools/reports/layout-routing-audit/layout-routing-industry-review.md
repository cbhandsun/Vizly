# Vizly 布局与连线能力行业审视

日期：2026-09-12
范围：流程图布局、显示路由、端口与连接规则、边编辑、布局交互与性能。未修改业务源码。

## 1. 总体判断

Vizly 已明显超出 React Flow 的基础能力，几何路由完整度接近专业图编辑器：具备多布局引擎、复合域/泳道布局、Worker 正交避障、bus/shared trunk、line jump、标签避碰、增量脏边路由和手工边编辑。

当前与 yFiles、JointJS 等成熟图形平台的主要差距，已经不是“有没有避障”，而是：

1. 缺少模型级语义端口和多关系连接表达；
2. 布局没有形成 pinned node、选区布局、增量布局和 mental-map preservation 契约；
3. 全量布局延迟与长任务偏高；
4. 能力很强，但布局菜单和边编辑仍暴露较多引擎概念，任务导向与可发现性不足；
5. 有一个稳定复现的 Worker/DOM 几何同步门禁失败。

结论置信度：中高。已做生产构建、静态链路检查、CDP 视觉/交互验证和 20 场景布局矩阵；尚未覆盖超大图、触屏端和多人协作下的布局冲突。

## 2. 行业能力矩阵

| 能力 | Vizly | React Flow 基础 | JointJS | yFiles / ELK | diagrams.net / Miro |
|---|---|---|---|---|---|
| 自动布局 | ELK、Dagre、Tree、Force、域/泳道、四方向 | 不内置布局，主要提供集成范式 | 可组合布局与路由 | 算法、约束、增量与复合图最完整 | 用户任务化入口强，算法暴露少 |
| 复合域/泳道 | 强，且有域内排布组合 | 需自行实现 | 支持嵌套与端口组 | 强，ELK/yFiles 原生复合图能力成熟 | 强调容器/泳道使用体验 |
| 正交避障 | 强，Worker、缓存、硬质量门禁 | 需自行实现 | Manhattan/Metro | EdgeRouter 标杆 | 成熟、可预期 |
| bus / shared trunk / line jump | 已实现 | 需自行实现 | Jumpover 等可组合 | edge grouping / bus routing 强 | line jump 与手工连接成熟 |
| 边编辑 | waypoint、线段拖动、标签、reconnect 均有 | 可自定义 | 工具体系成熟 | 完整 | 可发现性最好 |
| 语义端口 | 主要是几何方向和成本 | Handle 为底层连接点 | Port groups、属性与验证较成熟 | port candidates/constraints 完整 | 固定/浮动连接点清晰 |
| 并行边/自环 | 当前统一校验禁止 | 可支持 | 可支持 | 原生支持 | 可支持 |
| 增量布局/固定节点 | 增量路由强；布局侧缺少真实契约 | 需自行实现 | 可自行组合 | yFiles Partial/Incremental 标杆 | 交互式局部调整体验成熟 |
| 面向用户的布局 UX | 已开始任务化，但高级菜单仍深且密 | 取决于应用 | 取决于应用 | 主要是 SDK | 最成熟 |

## 3. 已验证优势

- 20 个 CDP 布局/编辑场景中 19 个通过：compound ELK、domain lanes、full ELK、tree 的 TB/BT/LR/RL，以及拓扑编辑、多页往返、业务编辑稳定性和泳道编辑稳定性。
- 代表性布局均满足：节点穿越 0、minimum/commercial clearance risk 0、非法正交段 0、端点脱离 0。
- 交叉不再简单视为失败：部分场景有几何交叉，但均由 line jump 桥接，`strictCrossings` 为 0。
- Logistics 14 节点/14 边在 0.5×、1×、2×、light/dark/high-contrast 下通过显示验证。
- 边可从稳定自动路由状态通过右键“转为可编辑”进入编辑模式，自动聚焦至 0.8×，同时显示属性面板和编辑工具。
- 手工连接会持久化 `manualHandles: true`；Handle 方向解析已集中到 `handleUtils.ts`。

## 4. 优先级发现

### P1-1：修复 compound-ELK-LR 后移动几何同步

- 证据：`domain-compound-elk-lr` 稳定失败；`positionMismatchCount=1`、`maxPositionDelta=2.06px`，门槛 1.5px，独立重跑一致。
- 影响：当前视觉差异很小，但 Worker、模型与 DOM 不再共享同一几何真相，可能污染后续端点吸附、局部重路由和缓存命中。
- 建议：统一 post-layout move 的坐标量化、容器局部/绝对坐标转换和 Worker 快照来源；禁止靠放宽阈值通过。
- 验收：该场景连续 20 次通过，矩阵 20/20；位置误差 P100 不超过 1.5px，且 route signature 稳定。

### P1-2：建立模型级 `PortDefinition` 与连接契约

- 证据：现有端口模型主要是 top/right/bottom/left、成本和使用次数；缺少统一的 `role`、`dataType`、`group`、`capacity`、`required`、`accepts` 等定义。连接规则只允许插件返回布尔值。
- 影响：难以可靠表达 input/output、控制流/数据流、端口容量、类型兼容、必连端口和领域校验；规则分散后可解释性差。
- 建议：引入 `PortDefinition`、`EdgeRelationDefinition` 和结构化 `ConnectionValidationResult { code, message, severity }`；路由层只消费解析后的几何投影。
- 验收：端口模型有 parse/coerce/validate；覆盖类型匹配、容量、方向、缺失端口、非法导入和插件扩展；UI 能展示拒绝原因。

### P1-3：允许并行边，按产品类型决定自环

- 证据：`useConnectionValidation.ts` 无条件禁止自环，并仅按 `source -> target` 去重，忽略 sourceHandle、targetHandle 和 relation key。
- 影响：同一节点对无法表达 Yes/No、success/failure、多数据通道或不同端口关系；ELK 明确支持 self-loop 与 multi-edge，而 Vizly 在入口处提前丢失这种能力。
- 建议：唯一性至少改为 `(source, sourcePort, target, targetPort, relationKey)`；自环改为 diagram/plugin policy；为平行边增加 lane index 与标签避碰策略。
- 验收：2、5、20 条并行边和自环在四方向布局下均可创建、保存、导出、重连和重路由，无重叠/丢边。

### P1-4：布局需支持固定节点、选区和心智地图保持

- 证据：`LayoutNodeData.fixed` 只有类型声明；`enableIncrementalLayout` 只有配置声明。全图布局入口把全部业务节点传入布局，不读取 `selected`、节点 lock 或 fixed 标记。当前 lock 主要阻止直接编辑，不构成布局约束。
- 影响：用户手工摆好的关键节点会被全量重排；大图难以局部整理；连续布局方向或少量拓扑变化时视觉跳动大。
- 建议：先定义布局作用域 `all | selection | neighborhood` 和约束 `pinnedNodeIds`、`preserveOrder`、`preserveRanks`、`maxDisplacement`，再接 ELK/yFiles 风格增量策略。
- 验收：锁定节点位移为 0；选区外节点位移为 0；增删单节点后未受影响节点 P95 位移低于一倍节点宽度；撤销完全恢复。

### P2-1：降低全量布局延迟与主线程长任务

- 证据：15 个成功布局 case 的 `inputToVisualStableMs` 为 0.98–6.54s，中位数 1.77s；`longTaskMaxMs` 最高 566ms。代表场景：domain-lanes-LR 3.61s、tree-TB 3.71s、domain-ELK-TB 6.54s。增量拖动 release→final 为 243–340ms，Worker 109–198ms，并观察到 120ms 以上长任务。
- 影响：布局按钮会给用户“卡住/结果迟到”的感受，TB 和复杂布局方向尤其明显。
- 建议：区分 `interactive preview` 与 `commercial final`；先在 100ms 内发布低成本预览，再后台完成硬质量闭环。缓存动态导入和图结构分析，减少重复 full-route fallback；分帧 fit/render reconcile。
- 验收：30 节点 P95 首反馈 <100ms、final <1s；100 节点 final <2.5s；交互长任务 P95 <50ms，P100 <100ms；不降低硬几何门禁。

### P2-2：进一步任务化布局菜单

- 证据：当前顶层已从算法名改成“标准流程/复杂流程/泳道”，方向正确；但当前样例仍显示 11 个顶层可聚焦项，全量嵌套约 29–31 个叶动作，并出现“固定全局阶段/固定域内紧凑”等内部语义。
- 影响：非图算法用户难以预测差异，试错成本高；高级引擎与业务目标混在同一菜单。
- 建议：一级只保留“智能整理、流程、泳道、关系探索、保持手工位置”；二级用预览缩略图选择方向；算法、rank mode、间距放入“高级”。保留最近使用与一键恢复上次布局。
- 验收：一级动作不超过 5 个；新用户在不理解 ELK/Dagre 的情况下 30 秒内完成目标布局；取消或预览不会写历史。

### P2-3：提升边编辑可发现性和模式一致性

- 证据：稳定自动路由边单击只显示 trace 高亮；需右键“转为可编辑”后才自动放大并显示编辑属性。代码中 waypoint/segment 已有键盘 slider 语义，但低缩放下控件仍不易发现。
- 影响：能力存在但用户不易知道；“自动路由边”与“可编辑边”的状态切换增加心智负担。
- 建议：选中边后直接显示轻量浮动工具条，明确“自动/手工路径”状态；悬停显示中点编辑柄；首次使用给一次性提示；切手工时冻结当前路径并说明自动路由影响范围。
- 验收：首次用户两步内进入线段编辑；自动/手工切换不改变端点或标签；键盘可完成增加、移动、删除 waypoint。

### P2-4：fit-all 下做语义缩放与容器紧凑化

- 证据：Logistics 样例自动适配约 47%，文本和边标签明显偏小；跨域长折线和容器内部空白增加扫描距离。
- 影响：几何正确但阅读效率不足，强布局能力没有完全转化为信息可读性。
- 建议：低于 60% 时隐藏次级说明、放大主标签/边标签、弱化次要边；把容器空白、总线长度、标签可读性纳入布局评分；提供“紧凑/演示/编辑”密度预设。
- 验收：fit-all 时主标签最小屏幕字号 >=11px，点击/触控目标 >=24px；容器空白率和总边长相较当前样例下降 20%，无新增硬几何风险。

### P3：高级图语义

- 自环可配置路由；
- hyperedge/junction node；
- edge-to-edge 连接；
- 端口组折叠与批量连接；
- 总线语义对象，而不仅是几何共享干线。

## 5. 推荐演进路线

1. **稳定性周**：修复 compound-ELK-LR 几何同步，矩阵恢复 20/20。
2. **连接模型阶段**：PortDefinition、relation key、parallel edges、结构化校验原因。
3. **局部布局阶段**：pinned node、selection scope、neighborhood scope、mental-map 指标。
4. **性能阶段**：预览/最终两阶段布局，缓存和 fallback 治理，建立 30/100/500 节点预算。
5. **体验阶段**：布局菜单收敛、边编辑直达、语义缩放和密度预设。

## 6. 已运行验证与限制

- 生产构建成功：Vite 8.1.5，8,860 modules，约 16.9s。存在 `LayoutOptimizer.ts` 动态与静态同时导入导致动态加载不生效的警告。
- CDP：20 个布局/编辑场景，19 通过、1 稳定失败；视觉截图覆盖布局菜单、边选中、边右键与转可编辑状态。
- 未验证：500+ 节点预算、移动端触摸边编辑、协作冲突、屏幕阅读器端到端、打印/PDF 的极端图。

## 7. 官方行业参考

- yFiles Edge Routing: https://docs.yworks.com/yfiles-html/dguide/polyline_router/
- yFiles EdgeRouter API: https://docs.yworks.com/yfiles-html/api/EdgeRouter.html
- JointJS Ports: https://docs.jointjs.com/learn/features/ports/
- JointJS Routers: https://docs.jointjs.com/api/routers/
- React Flow Layouting: https://reactflow.dev/learn/layouting/layouting
- React Flow Handle: https://reactflow.dev/api-reference/components/handle
- ELK Layered: https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html
- GoJS Router API: https://gojs.net/latest/api/symbols/Router.html
- diagrams.net Connectors: https://www.diagrams.net/doc/faq/connectors

## 8. 2026-09-12 落地更新（本轮继续审视后）

> 上方原始审视报告记录的是“未修改业务源码”的静态/体验审视结论；本节记录随后已经落地的代码级修复与验证。

### 已落地

1. **几何同步修复**：布局后会在进入路由快照前对齐 React Flow 内部绝对坐标与 compound child clamp 结果，`domain-compound-elk-lr` 的 post-layout move 几何一致性已恢复到 `positionMismatchCount=0`、`maxPositionDelta=0`。
2. **连接契约第一阶段**：连接去重从单纯 `source -> target` 扩展为包含 handle/relation 的精确重复判断；允许不同 handle 或不同关系 key/type 的并行边；自环默认禁止，但插件可通过 `connectionPolicy.allowSelfLoop` 显式放开。
3. **固定布局位置**：布局计算会保留业务节点 `data.fixed=true` 的绝对位置；生成容器不会因为 `draggable:false` 被误判为用户固定节点；候选布局若污染干净图，会回退保护。
4. **局部布局**：新增 `all | selection | selection-neighborhood` 作用域解析与合并策略，支持选区、后代、邻域、上下文容器和 locked/fixed 节点分层；编辑器命令和工具栏均可触发。
5. **布局菜单任务化补强**：新增“局部布局 / 只布局选区 / 布局选区邻域”，并复用当前活跃布局语义，避免局部布局退回错误算法。
6. **布局固定与编辑锁解耦**：右键菜单与悬浮工具条新增“固定布局位置 / 取消固定布局位置”，只写入 `data.fixed`，不写入 `locked` 或 `draggable:false`。
7. **CDP 可见启动开关**：`PRECOMPILED_ROUTE_VISIBLE=1` 时 CDP helper 不再加 `--headless=new`，并设置 `windowsHide:false`，用于需要亲眼看浏览器窗口的验证。

### 本轮验证

- Focused Vitest：11 files / 191 tests passed，覆盖连接校验、布局作用域、布局事务、菜单、命令、几何同步、布局固定 UI/action。
- CDP：`debug-layout-pin-ui.mjs` 通过，确认固定布局按钮写入 `fixed:true` 且未 mutation-lock；`debug-scoped-layout-ui.mjs` 通过，确认选区局部布局 committed 且 hardClean。
- CDP matrix：`domain-compound-elk-lr` 通过，post-layout move `positionMismatchCount=0`、`maxPositionDelta=0`。
- Gates：`typecheck:strict-core`、`typecheck`、`check:explicit-any`、`check:architecture`、`check:test-ci-coverage`、`build`、`check:bundle` 均通过。

### 仍建议后续优化

1. **P1：模型级 PortDefinition / EdgeRelationDefinition** 仍是行业差距核心，需要把 role、capacity、accepts、required、dataType 和结构化拒绝原因沉到模型边界。
2. **P2：并行边视觉 lane 与标签避碰** 已允许创建层面的并行关系，但还应补 lane index、标签错位与高密度平行边 CDP 矩阵。
3. **P2：性能预算** 当前 bundle gate 通过但总 JS `9984.30 KB` 已逼近 `10000 KiB` 硬上限；后续图形/布局能力新增前应优先做 chunk/动态导入治理。
4. **P3：语义缩放/密度预设** fit-all 下可读性仍有提升空间，建议把标签屏幕字号、容器空白率、总边长纳入布局评分。

### 2026-09-12 继续落地：结构化连接契约第一阶段

本轮继续推进 P1-2（模型级连接契约）的一部分，新增了可复用的连接验证结果模型与语义策略入口：

- 新增 `src/core/types/connection.ts`，定义 `DiagramConnectionPolicy`、`DiagramConnectionPortDefinition`、`DiagramConnectionRelationDefinition`、`ConnectionValidationResult` 与稳定的拒绝 `code`。
- 新增 `connectionValidationPolicy.ts`，把连接校验从布尔判断提升为 `validateConnectionDetailed(...) -> { valid, code, severity, message }`。
- `useConnectionValidation` 继续向 React Flow 暴露 `isValidConnection`，同时返回 `validateConnection`，为后续 UI 显示“为什么不能连”预留接口。
- 语义端口第一阶段支持：端口存在性、方向、容量、数据类型兼容、端口允许的 relation、relation-level role/type/self-loop 约束。
- 保留上一轮能力：不同 handle/relation 的并行边可创建；精确重复边仍拒绝；自环默认拒绝但可通过策略或 relation 打开。

验证：

- `useConnectionValidation.test.tsx`：10 tests passed，覆盖并行边、自环策略、结构化 code、语义端口方向/容量/类型/relation。
- Focused 回归：9 files / 134 tests passed。
- Gates：`typecheck:strict-core`、`typecheck`、`check:explicit-any`、`check:architecture`、`check:test-ci-coverage` 通过。
- Production：`npm run build` 通过；`check:bundle` 通过，但总 JS 升至 `9989.60 KB / 10000 KiB`，距离硬上限很近，下一阶段应优先做 bundle 拆分/瘦身。

### 2026-09-12 继续落地：连接拒绝原因可见化与 bundle 风险校准

本轮把结构化连接校验继续接到交互层：

- `useConnectionMicrointeractions` 新增 `lastConnectionValidation`，在连接结束时对候选连接做低频结构化校验；若失败，会阻止 fallback 连接并保留 `{ code, severity, message }`。
- `useDesignerInteractions` 将 `validateConnection` 注入连接交互层。
- `FlowchartDesignerView` 在画布内渲染轻量 `role="status"` 提示，用户能看到“为什么不能连接”，不再只是视觉上连不上。
- 新增 `useConnectionMicrointeractions.validation.test.tsx`，覆盖无效连接阻断、结构化原因暴露、重新连接开始时清空旧原因。

验证：

- `useConnectionMicrointeractions.validation.test.tsx`：2 tests passed。
- `LayoutOptimizer.test.ts`、`geometryUtils.real.test.ts`、`domainLaneAlignedFlow.test.ts`：3 files / 33 tests passed，用于确认失败的 bundle 瘦身实验回滚后布局质量恢复。
- Gates：`typecheck:strict-core`、`typecheck`、`check:explicit-any`、`check:architecture`、`check:test-ci-coverage`、`build`、`check:bundle` 通过。

重要风险校准：

- 尝试把 `geometryUtils.ensureMeasuredForNodes` 从 `LayoutOptimizer` 静态依赖中抽离时，WMS domain lane 可读性测试出现回归（例如 sharedLaneOverlap 与 LR lane extent 超预算）。该实验已回滚。
- 当前构建仍提示 `LayoutOptimizer.ts` 同时被动态和静态导入，且 bundle 总 JS 已达 `9990.28 KB / 10000 KiB`。后续 bundle 优化不能简单替换测量算法，必须先提炼与 LayoutOptimizer 完全等价、可被布局质量测试证明的轻量测量边界，或改预算统计/拆包策略。

### 2026-09-12 继续落地：连接拒绝提示维护性与自动消退

- 将连接拒绝提示从 JSX inline style 迁移到 `FlowchartDesigner.css` 的 `.connection-validation-status`，并增加 `data-validation-code`，便于后续按失败类型做样式或自动化验证。
- `useConnectionMicrointeractions` 对 `lastConnectionValidation` 增加 4.5s 自动消退，避免错误提示长期遮挡画布；新连接开始或连接成功仍会立即清空旧提示。
- 新测试覆盖：无效连接阻断、原因暴露、新连接清空、4.5s 自动消退。

验证：

- `useConnectionMicrointeractions.validation.test.tsx`：3 tests passed。
- `useConnectionValidation.test.tsx`：与连接契约 focused 回归通过。
- Gates：`typecheck:strict-core`、`typecheck`、`check:explicit-any`、`check:architecture`、`check:test-ci-coverage`、`build`、`check:bundle` 通过。
- Bundle 当前仍为 `9990.28 KB / 10000 KiB`，仅剩约 9.72 KiB 余量；这是后续继续加功能前的硬风险。

### 2026-09-12 继续审视：连接端点边界与局部布局运行时兜底

这次继续把“行业级连接/布局能力”的审视往模型边界补了一层，重点不是新增视觉花活，而是补齐编辑器在异常输入、脚本命令和运行时状态漂移下的硬边界：

- **连接端点存在性校验**：`validateConnectionDetailed(...)` 现在会拒绝 source/target 不存在于当前图的连接，新增稳定 code：`unknown-source-node`、`unknown-target-node`。这补上了 React Flow UI 通常会挡住、但命令/API/插件路径仍可能触达的边界。
- **连接验证调用收敛**：`useDesignerInteractions` 只创建一次 `useConnectionValidation(...)`，同时取 `isValidConnection` 与 `validateConnection`，减少重复 hook 与闭包路径，避免后续策略扩展时两份配置漂移。
- **类型导入瘦身**：`useConnectionValidation` 中 React Flow 与插件类型改为 `import type`，避免类型依赖被误保留为运行时依赖的风险。
- **局部布局 scope 运行时兜底**：`resolveLayoutScope(...)` 对类型混淆的 scope mode 回退到 `all`，防止非 TS 调用者或旧脚本传入未知 scope 字符串后进入半局部、半全局的不明确状态。
- **本地项目审计复核**：用 Common Tools local runtime 跑了 standard/enhanced 的 visual-interaction + engineering-delivery 候选扫描；静态扫描无 warning 级确认问题，但仍明确标记 runtime gates 与 experience/browser scenarios 未由该审计器验证。

验证：

- `useConnectionValidation.test.tsx` + `useConnectionMicrointeractions.validation.test.tsx`：2 files / 14 tests passed。
- `layoutScopeBoundary.test.ts` + `useLayoutStrategy.test.ts` + `useLayoutRoutingTransaction.test.tsx`：3 files / 114 tests passed。
- `common-tools-audit doctor`：healthy；增强审计产物：`.common-tools/reports/project-audit-layout-routing-cont/project-audit-report.md` 与 `.json`。

当前判断：P1 的连接契约已从“可创建/不可创建”推进到“可解释、可边界验证、可策略化”；但 P2 的并行边 lane/标签可视化、P2 的 bundle 余量、P3 的语义缩放仍未关闭，不能宣布整个布局/连线能力审视完成。

### 2026-09-12 继续落地：门禁债务校准与组件边界拆分

继续验证时发现新增布局/连接能力把若干文件推到了源码规模硬门禁边缘，已同步修正，避免用扩大 baseline 或忽略门禁的方式“假绿”：

- `useLayoutStrategy.ts` 拆出 `layoutStrategyCommitAttempt.ts`，把 scoped merge、fixed-node constraint、geometry constraint 与 commit transaction 的组合逻辑收敛成独立 helper。
- `useLayoutStrategy.ts` 拆出 `layoutStrategyPresetOptions.ts`，把 preset 显式/隐式 domain order、subDomainOrder 与 group options 解析从主布局入口移出。
- `FlowchartDesignerView.tsx` 拆出 `ConnectionValidationStatus.tsx` 与 `FlowchartCanvasStatusOverlay.tsx`，连接拒绝提示和布局进度提示成为独立展示组件。
- 保持 `FlowchartDesignerView.tsx`、`ModernFlowchartToolbar.tsx`、`useLayoutStrategy.ts` 均回到 source-size 门禁范围内，未提高 baseline。

补充验证：

- Focused Vitest：6 files / 144 tests passed。
- Gates：`typecheck:strict-core`、`typecheck`、`check:explicit-any`、`check:architecture`、`check:test-ci-coverage`、`check:source-size` 通过。
- Production：`npm run build` 通过；`check:bundle` 通过，但总 JS 为 `9991.35 KB / 10000 KiB`，仅剩约 `8.65 KiB`。继续加布局/连线功能前，bundle 治理已是 P1 风险。

补充 CDP 验证：

- `debug-layout-pin-ui.mjs` 通过：`start-calc` 固定后为 `fixed:true`，`draggable:null`，未触发 mutation lock。
- `debug-scoped-layout-ui.mjs` 通过：选区局部布局 committed，`hardClean:true`，选中节点仍存在。
- `DISPLAY_ROUTING_MATRIX_CASE=domain-compound-elk-lr npm run verify:display-routing-matrix` 通过：`hardClean:true`，post-layout move 的 `positionMismatchCount=0`、`maxPositionDelta=0`，视觉审计 label/node overlap 为 0。

### 2026-09-12 继续落地：并行边标签 lane 第一阶段

连接契约已经允许不同 handle/relation 的并行边；本轮补上第一阶段视觉呈现，避免“模型允许但画布上仍像一条边”的落差：

- 新增 `parallelEdgePresentation.ts`，对同一 directed source→target 的多条边分配稳定的 `parallelLaneIndex` / `parallelLaneCount`。
- 自动生成并行边标签错位 `labelOffset`，左右端口使用纵向错位，上下端口使用横向错位。
- 保留用户手动 `labelOffset`，只补 lane metadata，不覆盖人工标签位置。
- 当并行组退化为单边时，会清理由系统生成的 stale parallel metadata。
- `useFlowchartConnectionHandler` 与旧 `useFlowchartState` 连接创建路径都会在 `addEdge(...)` 后统一应用并行边 presentation。

验证：

- `parallelEdgePresentation.test.ts`：4 tests passed，覆盖稳定 lane 排序、上下端口横向错位、手工 labelOffset 保留、stale metadata 清理。
- Gates：`typecheck:strict-core`、`typecheck`、`check:explicit-any`、`check:architecture`、`check:test-ci-coverage`、`check:source-size` 通过。
- Production：`npm run build` 通过；`check:bundle` 通过，但总 JS 达 `9992.73 KB / 10000 KiB`，余量约 `7.27 KiB`。后续若要做 route-level parallel lane，必须先治理 bundle 或把逻辑放进已存在的 worker/chunk 边界。

### 2026-09-12 继续落地：并行边创建路径回归与可见 CDP 复核

本轮继续补齐上一轮未收尾的验证断点，并重新校准后续优化顺序：

- 为 `useFlowchartConnectionHandler` 增加回归测试，确认真实连接创建路径在 `addEdge(...)` 后会应用 `applyParallelEdgePresentation(...)`，第二条同向并行边会得到 `parallelLaneIndex`、`parallelLaneCount` 与自动 `labelOffset`。
- 测试刻意使用不同 handle 的同向连接，符合当前连接契约：精确重复边仍应被 React Flow / 校验层拒绝，不把“重复边”误当作“合法并行语义边”。
- 复跑主门禁后确认：类型、显式 any、架构、CI 覆盖、源码规模、生产构建和 bundle 仍保持绿色。
- 复核 bundle 风险：总 JS `9991.91 KB / 10000 KiB`，硬余量约 `8.09 KiB`；后续 route-level parallel lane、标签避障评分、语义缩放等能力必须优先放入已有 worker/chunk 边界，或先做 bundle 治理，不能继续向主路径加大块逻辑。
- 用 `PRECOMPILED_ROUTE_VISIBLE=1` 复跑 CDP：`debug-layout-pin-ui.mjs` 在 `http://127.0.0.1:4174/` 通过，确认可见浏览器模式下固定布局按钮将 `start-calc` 写为 `fixed:true`，且 `draggable:null`，没有误触 mutation lock。

验证：

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/useFlowchartConnectionHandler.test.tsx src/core/components/diagrams/__tests__/parallelEdgePresentation.test.ts`：2 files / 5 tests passed。
- `npm run typecheck:strict-core`：passed。
- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1192 test files covered。
- `npm run check:source-size`：passed，3177 source files。
- `npm run build`：passed，仍有既有 `LayoutOptimizer.ts` ineffective dynamic import warning。
- `npm run check:bundle`：passed，总 JS `9991.91 KB / 10000 KiB`；startup static JS `523.50 KB` raw / `167.52 KB` gzip。
- `git diff --check`：passed，仅 CRLF 提示。
- `PRECOMPILED_ROUTE_VISIBLE=1 node .common-tools/reports/layout-routing-audit/debug-layout-pin-ui.mjs`：passed。

当前审视结论：并行边从“模型允许”推进到“创建路径有稳定 presentation metadata”，但仍只是第一阶段；与 yFiles / JointJS+DirectedGraph / React Flow Pro 级别相比，还缺 route geometry lane separation、高密度并行边避障评分、用户可配置端口/关系 schema、以及 fit-all/semantic zoom 下的密度策略。下一步优先级应是先做 bundle/chunk 治理，再把 route-level parallel lane 放进 display-routing worker 的硬几何门禁里。

### 2026-09-12 继续落地：连接写入路径二次校验

本轮补齐连接创建的最后一道工程边界：之前连接拖拽结束路径会通过 `validateConnection` 阻断 fallback 候选，React Flow 也会用 `isValidConnection` 做实时 UI gate；但最终写入 edge 的 `enhancedOnConnect -> onConnect` 路径仍主要依赖上游已经正确拦截。为接近行业级图编辑器的“输入边界即写入边界”要求，本轮把结构化连接校验下沉到最终写入前：

- `useConnectionMicrointeractions.enhancedOnConnect(...)` 在调用 `onConnect` 前再次执行 `validateConnection`。
- 如果最终连接无效，会设置 `lastConnectionValidation`，清理连接高亮/preview/performance-mode 状态，并阻止 `onConnect` 与后续 edge success animation 的 `setEdges`。
- 抽出 `clearConnectionInteraction`，复用成功、失败、fallback 三条路径的状态清理，避免交互状态机继续复制粘贴膨胀。
- 新增回归测试覆盖直接进入最终写入路径的无效连接，确认不会写边、不会触发 edge animation、会暴露结构化拒绝原因。

验证：

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/useConnectionMicrointeractions.validation.test.tsx src/core/components/diagrams/hooks/__tests__/useFlowchartConnectionHandler.test.tsx src/core/components/diagrams/hooks/__tests__/useConnectionValidation.test.tsx`：3 files / 16 tests passed。
- `npm run typecheck:strict-core`：passed。
- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1192 test files covered。
- `npm run check:source-size`：passed，3177 source files。
- `npm run build`：passed，仍有既有 `LayoutOptimizer.ts` ineffective dynamic import warning。
- `npm run check:bundle`：passed，总 JS `9991.82 KB / 10000 KiB`；startup static JS `523.50 KB` raw / `167.52 KB` gzip。
- `git diff --check`：passed，仅 CRLF 提示。

当前判断：连接能力从“UI 实时校验 + fallback 校验”进一步推进到“最终写入边界也校验”。这对插件、脚本、React Flow 事件异常和未来命令式连线入口都更安全；下一步仍应优先处理 bundle/chunk 余量，再推进 route-level parallel lane 与语义缩放。

### 2026-09-12 继续落地：重连路径语义校验

本轮继续补齐连接生命周期的写入边界。上一轮已让最终 `onConnect` 写入前二次校验，但 React Flow 的 reconnect 路径仍是 `canReconnectEdge(oldEdge)` 后直接 `reconnectEdge(...)`，会绕过端口容量、关系契约、自环策略、未知端点等语义校验。为接近行业图编辑器的完整连接边界，本轮把相同的结构化校验接入重连：

- `validateConnectionDetailed(...)` 新增 `ignoredEdgeIds`，用于“替换旧边”时在 duplicate 与 source/target capacity 统计中忽略旧边自身。
- `useConnectionValidation.validateConnection(...)` 支持 runtime options，把 `ignoredEdgeIds` 透传到底层校验器。
- `handleReconnect(oldEdge, newConnection)` 在写入前构造 `{ ...oldEdge, ...newConnection }` 候选，保留旧边 `data/relation`，再用 `ignoredEdgeIds: new Set([oldEdge.id])` 校验。
- 无效重连不会 take snapshot，也不会调用 `setEdges(reconnectEdge(...))`。
- 新增回归测试确认：重连校验会忽略被替换旧边自身，避免旧边把自己误判为 duplicate/capacity；但其他占用同 source port 的边仍会触发 `source-port-capacity`，不会因为 ignoredEdgeIds 而放宽真实容量约束。

验证：

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/useConnectionValidation.test.tsx src/core/components/diagrams/hooks/__tests__/useConnectionMicrointeractions.validation.test.tsx src/core/components/diagrams/hooks/__tests__/useFlowchartConnectionHandler.test.tsx`：3 files / 17 tests passed。
- `npm run typecheck:strict-core`：passed。
- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1192 test files covered。
- `npm run check:source-size`：passed，3177 source files。
- `npm run build`：passed，仍有既有 `LayoutOptimizer.ts` ineffective dynamic import warning。
- `npm run check:bundle`：passed，总 JS `9991.96 KB / 10000 KiB`；startup static JS `523.50 KB` raw / `167.52 KB` gzip。
- `git diff --check`：passed，仅 CRLF 提示。

当前判断：连接生命周期现在覆盖了实时 UI 校验、fallback 候选校验、最终连接写入校验和重连写入校验。剩余主要差距从“连接合法性边界”转向“路线几何质量与高密度可读性”：route-level parallel lane、worker 内并行边避障评分、semantic zoom/density preset，以及必须先处理的 bundle/chunk 余量。

### 2026-09-12 继续落地：重连失败原因可见化

上一轮已把 reconnect 写入路径接入结构化连接校验，但无效重连仍会静默返回，用户只能感知“拖过去没生效”。本轮把 reconnect 失败接入已有连接拒绝反馈通道，避免再造一套提示系统：

- `useConnectionMicrointeractions` 返回 `setConnectionValidationFeedback`，复用同一个 `lastConnectionValidation` 状态、同一个画布 status overlay 和同一个 4.5s 自动消退逻辑。
- `handleReconnect(...)` 校验失败时调用 `setConnectionValidationFeedback(validation)`，用户能看到与普通连线一致的结构化拒绝原因。
- 重连成功时清空旧的连接拒绝提示，避免历史错误信息残留。
- 新增回归测试确认外部反馈入口会写入 `lastConnectionValidation`，并复用自动消退机制。

验证：

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/useConnectionMicrointeractions.validation.test.tsx src/core/components/diagrams/hooks/__tests__/useConnectionValidation.test.tsx src/core/components/diagrams/hooks/__tests__/useFlowchartConnectionHandler.test.tsx`：3 files / 18 tests passed。
- `npm run typecheck:strict-core`：passed。
- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1192 test files covered。
- `npm run check:source-size`：passed，3177 source files。
- `npm run build`：passed，仍有既有 `LayoutOptimizer.ts` ineffective dynamic import warning。
- `npm run check:bundle`：passed，总 JS `9992.07 KB / 10000 KiB`；startup static JS `523.50 KB` raw / `167.53 KB` gzip。
- `git diff --check`：passed，仅 CRLF 提示。

当前判断：连接/重连从“合法性边界完整”推进到“失败原因一致可见”。下一步继续推进前，bundle/chunk 余量已经是实际 P1：主包只剩约 7.93 KiB，route-level lane、semantic zoom 等后续能力应放入 worker/chunk 或先做瘦身。

### 2026-09-12 继续落地：审计证据补扫、依赖边界清理与可见 CDP 复核

本轮没有把审视收口为完成，而是继续补证据与工程余量边界：

- 使用 Common Tools project-audit 的 `standard` / `visual-interaction,engineering-delivery` 本地增强扫描补了一次候选证据盘点。扫描没有给出新的 confirmed warning，但明确保留两个证据缺口：runtime gates 与 experience/browser scenarios 仍需真实门禁和体验证据，不能把静态候选当成健康结论。
- 在 bundle/chunk 治理方向清理了一个直接依赖边界：`useTemplates` 不再从 `lodash` 引入 `cloneDeep`，改为本地 `structuredClone` + JSON fallback 的模板数据深拷贝，并移除 `package.json` 中未再直接使用的 `lodash` / `@types/lodash`。
- 增加 `useTemplates.test.tsx` 回归，确认保存模板与从模板创建图表时仍会深拷贝 nodes/edges，不会因为移除 lodash 引入共享引用。
- 重新用 `PRECOMPILED_ROUTE_VISIBLE=1` 跑可见 CDP：preview 在 `http://127.0.0.1:4174/`，`debug-layout-pin-ui.mjs` 通过，输出 `start-calc fixed:true draggable:null`。浏览器是脚本控制的短生命周期窗口，所以会打开后自动关闭。

验证：

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/hooks/__tests__/useTemplates.test.tsx`：1 file / 3 tests passed。
- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npm run typecheck:strict-core`：passed。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1192 test files covered。
- `npm run check:source-size`：passed，3177 source files。
- `npm run build`：passed，仍有既有 `LayoutOptimizer.ts` ineffective dynamic import warning。
- `npm run check:bundle`：passed，总 JS `9992.05 KB / 10000 KiB`；startup static JS `523.50 KB` raw / `167.52 KB` gzip。
- `git diff --check`：passed，仅 CRLF 提示。
- `npx -y npm@12.0.1 install`：passed，用 npm 12 恢复并验证依赖安装；`npm ci` 当前受 Windows native `.node` 文件锁影响失败于 `lightningcss.win32-x64-msvc.node` 的 unlink，属于本机文件占用/清理阻塞，未作为绿色结果声明。
- `PRECOMPILED_ROUTE_VISIBLE=1 node .common-tools/reports/layout-routing-audit/debug-layout-pin-ui.mjs`：passed。

当前判断：连接/布局能力继续向行业图编辑器靠近，但 P1 bundle 余量并未通过这次依赖清理获得实质释放，仍贴近 10 MiB 硬线。下一步如果继续落地 route-level parallel lane，应直接在 display-routing worker 的候选/硬门禁链路内做，并用高密度并行边 matrix + hard report 证明没有新增 obstacle/crossing/terminal 退化；否则先继续找可实际减少 emitted JS 的生产资产或依赖边界。

### 2026-09-12 继续落地：route-level parallel lane 进入 display-routing worker

本轮把并行边从“标签错位第一阶段”推进到“路线几何分道的保守候选”，实现位置放在 display-routing worker/finalizer 边界，避免继续把路线能力塞进 UI 主路径：

- 新增 `baseReactFlowDisplayParallelLaneSeparation.ts`。
- 对同一 directed source/sourceHandle/target/targetHandle/relation 的并行边组，按 edge id 稳定排序，尝试移动内部最长正交主干段，形成 route-level lane separation。
- 候选不会直接提交；worker finalizer 调用 `selectHardCleanDisplayParallelLaneCandidate(...)`，只有候选通过 `getDisplayHardQualityGateReport(...).hardClean === true` 才进入最终 response，否则保持原始 hard-clean 路线。
- 新增路线级 metadata：`parallelRouteLaneIndex`、`parallelRouteLaneCount`、`parallelRouteLaneOffset`、`parallelRouteLaneSeparated`，并在并行组退化为单边时清理 stale route-lane metadata。
- `baseReactFlowDisplayEdges.worker.ts` 在 final commercial safety closure 后接入该 hard-gated candidate，随后仍走既有 commit/final response 路径。
- 预编译路线 manifest 因 routing worker source hash 改变而重生成，并通过 stale check。

验证：

- `npx vitest run --environment=node --pool=threads --maxWorkers=2 src/core/components/shared/__tests__/baseReactFlowDisplayParallelLaneSeparation.test.ts`：1 file / 2 tests passed。覆盖同终端并行边内部主干分道、hard geometry gate clean、stale metadata 清理。
- `npx vitest run --environment=node --pool=threads --maxWorkers=2 src/core/components/shared/__tests__/baseReactFlowDisplayFinalization.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayWorkerPipeline.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayParallelLaneSeparation.test.ts`：3 files / 25 tests passed。
- `npm run typecheck:strict-core`：passed。
- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1193 test files covered。
- `npm run check:source-size`：passed，3179 source files。
- `npm run build`：passed，仍有既有 `LayoutOptimizer.ts` ineffective dynamic import warning。
- `npm run check:bundle`：passed，总 JS `9993.98 KB / 10000 KiB`；startup static JS `523.50 KB` raw / `167.52 KB` gzip。注意：worker 增加约 2 KiB，总余量进一步降到约 6 KiB，后续必须继续治理 bundle 或只在 worker 内小步增量。
- `PRECOMPILED_ROUTE_BASE_URL=http://127.0.0.1:4174 npm run generate:precompiled-routes`：生成 4 个 production precompiled route artifacts。
- `npm run check:precompiled-routes`：passed，4 entries。
- `PRECOMPILED_ROUTE_BASE_URL=http://127.0.0.1:4174 DISPLAY_ROUTING_MATRIX_CASE=domain-compound-elk-lr npm run verify:display-routing-matrix`：passed。关键证据：`hardClean:true`、`obstacleHits:0`、`strictCrossings:0`、`minimumClearanceRisks:0`、`commercialClearanceRisks:0`、post-layout move `positionMismatchCount:0`、`maxPositionDelta:0`、visual audit `labelNodeOverlapCount:0`、`labelLabelOverlapCount:0`。
- `git diff --check`：passed，仅 CRLF 提示。

当前判断：并行边能力已经从“连接契约允许 + 标签错位”推进到“worker 内 hard-gated route-level lane separation”。这仍是保守第一版：只处理同终端/同 relation 的 directed parallel group，复杂不同端口关系、跨组高密度 lane 规划、label/route 联合避障评分仍是下一步。P1 风险仍是 bundle 总量贴线。

### 2026-09-12 继续落地：并行边高密度与 fail-closed 回归覆盖

本轮继续补 route-level parallel lane 的压力覆盖，避免只用两条边的 happy path 证明能力：

- `baseReactFlowDisplayParallelLaneSeparation.test.ts` 从 2 个用例扩展到 4 个用例。
- 新增四条同终端并行边 bundle 测试，确认 lane offset 稳定分配到 `160/180/200/220` 四条内部主干线，覆盖高密度 deterministic ordering。
- 新增 fail-closed 测试：构造一个分道后会产生 strict crossing 的候选，确认 `selectHardCleanDisplayParallelLaneCandidate(...)` 在候选 hard gate 失败时保持输入 bundle，不提交 `parallelRouteLaneSeparated` metadata。
- 期间尝试用 obstacle blocker 做 dirty candidate，发现 hard gate fixture 没有精确触发；改为 strict-crossing fixture 后语义更稳定。该过程确认了测试不是在写“想当然”的断言，而是按 hard report 反馈调整。
- 做过一次临时 terser A/B 构建探索：`vite build --minify terser --outDir dist-terser` 失败，原因是 `terser` optional dependency 未安装。该方向可能带来 bundle 收益，但会引入构建工具依赖变更，暂未落地。

验证：

- `npx vitest run --environment=node --pool=threads --maxWorkers=2 src/core/components/shared/__tests__/baseReactFlowDisplayParallelLaneSeparation.test.ts`：1 file / 4 tests passed。
- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npm run check:test-ci-coverage`：passed，1193 test files covered。
- `npm run check:source-size`：passed，3179 source files。
- `git diff --check`：passed，仅 CRLF 提示。

当前判断：route-level parallel lane 现在不仅有单组分道，还补上了高密度 bundle 与 fail-closed 保障。下一步仍需要真实画布/矩阵级高密度并行边场景，以及继续治理 bundle 余量；当前总 JS 仍贴近硬线。

### 2026-09-12 继续落地：三点 L 形并行边分道、metadata 边界与生产 CDP 验证

本轮没有停在“已有 route-level parallel lane”结论，而是用真实生产浏览器高密度场景继续审视，发现并修复一个行业对标缺口：

- 首次 CDP synthetic 四并行边场景暴露：真实 worker 对两节点一弯连接常生成 3 点 L 形路径，之前的分道只覆盖 ≥4 点内部主干段，因此四条边仍完全重叠。
- 新增三点 L 路径分道：对 `source bottom -> target left` 这类 browser-emitted L route 使用单侧递增 outside lanes，而不是正负对称偏移，避免 hairpin/tiny dogleg；端点 stub 满足 hard terminal 最小 48px 要求。
- 保留 hard-gated fail-closed：候选必须经过 `getDisplayHardQualityGateReport(...).hardClean === true`，否则不提交。
- 修复 route-level metadata 被 routing patch sanitizer 丢弃的问题：把 `parallelRouteLaneIndex` / `parallelRouteLaneCount` / `parallelRouteLaneOffset` / `parallelRouteLaneSeparated` 建模为 routing-owned presentation tokens，并用 bounded number/boolean sanitizer 限制输入边界。
- 为避免 transaction 文件继续膨胀，新增 `baseReactFlowDisplayRoutingPatchDataSanitizers.ts` 承载 bounded metadata sanitizer helper，source-size 不靠 baseline 放宽。
- 新增/扩展回归：三点 L 四并行边 hard-clean 分道；trusted display patch 保留合法 lane metadata；非法 lane metadata 被拒。
- 新增生产 CDP 脚本：`.common-tools/reports/layout-routing-audit/debug-parallel-lane-browser.mjs`，在 production preview 中安装 2 节点 / 4 边高密度并行场景并审计真实 SVG。

验证：

- `npx vitest run --environment=node --pool=threads --maxWorkers=2 src/core/components/shared/__tests__/baseReactFlowDisplayParallelLaneSeparation.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayRoutingTransaction.test.ts`：2 files / 40 tests passed。
- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1193 test files covered。
- `npm run check:source-size`：passed，3180 source files。
- `npm run build`：passed，仍有既有 `LayoutOptimizer.ts` ineffective dynamic import warning。
- `npm run check:bundle`：passed，但总 JS `9996.36 KB / 10000 KiB`，只剩约 3.64 KiB 硬余量，是当前 P1 风险。
- `PRECOMPILED_ROUTE_BASE_URL=http://127.0.0.1:4174 npm run generate:precompiled-routes`：生成 4 个 production precompiled route artifacts。
- `npm run check:precompiled-routes`：passed，4 entries。
- `PRECOMPILED_ROUTE_BASE_URL=http://127.0.0.1:4174 node .common-tools/reports/layout-routing-audit/debug-parallel-lane-browser.mjs`：passed。关键证据：4 条边 `parallelRouteLaneSeparated:true`，lane offsets `24/48/72/96`，`hardClean:true`，`obstacleHits:0`，`minimumClearanceRisks:0`，`commercialClearanceRisks:0`，`labelNodeOverlapCount:0`，`labelLabelOverlapCount:0`。
- `git diff --check`：passed，仅 CRLF 提示。

当前判断：并行边能力现在覆盖两类行业常见路径：内部主干段分道与两节点一弯 L 形分道；并且真实浏览器生产路径能看到 lane metadata 和 SVG 分离效果。下一步优先级不应继续堆功能，而是先治理 bundle 硬余量（当前只剩约 3.64 KiB），否则后续 semantic zoom、label-route joint scoring、端口/关系 UI 等能力会被构建预算卡死。

### 2026-09-12 继续落地：并行边能力保留、非必要 metadata 瘦身以缓解 bundle P1

上一轮三点 L 形并行边分道已在生产 CDP 中验证，但为了保留 `parallelRouteLane*` 诊断 metadata，主线程 routing patch 边界和 worker 路线结果额外引入了较多生产 JS。考虑到总 JS 已贴近 10 MiB 硬线，本轮把证据策略从“metadata 证明”调整为“几何路径证明”：

- 保留 route-level parallel lane 几何分道能力，包括内部主干段分道与 browser-emitted 三点 L 形路线分道。
- 移除非必要的 `parallelRouteLaneIndex` / `parallelRouteLaneCount` / `parallelRouteLaneOffset` / `parallelRouteLaneSeparated` 生产持久化，不再把它们纳入 `RoutingPatchData` 和 trusted display patch sanitizer。
- 删除专门为这些 metadata 增加的 bounded sanitizer helper 模块，避免主线程边界代码继续膨胀。
- 单元测试改为验证路径坐标、hard gate 与 fail-closed，而不是验证 metadata 字段。
- CDP 脚本改为从真实 `computedPath` 推导 lane offsets，并验证四条 L 形并行边的几何分道为 `24/48/72/96`。

验证：

- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npx vitest run --environment=node --pool=threads --maxWorkers=2 src/core/components/shared/__tests__/baseReactFlowDisplayParallelLaneSeparation.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayRoutingTransaction.test.ts`：2 files / 38 tests passed。
- `npm run build`：passed，仍有既有 `LayoutOptimizer.ts` ineffective dynamic import warning。
- `npm run check:bundle`：passed，总 JS 从 `9996.36 KB / 10000 KiB` 降到 `9994.05 KB / 10000 KiB`；worker chunk 从约 `985.08 KB` 降到 `983.66 KB`。硬余量从约 `3.64 KiB` 回升到约 `5.95 KiB`，仍是 P1 风险但已避免 metadata 把预算继续推向硬线。
- `PRECOMPILED_ROUTE_BASE_URL=http://127.0.0.1:4174 npm run generate:precompiled-routes`：生成 4 个 production precompiled route artifacts。
- `npm run check:precompiled-routes`：passed，4 entries。
- `PRECOMPILED_ROUTE_BASE_URL=http://127.0.0.1:4174 node .common-tools/reports/layout-routing-audit/debug-parallel-lane-browser.mjs`：passed。关键证据：四条路径 lane offsets `24/48/72/96`，`hardClean:true`，`obstacleHits:0`，`minimumClearanceRisks:0`，`commercialClearanceRisks:0`，`labelNodeOverlapCount:0`，`labelLabelOverlapCount:0`。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1193 test files covered。
- `npm run check:source-size`：passed，3179 source files。
- `git diff --check`：passed，仅 CRLF 提示。

当前判断：这轮没有牺牲用户可见能力；并行边依然真实分道，只是把非必要内部 metadata 从生产 patch 边界中移除。后续仍应继续治理 bundle，尤其是既有 `LayoutOptimizer.ts` ineffective dynamic import 和大型 worker/chunk，否则继续添加 semantic zoom、label-route 联合避障或端口策略 UI 都会再次逼近硬线。

## 2026-09-12 连接反馈本地化与审计补充

### 行业对标结论

- 行业成熟图编辑器不会只给出工程英文错误或静默拒绝；连接失败需要面向用户解释，并且要能随界面语言切换。
- 本轮把 `ConnectionValidationResult.code` 作为稳定 UI 契约，新增 `details` 承载已清洗的 `port` / `relation` 插值数据；`ConnectionValidationStatus` 通过 `designer.connectionValidation.<code>` 解析本地化文案，保留结构化 `message` 作为 fallback。
- 中英文 locale 已覆盖插件拒绝、缺端点、未知节点、自环、重复连接、端口缺失/未知、方向、容量、类型不兼容、关系约束等连接失败原因。

### 已落地代码

- `src/core/types/connection.ts`：`ConnectionValidationResult.details?: Readonly<Record<string, string>>`。
- `src/core/components/diagrams/ConnectionValidationStatus.tsx`：接入 `react-i18next`，按 validation code 渲染本地化 status 文案。
- `src/core/components/diagrams/hooks/connectionValidationPolicy.ts`：动态端口/关系失败携带安全 details。
- `src/locales/en.json` / `src/locales/zh.json`：新增 `designer.connectionValidation` 文案。
- `src/core/components/diagrams/__tests__/ConnectionValidationStatus.test.tsx`：覆盖本地化插值、fallback 和有效/空状态不渲染。

### 本地审计补充

- 执行 Common Tools 本地 `project-audit` 标准四域候选扫描：`.common-tools/reports/project-audit/project-audit-report.md` / `.json`。
- 审计 warning 为 7 个 possible secret candidate。逐项抽检后，其中 6 个是安全/脱敏测试的伪 secret，`src/context/AuthContext.tsx:43` 是 OAuth hash 字段名探测；随后 `npm run check:secrets` 通过：`No potential secrets found in 3393 tracked or untracked text files.`
- 体验审计仍标记 `not-verified`：尚未完整采集 first-visit / core-flow / state-feedback / responsive / keyboard 五类截图与交互证据，不能声称完整 UX/WCAG 健康。

### 验证证据

- Focused tests：`npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/__tests__/ConnectionValidationStatus.test.tsx src/core/components/diagrams/hooks/__tests__/useConnectionValidation.test.tsx src/core/components/diagrams/hooks/__tests__/useConnectionMicrointeractions.validation.test.tsx`，3 files / 20 tests passed。
- `npm run typecheck`：passed。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:test-ci-coverage`：passed，1194 test files covered。
- `npm run check:source-size`：passed，3181 source files。
- `npm run build`：passed。
- `npm run check:bundle`：passed；total JS `9993.73 KB / 10000 KiB`，startup static JS `523.50 KB raw / 167.53 KB gzip`。
- `npm run generate:precompiled-routes` + `npm run check:precompiled-routes`：4 production precompiled route artifacts passed。
- CDP browser route-level lane verification：4 parallel edges separated with offsets `24 / 48 / 72 / 96`; `hardClean: true`; `obstacleHits: 0`; `minimumClearanceRisks: 0`; `commercialClearanceRisks: 0`; `labelNodeOverlapCount: 0`; `labelLabelOverlapCount: 0`。
- `git diff --check`：passed；remaining CRLF messages are Git line-ending warnings only.

### 剩余 P1 风险

- Bundle hard margin 只剩约 `6.27 KiB`。继续增加布局/连线能力前，应优先治理总 JS 体积，尤其是 3D/Three、display worker、导出链路等大块；不能通过提高预算或恢复 terser 实验制造绿色。
- 完整体验审计仍缺浏览器场景证据；现有 CDP 只验证并行边路线质量，不等于覆盖键盘、响应式、焦点恢复和全部错误恢复路径。


## 2026-09-12 Bundle P1 缓解：仓库 3D instancing 窄实现

### 行业对标结论

- 布局/连线能力已经接近 bundle 硬线时，继续堆路由算法会把交付风险推高；行业实践是先把非核心重依赖懒路径瘦身，给核心编辑能力留预算。
- 当前最大非核心懒块来自仓库 3D 视图的 Three / React Three / Drei 链路。它不是布局/连线核心路径，适合作为低风险体积治理目标。

### 已落地代码

- 新增 `src/components/warehouse-3d/WarehouseInstancedMesh.tsx`：用 Three 原生 `InstancedMesh` 支持静态 `position` / `scale` / `rotation` / per-instance `color`。
- 替换仓库 3D 中的 `@react-three/drei` `Instances` / `Instance`：
  - `src/components/warehouse-3d/AsrsSystem.tsx`
  - `src/components/warehouse-3d/Conveyors.tsx`
  - `src/components/warehouse-3d/Racks.tsx`
  - `src/components/warehouse-3d/StructuralElements.tsx`
  - `src/components/warehouse-3d/Workers.tsx`
- 将剩余 Drei 用法改为子路径导入，测试侧同步 mock 子路径：
  - `src/components/warehouse-3d/Scene.tsx`
  - `src/components/warehouse-3d/DigitalTwinUI.tsx`
  - `src/components/warehouse-3d/Zones.tsx`
  - `src/components/warehouse-3d/__tests__/Warehouse3DCommercialAudit.test.tsx`
  - `src/components/warehouse-3d/__tests__/Warehouse3DSceneAccessibility.test.tsx`

### 验证证据

- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/components/warehouse-3d/__tests__`：4 files / 17 tests passed。
- `npm run build`：passed；transformed modules 从上一轮约 `8870` 降到 `8625`。
- `npm run check:bundle`：passed；total JS 从上一轮 `9993.73 KB / 10000 KiB` 降到 `9991.09 KB / 10000 KiB`，硬余量从约 `6.27 KiB` 提升到约 `8.91 KiB`。
- 最大 3D lazy chunk 从约 `893.46 KB raw / 236.90 KB gzip` 降到约 `890.53 KB raw / 235.90 KB gzip`。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1194 test files covered。
- `npm run check:source-size`：passed，3182 source files。
- `npm run check:precompiled-routes`：passed，4 entries。
- `git diff --check`：passed；remaining CRLF messages are Git line-ending warnings only。

### 当前判断

- 这轮没有改变布局/连线算法，也没有移除 3D 视图功能；只是把通用 Drei instancing helper 换成项目内窄实现，属于低风险体积治理。
- Bundle 硬余量仍不足 10 KiB，仍是 P1 风险；后续继续优化应优先考虑剩余 3D Drei `Html` / `OrbitControls` / `Sky`、导出链路、display worker 内重复依赖，而不是提高预算。


## 2026-09-12 Bundle P1 继续缓解：Scene primitives 窄替换

### 行业对标结论

- 在布局/连线能力继续演进前，bundle 硬余量需要从“几 KiB 生死线”拉回到可继续迭代的安全区间。
- 仓库 3D 视图仍引用 Drei 的相机、接触阴影、天空和自适应 DPR helpers；其中相机、自适应 DPR 和静态地面深度 cue 可以用项目内窄实现替代，不必引入通用 shader/render-target helper。

### 已落地代码

- 新增 `src/components/warehouse-3d/WarehouseScenePrimitives.tsx`：
  - `WarehouseAdaptiveDpr`：保留 DPR 自适应与 pixelated image rendering 行为，避免引入 Drei helper。
  - `WarehouseGroundShadow`：用轻量静态半透明地面盘提供深度 cue；真实阴影仍由 directional light 提供。
- `src/components/warehouse-3d/Scene.tsx` 移除 `AdaptiveDpr` / `ContactShadows` / `PerspectiveCamera` / `Sky` 依赖；透视相机改由 `Canvas camera={{ position, fov }}` 配置，后续再将 `OrbitControls` 替换为项目内窄 wrapper。

### 验证证据

- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/components/warehouse-3d/__tests__`：4 files / 17 tests passed。
- `npm run build`：passed；transformed modules 从 `8625` 降到 `8621`。
- `npm run check:bundle`：passed；total JS 从上一轮 `9991.09 KB / 10000 KiB` 降到 `9978.89 KB / 10000 KiB`，硬余量提升到约 `21.11 KiB`。
- 最大 3D lazy chunk 从约 `890.53 KB raw / 235.90 KB gzip` 降到约 `877.75 KB raw / 231.83 KB gzip`。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1194 test files covered。
- `npm run check:source-size`：passed，3183 source files。
- `npm run check:precompiled-routes`：passed，4 entries。
- `git diff --check`：passed；remaining CRLF messages are Git line-ending warnings only。

### 当前判断

- Bundle P1 已从“硬线旁几 KiB”缓解到约 `21.11 KiB` 余量，但仍处于 warning 区间（`>= 9750 KiB`），不能视为完成。
- 为避免视觉回归风险，该轮未替换 `OrbitControls` 和 `Html`；随后已继续将 `OrbitControls` 收敛为项目内窄 wrapper，`Html` 仍是后续可评估的 3D 懒路径优化点。
- 布局/连线核心能力仍需继续补完整体验审计证据（键盘、响应式、焦点恢复、错误恢复），不能只用 bundle 和单一 CDP route case 宣称“全面完成”。


## 2026-09-12 Bundle P1 继续缓解：OrbitControls 窄 wrapper

### 行业对标结论

- 通用 3D helper 的行为很方便，但在一个已经接近 bundle 硬线的编辑器里，应把非核心 3D 懒路径缩到真实需要的 API 面。
- `OrbitControls` 的用户价值在于相机拖拽、键盘命令复用和手动操作停止自动旋转；这些能力可以通过 `three-stdlib` 的 `OrbitControls` 加项目内窄 wrapper 保留，而不再从 Drei 引入 wrapper 层。

### 已落地代码

- `src/components/warehouse-3d/WarehouseScenePrimitives.tsx` 新增 `WarehouseOrbitControls`：
  - 只暴露当前 Scene 需要的 `reset` / `update` / angle getter-setter / `dollyIn` / `dollyOut`。
  - 保留 `start` event，用于手动相机操作时停止 auto-rotate。
  - 保留 `change` invalidation、damping 与 auto-rotate frame update。
- `src/components/warehouse-3d/Scene.tsx`：移除 Drei `OrbitControls` import，改用 `WarehouseOrbitControls`；相机改为 `Canvas camera={{ position, fov }}`。
- `src/components/warehouse-3d/__tests__/Warehouse3DSceneAccessibility.test.tsx`：改为 mock 项目内 scene primitives，继续验证键盘相机控制和手动 orbit 停止自动旋转。

### 验证证据

- `npm run typecheck`：passed，app/node diagnostics 均为 0。
- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/components/warehouse-3d/__tests__`：4 files / 17 tests passed。
- `npm run build`：passed；transformed modules 从 `8621` 降到 `8620`。
- `npm run check:bundle`：passed；total JS 从上一轮 `9978.89 KB / 10000 KiB` 降到 `9978.86 KB / 10000 KiB`，收益很小但方向正确。
- 最大 3D lazy chunk 从约 `877.75 KB raw / 231.83 KB gzip` 降到约 `876.82 KB raw / 231.48 KB gzip`。
- `rg` 确认 `src/components/warehouse-3d` 不再有 `@react-three/drei/core` 或 Drei barrel import；剩余 Drei 依赖面集中在 `Html` 子路径。
- `npm run check:explicit-any`：passed，0 grandfathered occurrences。
- `npm run check:architecture`：passed，无新增边界债务/运行时循环依赖。
- `npm run check:test-ci-coverage`：passed，1194 test files covered。
- `npm run check:source-size`：passed，3183 source files。
- `npm run check:precompiled-routes`：passed，4 entries。
- `git diff --check`：passed；remaining CRLF messages are Git line-ending warnings only。

### 当前判断

- 本轮收益不大，不应作为主要 bundle 治理成果夸大；主要价值是减少 Drei wrapper 依赖面，并保留相机交互可访问性测试。
- Bundle 仍处于 warning 区间，后续优先级应转向更大收益点：导出链路 chunk、display worker 重复依赖、或完整体验审计自动化证据。

## 2026-09-12 12:35 continuation: Drei removal, gates, and visible CDP evidence

### What changed
- Replaced the last warehouse 3D runtime `@react-three/drei` Html usage with project-owned `WarehouseHtmlOverlay` in `src/components/warehouse-3d/WarehouseScenePrimitives.tsx`.
- Switched warehouse orbit controls away from Drei/three-stdlib to `three/examples/jsm/controls/OrbitControls.js`, with explicit local azimuth/polar camera setters.
- Removed `@react-three/drei` from direct dependencies using npm 12 normalization after an initial npm 10 uninstall warning.
- Added regression coverage for overlay projection style and updated stale Drei mocks.

### Verified gates
- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/components/warehouse-3d/__tests__` -> 5 files / 19 tests passed.
- Layout/connection focused regression set -> 8 files / 54 tests passed.
- `npm run typecheck` -> passed.
- `npm run typecheck:strict-core` -> passed.
- `npm run typecheck:ts6` -> passed.
- `npm run build` -> passed.
- `npm run check:bundle` -> passed with warning: total JS 9979.17 KB >= 9750 KiB, hard limit 10000 KiB.
- `npm run check:explicit-any` -> passed, 0 grandfathered occurrences.
- `npm run check:architecture` -> passed, no runtime cycles/new boundary debt.
- `npm run check:test-ci-coverage` -> passed, all 1195 test files covered.
- `npm run check:source-size` -> passed.
- `npm run check:precompiled-routes` -> passed.
- `git diff --check` -> passed; only CRLF normalization warnings.

### Visible CDP evidence
Preview server: `http://127.0.0.1:4174` via `npm run preview -- --host 127.0.0.1 --port 4174`.

- `.common-tools/reports/layout-routing-audit/debug-parallel-lane-browser.mjs` with `PRECOMPILED_ROUTE_VISIBLE=1`:
  - request `823739402:2`, operation `incremental-route`, nodeCount 2, edgeCount 4.
  - response `hardClean=true`, `routeResolution=full-route`, renderedEdgeCount 4.
  - lane offsets: 24, 48, 72, 96.
  - obstacleHits 0, minimumClearanceRisks 0, commercialClearanceRisks 0, labelNodeOverlapCount 0, labelLabelOverlapCount 0.
- `.common-tools/reports/layout-routing-audit/debug-layout-pin-ui.mjs` with `PRECOMPILED_ROUTE_VISIBLE=1`:
  - selected `start-calc`, buttonLabel `固定布局位置`, afterPin.fixed true.
- `.common-tools/reports/layout-routing-audit/debug-scoped-layout-ui.mjs` with `PRECOMPILED_ROUTE_VISIBLE=1`:
  - selected `start-calc`, menu text `只布局选区`, layoutTransactionStatus `committed`, hardClean true, nodeCount 30, edgeCount 26, selectedStillPresent true.

### Current residual gap
- Bundle is still within the hard gate but too close for comfort: 9979.17 KB total JS leaves only about 20.83 KiB before the 10000 KiB hard limit.
- Removing Drei cleaned dependency surface but did not materially reduce total JS because the warehouse route still necessarily carries Three/Fiber and the dominant total remains ELK worker, display-routing worker, and large export/runtime chunks.

## 2026-09-12 12:45 lint fix and post-fix verification

### Follow-up fixes
- Split overlay projection math into `src/components/warehouse-3d/WarehouseHtmlOverlayProjection.ts` to satisfy Fast Refresh component-only export policy.
- Wrapped warehouse canvas image-rendering and OrbitControls configuration in local helpers to avoid React hooks immutability warnings without disabling rules.
- Removed unused `GROUP_NODE_TYPES` from `src/core/utils/layout/geometryUtils.ts`.

### Post-fix gates
- Warehouse 3D focused tests: 5 files / 19 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 0 errors and 0 grandfathered warnings.
- `npm run build`: passed.
- `npm run check:bundle`: passed with warning; total JS 9979.38 KB, hard limit 10000 KiB.
- `npm run check:explicit-any`: passed.
- `npm run check:architecture`: passed.
- `npm run check:test-ci-coverage`: passed; 1195 test files covered.
- `npm run check:source-size`: passed; 3185 source files.
- `npm run check:precompiled-routes`: passed; 4 entries.
- `git diff --check`: passed; only CRLF normalization warnings.

### Post-fix visible CDP
- Parallel lane browser CDP rerun after rebuild still passed: lane offsets 24, 48, 72, 96; `hardClean=true`; obstacleHits 0; minimumClearanceRisks 0; commercialClearanceRisks 0; labelNodeOverlapCount 0; labelLabelOverlapCount 0.

### Residual risk carried forward
- Bundle warning remains the main engineering risk. Current hard-margin is roughly 20.62 KiB. Do not add dependencies or metadata until a larger chunk reduction lands.

## 2026-09-12 12:55 bundle hard-margin improvement

### What changed
- Removed `framer-motion` from production UI paths:
  - `DiagramSettingsPanel` now uses CSS keyframe entry animation instead of `motion.div`.
  - `GestureOverlay` now uses a lightweight CSS animation instead of `AnimatePresence`/`motion.div`.
- Removed the unused animation-runtime dependency path from `EnhancedAnimatedEdge` by replacing `@react-spring/web` with native SVG/CSS transitions.
- Removed direct dependencies `framer-motion` and `@react-spring/web` and deleted the stale `vendor-motion` chunk rule.

### Bundle evidence
- Before this cut: `npm run check:bundle` reported total JS 9979.38 KB, leaving roughly 20.62 KiB to the 10000 KiB hard limit.
- After this cut: `npm run check:bundle` reports total JS 9856.96 KB, leaving roughly 143.04 KiB to the 10000 KiB hard limit.
- Net reduction: about 122.42 KB total JS.
- Build transformed modules dropped from 8338 to 7936.
- Startup static JS remained stable: 523.31 KB raw / 167.44 KB gzip.

### Verification
- Focused tests: `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/components/ui/__tests__/DiagramSettingsPanel.accessibility.test.tsx src/components/warehouse-3d/__tests__ src/core/components/diagrams/__tests__/ConnectionValidationStatus.test.tsx src/core/components/diagrams/hooks/__tests__/useConnectionValidation.test.tsx src/core/components/diagrams/hooks/__tests__/useConnectionMicrointeractions.validation.test.tsx` -> 9 files / 44 tests passed.
- `npm run typecheck` -> passed.
- `npm run lint` -> passed with 0 errors and 0 grandfathered warnings.
- `npm run build` -> passed.
- `npm run check:bundle` -> passed with warning zone still active at 9856.96 KB.
- `npm run check:explicit-any`, `check:architecture`, `check:test-ci-coverage`, `check:source-size`, `check:secrets`, `check:dom-sinks`, `check:audit`, `check:precompiled-routes` -> passed.
- `git diff --check` -> passed; only CRLF normalization warnings.

### Visible CDP after bundle cut
Preview server: `http://127.0.0.1:4174`.
- Parallel lane audit with `PRECOMPILED_ROUTE_VISIBLE=1`: lane offsets 24, 48, 72, 96; `hardClean=true`; obstacleHits 0; minimumClearanceRisks 0; commercialClearanceRisks 0; labelNodeOverlapCount 0; labelLabelOverlapCount 0.
- Layout pin UI audit: selected `start-calc`; button label `固定布局位置`; afterPin.fixed true.
- Scoped layout UI audit: menu text `只布局选区`; layoutTransactionStatus `committed`; hardClean true; nodeCount 30; edgeCount 26; selectedStillPresent true.

### Remaining risk
- Bundle is now safer but still in the warning zone (`>= 9750 KiB`). The next major opportunities remain display worker duplication and export/PDF chunks; neither should be tackled by weakening route quality gates.

## 2026-09-12 13:05 S3 SDK removal and warning-free bundle

### What changed
- Replaced browser-side `@aws-sdk/client-s3` with a project-owned minimal SigV4 `fetch` client in `src/services/s3FetchClient.ts`.
- Kept S3-compatible behavior for list/get/put/delete/test connection through signed HTTP requests.
- Updated `S3StorageProvider` to use `S3FetchClient` while preserving persisted config and secret-handling behavior.
- Removed direct dependency `@aws-sdk/client-s3` and deleted the stale `vendor-aws-sdk` chunk rule.
- Added `src/services/__tests__/s3FetchClient.test.ts` for URL construction, SigV4 authorization header shape, XML parsing, and invalid XML handling.
- Updated `StorageService.test.ts` to mock `fetch`, preventing accidental real S3/AWS network calls in unit tests.

### Bundle evidence
- Previous post-motion cut: total JS 9856.96 KB, still in warning zone.
- After S3 SDK removal: `npm run check:bundle` reports total JS 9662.82 KB and no bundle warning.
- Net reduction from this cut: about 194.14 KB total JS.
- Net reduction from the earlier 9979.38 KB near-hard-limit state: about 316.56 KB total JS.
- Current hard-margin to 10000 KiB: about 337.18 KiB.
- Build transformed modules dropped from 7936 to 7360 after removing the SDK dependency tree.

### Verification
- S3 focused tests: `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/services/__tests__/StorageService.test.ts src/services/__tests__/s3FetchClient.test.ts` -> 2 files / 25 tests passed.
- `npm run typecheck` -> passed.
- `npm run lint` -> passed with 0 errors and 0 grandfathered warnings.
- `npm run build` -> passed.
- `npm run check:bundle` -> passed without warning; total JS 9662.82 KB.
- `npm run typecheck:strict-core`, `npm run typecheck:ts6`, `check:explicit-any`, `check:architecture`, `check:test-ci-coverage`, `check:source-size`, `check:secrets`, `check:dom-sinks`, `check:audit`, `check:precompiled-routes` -> passed.
- `check:test-ci-coverage` now covers 1196 test files.
- `git diff --check` -> passed; only CRLF normalization warnings.

### Visible CDP after S3 SDK removal
Preview server: `http://127.0.0.1:4174`.
- Parallel lane audit with `PRECOMPILED_ROUTE_VISIBLE=1`: lane offsets 24, 48, 72, 96; `hardClean=true`; obstacleHits 0; minimumClearanceRisks 0; commercialClearanceRisks 0; labelNodeOverlapCount 0; labelLabelOverlapCount 0.
- Layout pin UI audit: selected `start-calc`; button label `固定布局位置`; afterPin.fixed true.
- Scoped layout UI audit: menu text `只布局选区`; layoutTransactionStatus `committed`; hardClean true; nodeCount 30; edgeCount 26; selectedStillPresent true.

### Residual risk
- Bundle warning is cleared, but large chunks remain: ELK worker, display-routing worker, warehouse Three route, ReactFlow route, and PDF/export chunk. Further reductions should target duplication or feature-specific lazy loading, not quality-gate relaxation.
- The S3 client is intentionally minimal. It covers the existing S3-compatible operations but does not attempt to replicate the full AWS SDK surface.

## 2026-09-12 13:35 continuation: browser experience evidence and mobile viewport fix

### Why this continuation was needed

The previous layout/routing work had strong geometry and worker evidence, but the standard visual-interaction audit still had runtime experience gaps: `first-visit`, `core-flow`, `state-feedback`, `responsive`, and `keyboard` were not all backed by reviewed browser captures. I continued with visible CDP instead of treating the static audit inventory as completion.

### Browser evidence collected

- Added `.common-tools/reports/layout-routing-audit/debug-experience-browser.mjs`.
- The script starts Chrome/Edge through CDP with `PRECOMPILED_ROUTE_VISIBLE=1`, installs bounded console/error collectors, navigates the production preview, captures screenshots, and writes `.common-tools/reports/layout-routing-audit/experience-evidence/experience-browser-evidence.json`.
- Evidence screenshots:
  - `.common-tools/reports/layout-routing-audit/experience-evidence/screenshots/first-visit-desktop.png`
  - `.common-tools/reports/layout-routing-audit/experience-evidence/screenshots/core-flow-diagram.png`
  - `.common-tools/reports/layout-routing-audit/experience-evidence/screenshots/state-feedback-after-layout.png`
  - `.common-tools/reports/layout-routing-audit/experience-evidence/screenshots/responsive-mobile-first-visit.png`
  - `.common-tools/reports/layout-routing-audit/experience-evidence/screenshots/responsive-mobile-core-flow.png`
- Latest CDP summary after the fix:
  - first visit: 38 visible controls, no horizontal overflow, 0 collected console errors.
  - core flow: 30 React Flow nodes, 26 edges, `hardClean=true`, 0 collected console errors.
  - state feedback: dependency creation control exposes disabled guidance `请恰好选择两个组件以建立依赖关系`; layout transaction committed with `hardClean=true`.
  - responsive: mobile first visit and mobile core flow both report horizontal overflow 0; mobile core flow still has 30 nodes / 26 edges.
  - keyboard: 14-step Tab trace has visible focus for interactive controls; the body focus stop is still a minor audit watch item, but not blocking the required keyboard scenario because focus returns to visible actionable controls.

### Confirmed issue found and fixed

- Finding: when desktop and mobile views reused the same diagram/page viewport persistence key, a desktop viewport could be restored on mobile. In CDP this produced an initially bad mobile canvas state: either the diagram appeared mostly off-screen or was fit as an unreadable whole-graph overview.
- Fix:
  - `src/core/components/diagrams/flowchartResponsiveChrome.ts` now creates breakpoint-scoped viewport keys: `diagram:page:desktop` and `diagram:page:mobile`.
  - `src/core/components/diagrams/useFlowchartDesignerController.ts` uses that key, preventing desktop and mobile viewport state from contaminating each other.
  - `src/core/components/diagrams/AdvancedFlowchartCanvasShell.tsx` uses `fitWidthTop` on mobile and `restoreOrFitAll` on desktop, so initial mobile entry prioritizes a readable starting lane instead of a tiny whole-canvas overview.
  - `src/core/components/diagrams/FlowchartDesignerView.tsx` passes the responsive state into the canvas shell.
- Regression coverage:
  - `src/core/components/diagrams/hooks/__tests__/useMobileFlowchartViewportGuard.test.tsx` now covers desktop/mobile viewport key separation and source-level wiring for mobile `fitWidthTop`.

### Project audit experience pass

Created reviewed manifest:

- `.common-tools/reports/layout-routing-audit/experience-evidence/reviewed-experience-manifest.json`
- `.common-tools/reports/layout-routing-audit/experience-evidence/experience-console-summary.json`

Ran local Common Tools project audit in experience mode:

```powershell
C:\Users\juhon\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe \
  C:\Users\juhon\.codex\plugins\cache\common-tools\common-tools\0.1.23+codex.20260908015656\runtime\project-audit\packages\project-audit-runtime\bin\common-tools-audit.js \
  run --workspace E:\DEV\WorkSpace\Antigravity-WS\Vizly \
  --mode experience --level standard --scope visual-interaction \
  --experience-evidence .common-tools/reports/layout-routing-audit/experience-evidence/reviewed-experience-manifest.json \
  --out .common-tools/reports/project-audit-layout-routing-experience
```

Result: succeeded. Required scenarios verified: `first-visit`, `core-flow`, `state-feedback`, `responsive`, `keyboard` = 5/5. Artifacts:

- `.common-tools/reports/project-audit-layout-routing-experience/project-audit-report.json`
- `.common-tools/reports/project-audit-layout-routing-experience/project-audit-report.md`

### Verification gates run in this continuation

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/useMobileFlowchartViewportGuard.test.tsx src/core/components/diagrams/__tests__/flowchartInitialFit.test.ts` -> 2 files / 7 tests passed.
- `npm run typecheck` -> passed, app/node diagnostics 0.
- `npm run build` -> passed, 7360 modules transformed.
- `npm run lint` -> passed, 0 errors / 0 grandfathered warnings.
- `npm run check:explicit-any` -> passed, 0 grandfathered occurrences.
- `npm run check:architecture` -> passed, no new boundary debt or runtime cycles.
- `npm run check:bundle` -> passed, total JS 9662.96 KB, still no warning.
- `git diff --check` -> passed; only existing CRLF normalization warnings.

### Remaining evidence gaps

- `result-followup`, `recovery`, and full `console-network` degradation behavior remain outside this standard visual-interaction pass and are still not verified.
- Mobile now opens into a readable starting lane, but dense large-diagram mobile editing remains a product-design tradeoff; the next industry-level improvement would be a dedicated mobile overview/detail affordance rather than only viewport fitting.

## 2026-09-12 13:45 continuation: deep experience evidence closure

### What changed

- Extended `.common-tools/reports/layout-routing-audit/debug-experience-browser.mjs` with bounded browser-side console, fetch, XHR, and same-origin resource collection.
- Added `result-followup` evidence after the core diagram loads by verifying that the active diagram has usable next actions: fit view, export, share, add page, and property panel.
- Added a recovery scenario for the mobile viewport regression fixed in the previous step: the CDP script intentionally poisons the old unsuffixed viewport key and the desktop viewport key with `{ x: -100000, y: -100000, zoom: 0.02 }`, then verifies that mobile entry ignores those stale states and recovers to a readable `fitWidthTop` viewport.
- Updated reviewed experience evidence:
  - `.common-tools/reports/layout-routing-audit/experience-evidence/experience-browser-evidence.json`
  - `.common-tools/reports/layout-routing-audit/experience-evidence/experience-console-summary.json`
  - `.common-tools/reports/layout-routing-audit/experience-evidence/reviewed-experience-manifest.json`
  - `.common-tools/reports/layout-routing-audit/experience-evidence/screenshots/result-followup-core-actions.png`

### Latest CDP evidence

Command:

```powershell
$env:PRECOMPILED_ROUTE_VISIBLE='1'
$env:PRECOMPILED_ROUTE_BASE_URL='http://127.0.0.1:4174'
$env:PRECOMPILED_ROUTE_CDP_COMMAND_TIMEOUT_MS='60000'
node .common-tools/reports/layout-routing-audit/debug-experience-browser.mjs
```

Result highlights:

- `resultFollowup.activeDiagramTitle=true`.
- Follow-up actions available and enabled: fit view, export, share, add page, property panel.
- Network/console evidence: 0 collected console errors, 0 warnings, 0 failed fetch/XHR requests, 0 slow same-origin resources in the captured representative scenarios.
- Recovery evidence:
  - poisoned keys: `vizly:viewport:v1:wms-demand-allocation-strategy-v2%3Apage-1` and `vizly:viewport:v1:wms-demand-allocation-strategy-v2%3Apage-1%3Adesktop`.
  - poisoned viewport: `{ x: -100000, y: -100000, zoom: 0.02 }`.
  - recovered mobile viewport: `{ x: 57, y: -502, zoom: 0.45 }`.
  - `readableZoom=true`, `preservedDiagram=true`, 30 nodes and 26 edges still present.

### Deep visual-interaction audit

Ran local Common Tools experience audit with `--level deep --scope visual-interaction` against the reviewed manifest.

Result: succeeded and quality passed.

- Required deep scenarios: 8/8 verified.
- `level-required-experience`: passed.
- `experience-scenarios`: 8.
- `required-experience-scenarios`: 8.
- Artifacts:
  - `.common-tools/reports/project-audit-layout-routing-experience-deep/project-audit-report.json`
  - `.common-tools/reports/project-audit-layout-routing-experience-deep/project-audit-report.md`

### Verification in this continuation

- `node --check .common-tools/reports/layout-routing-audit/debug-experience-browser.mjs`: passed.
- `npm run check:secrets`: passed, no potential secrets in 3413 tracked/untracked text files.
- `git diff --check`: passed; only CRLF normalization warnings.

### Current remaining risk

- The deep visual-interaction scenario inventory is now closed for the bounded layout/routing journey, but this is not a claim of complete WCAG compliance or production deployment health. Separate assistive-technology/manual screen-reader testing and full engineering-delivery gates remain broader release criteria.

## 2026-09-12 13:55 continuation: static gate closure and source-size refactor

### Why this continuation was needed

After the deep CDP experience pass, I ran the full static verification path instead of relying on the narrower gates. This exposed a real engineering regression: the mobile viewport fix pushed two large modules over the repository source-size limit.

### Source-size issue found

Initial `npm run verify:static` failed at `check:source-size`:

- `src/core/components/diagrams/FlowchartDesignerView.tsx`: exceeded the 700-line React component limit.
- `src/core/components/diagrams/useFlowchartDesignerController.ts`: exceeded the 700-line module limit.

I did not raise the baseline and did not bypass the rule.

### Fixes applied

- Added `src/core/components/diagrams/hooks/useFlowchartViewportPersistenceKey.ts` to own breakpoint-scoped viewport persistence key creation for the active diagram page.
- Updated `src/core/components/diagrams/useFlowchartDesignerController.ts` to consume the hook, reducing the controller back under the source-size limit while keeping the desktop/mobile viewport separation.
- Added `src/core/components/diagrams/FlowchartCanvasTransientOverlays.tsx` to extract the canvas status overlay plus gesture overlay from `FlowchartDesignerView`.
- Updated `src/core/components/diagrams/FlowchartDesignerView.tsx` to render the extracted overlay component.
- Extended `src/core/components/diagrams/hooks/__tests__/useMobileFlowchartViewportGuard.test.tsx` to cover the responsive persistence key hook.

### Verification

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/useMobileFlowchartViewportGuard.test.tsx src/core/components/diagrams/__tests__/ConnectionValidationStatus.test.tsx` -> 2 files / 8 tests passed.
- `npm run check:source-size` -> passed for 3189 source files.
- `npm run typecheck` -> passed, app/node diagnostics 0.
- `npm run verify:static` -> passed end-to-end:
  - check:artifacts passed
  - check:precompiled-routes passed
  - check:secrets passed
  - check:dom-sinks passed
  - check:source-size passed
  - check:explicit-any passed
  - check:architecture passed
  - check:audit passed, 0 vulnerabilities
  - typecheck passed
  - typecheck:strict-core passed
  - typecheck:ts6 passed
  - lint passed, 0 errors / 0 grandfathered warnings
  - build passed, 7362 modules transformed
  - check:bundle passed, total JS 9663.27 KB
- `npm run check:test-ci-coverage` -> all 1196 test files are covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.

### Current state

The static engineering-delivery gate is now green after the viewport and overlay extraction. This closes the source-size debt introduced during the mobile runtime fix without weakening baselines or quality rules.

## 2026-09-12 14:10 continuation: scoped layout edge-preservation hardening

### Why this continuation was needed

A CDP replay of the scoped layout UI exposed an industry-critical invariant violation: the scoped layout command reported a committed transaction but React Flow's edge count dropped from 26 to 0. This would make the feature look successful while silently deleting all visible relationships, which is worse than a visible failure.

### Fixes applied

- Added a fail-closed source-edge preservation guard in `src/core/components/diagrams/hooks/useLayoutRoutingTransaction.ts`.
  - When a layout routing transaction starts with source edges, the staged routing receipt must preserve the same source edge ids before any state writer runs.
  - Missing ids, duplicate ids, or a count mismatch now reject with `layout-routing-hard-quality-rejected`.
  - Legitimate no-edge diagrams remain allowed because the guard is inactive when the source edge list is empty.
- Added a regression test in `src/core/components/diagrams/hooks/__tests__/useLayoutRoutingTransaction.test.tsx` that simulates a staged receipt returning `committedSourceEdges: []` and verifies no `setNodes`, `setEdges`, snapshot, or receipt commit happens.
- Tightened `.common-tools/reports/layout-routing-audit/debug-scoped-layout-ui.mjs` so CDP now fails if scoped layout changes the edge count. The old script only printed the bad `edgeCount: 0`; it now asserts preservation.

### CDP/runtime evidence

Commands:

```powershell
$env:PRECOMPILED_ROUTE_VISIBLE='1'
$env:PRECOMPILED_ROUTE_BASE_URL='http://127.0.0.1:4174'
$env:PRECOMPILED_ROUTE_CDP_COMMAND_TIMEOUT_MS='60000'
node .common-tools/reports/layout-routing-audit/debug-scoped-layout-ui.mjs
node .common-tools/reports/layout-routing-audit/debug-experience-browser.mjs
node .common-tools/reports/layout-routing-audit/debug-parallel-lane-browser.mjs
node .common-tools/reports/layout-routing-audit/debug-layout-pin-ui.mjs
```

Scoped layout result after the fix:

- before: 30 nodes / 26 edges.
- committed: 30 nodes / 26 edges.
- `preservedEdgeCount=true`.
- `hardClean=true`.
- selected node still present.

Additional representative runtime checks stayed green:

- Core experience: 30 nodes / 26 edges, `hardClean=true`, 0 collected console errors.
- Mobile recovery: `readableZoom=true`, `preservedDiagram=true`, recovered viewport zoom `0.45`.
- Parallel lane routing: 4/4 lanes separated with offsets `24`, `48`, `72`, `96`, `hardClean=true`.
- Layout pin UI: selected node `start-calc` changed to `fixed=true`.

### Verification

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/useLayoutRoutingTransaction.test.tsx` -> 1 file / 43 tests passed.
- `npm run typecheck` -> passed, app/node diagnostics 0.
- `npm run check:source-size` -> passed for 3189 source files.
- `npm run build` -> passed, 7362 modules transformed.
- `npm run verify:static` -> passed end-to-end:
  - check:artifacts passed
  - check:precompiled-routes passed
  - check:secrets passed
  - check:dom-sinks passed
  - check:source-size passed
  - check:explicit-any passed
  - check:architecture passed
  - check:audit passed, 0 vulnerabilities
  - typecheck passed
  - typecheck:strict-core passed
  - typecheck:ts6 passed
  - lint passed, 0 errors / 0 grandfathered warnings
  - build passed, 7362 modules transformed
  - check:bundle passed, total JS 9663.64 KB
- `npm run check:test-ci-coverage` -> all 1196 test files are covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.

### Current state

The scoped layout issue is now converted from a silent data-loss class bug into a fail-closed transaction invariant with a regression test and CDP assertion. The latest browser replay confirms scoped layout preserves edges after commit.

## 2026-09-12 14:18 continuation: AI/programmatic connection boundary hardening

### Why this continuation was needed

Manual React Flow drag-connect now goes through semantic validation, but the AI canvas bridge and import-style programmatic operations still had a privileged `connectNodes` path. That meant an AI command or Mermaid/import bridge could add duplicate, self-loop, or unknown-node edges without using the same connection contract. Mature diagram editors need the write boundary to be consistent regardless of whether a connection comes from mouse input, AI, import, or automation.

### Fixes applied

- Hardened `src/core/components/diagrams/hooks/useDesignerSystemSync.ts` bridge `connectNodes`:
  - Parses unknown bridge payloads at runtime instead of trusting typed call sites.
  - Coerces source, target, type, and bounded labels with the existing connection token boundary.
  - Validates source/target existence, duplicates, self-loops, terminal-source rules, and other baseline connection constraints via `validateConnectionDetailed` before writing.
  - Revalidates against the latest edge array inside the `setEdges` updater so stale bridge calls cannot race in a duplicate connection.
  - Applies `applyParallelEdgePresentation` to programmatic bridge-created edges so AI/import-created parallel edges use the same visual lane presentation as interactive edges.
- Extended `src/core/components/diagrams/hooks/__tests__/useDesignerSystemSync.initializationRace.test.tsx`:
  - Programmatic duplicate, missing-source, and self-loop bridge connections are rejected without calling `setEdges`.
  - A valid reverse connection is accepted and receives an arrow marker.
  - The test mocks `LayoutOptimizer` to keep the jsdom hook test independent of a real Canvas 2D context.

### Verification

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/useDesignerSystemSync.initializationRace.test.tsx` -> 1 file / 15 tests passed.
- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/useDesignerSystemSync.initializationRace.test.tsx src/core/components/diagrams/hooks/__tests__/useConnectionValidation.test.tsx src/core/components/diagrams/hooks/__tests__/useFlowchartConnectionHandler.test.tsx src/components/ai/__tests__/aiCommandExecution.test.ts src/components/__tests__/diagramViewerAiBridge.test.ts` -> 5 files / 36 tests passed.
- `npm run typecheck` -> passed, app/node diagnostics 0.
- `npm run check:source-size` -> passed for 3189 source files.
- `npm run verify:static` -> passed end-to-end:
  - check:artifacts passed
  - check:precompiled-routes passed
  - check:secrets passed
  - check:dom-sinks passed
  - check:source-size passed
  - check:explicit-any passed
  - check:architecture passed
  - check:audit passed, 0 vulnerabilities
  - typecheck passed
  - typecheck:strict-core passed
  - typecheck:ts6 passed
  - lint passed, 0 errors / 0 grandfathered warnings
  - build passed, 7362 modules transformed
  - check:bundle passed, total JS 9664.16 KB
- `npm run check:test-ci-coverage` -> all 1196 test files are covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.

### Current state

The connection contract is no longer limited to mouse-driven edge creation. AI/import/programmatic bridge connections now share the same baseline invariant gate and visual parallel-edge presentation path, reducing the gap between interactive UX correctness and automation/import correctness.

## 2026-09-12 14:28 continuation: imported edge sanitization boundary

### Why this continuation was needed

After hardening manual and AI bridge connection creation, the next remaining gap was the standard-data import path. `standardDataToCanvas` is shared by JSON editor imports, AI JSON import, template/preset loading, cloud open, and other restored diagrams. Before this pass it restored every incoming edge into Canvas state, so malformed imported data could still carry unknown endpoints, self-loops, or exact duplicate edges into the graph even if interactive connection creation would reject them.

### Fixes applied

- Added `src/core/components/diagrams/canvasEdgeImportSanitizer.ts` as a focused import-boundary helper.
- Updated `src/core/components/diagrams/designerUtils.ts` so standard-data conversion:
  - removes edges whose source or target is not present in the restored node set,
  - removes self-loop edges by default at the import boundary,
  - removes duplicate edge ids,
  - removes exact duplicate connection identities,
  - preserves legitimate semantic parallel edges when their type/label/relation identity differs,
  - sanitizes before layout so bad edges do not influence generated geometry,
  - sanitizes again after hidden-node stripping so edges to hidden imported nodes cannot remain in final Canvas state.
- Extended `src/core/components/diagrams/__tests__/designerUtils.test.ts` with regression coverage for:
  - unknown endpoint removal,
  - self-loop removal,
  - exact duplicate removal,
  - semantic parallel edge preservation,
  - hidden-node edge removal.

### Generated route artifacts

Because `standardDataToCanvas` participates in the precompiled display-route source hash, `npm run verify:static` correctly failed at `check:precompiled-routes` until artifacts were regenerated. I used the project generator against the already running production preview:

```powershell
$env:PRECOMPILED_ROUTE_BASE_URL='http://127.0.0.1:4174'
$env:PRECOMPILED_ROUTE_CDP_COMMAND_TIMEOUT_MS='60000'
npm run generate:precompiled-routes
```

Result: 4 production precompiled route artifacts captured successfully, and the manifest hash was updated.

### Verification

- `npx vitest run --pool=threads --maxWorkers=2 src/core/components/diagrams/__tests__/designerUtils.test.ts` -> 1 file / 11 tests passed.
- `npx vitest run --pool=threads --maxWorkers=2 src/core/utils/__tests__/diagramJsonImport.test.ts src/core/components/diagrams/__tests__/JsonEditorModal.validation.test.tsx src/components/__tests__/diagramViewerMermaidImport.test.ts src/components/ai/__tests__/aiDiagramImport.test.ts src/components/__tests__/diagramViewerAiBridge.test.ts` -> 5 files / 26 tests passed.
- `npm run typecheck` -> passed, app/node diagnostics 0.
- `npm run check:source-size` -> initially caught `designerUtils.ts` over 700 lines; I split the sanitizer helper instead of raising a baseline. Re-run passed for 3190 source files.
- `npm run verify:static` -> passed end-to-end:
  - check:artifacts passed
  - check:precompiled-routes passed, 4 entries
  - check:secrets passed
  - check:dom-sinks passed
  - check:source-size passed
  - check:explicit-any passed
  - check:architecture passed
  - check:audit passed, 0 vulnerabilities
  - typecheck passed
  - typecheck:strict-core passed
  - typecheck:ts6 passed
  - lint passed, 0 errors / 0 grandfathered warnings
  - build passed, 7363 modules transformed
  - check:bundle passed, total JS 9664.71 KB
- `npm run check:test-ci-coverage` -> all 1196 test files are covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.

### Current state

The graph now has a stronger common import boundary: bad imported edges are removed before layout/state commit, while valid semantic parallel edges remain. This closes another route by which external AI/JSON/cloud/template data could bypass the interactive connection contract.

## 2026-09-12 14:40 continuation: version-history and snapshot-restore edge sanitization

### Why this continuation was needed

After standard JSON import was hardened, version history and `replaceCanvasSnapshot` still represented a restore path that could bypass the import sanitizer. `coerceClipboardData` already rejects edges with missing endpoints, but it does not remove self-loops or exact duplicate connection identities. A stored version or preview snapshot could therefore reintroduce edge states that interactive and AI bridge creation now reject.

### Fixes applied

- Updated `src/components/diagrams/hooks/useVersionHistory.ts` so every version-history snapshot path is sanitized before use:
  - bridge/current snapshots before save,
  - version preview snapshots before preview state is applied,
  - restore snapshots before `replaceCanvasSnapshot` or fallback state writes,
  - preview-base backup snapshots before backup persistence.
- Updated `src/core/components/diagrams/hooks/useDesignerSystemSync.ts` so bridge `replaceCanvasSnapshot` sanitizes edges before mutating `nodesRef`, `edgesRef`, React nodes, or React edges.
- Reused `src/core/components/diagrams/canvasEdgeImportSanitizer.ts` rather than adding a second copy of restore rules.
- Adjusted version-history test fixtures away from self-loop-as-normal-edge, then added regression coverage for the actual bad snapshot cases.

### Regression coverage

- `src/components/diagrams/hooks/__tests__/useVersionHistory.test.tsx`
  - Preview snapshots drop duplicate, self-loop, and missing-target edges before calling `setEdges`.
  - Saved bridge snapshots are sanitized before `saveVersion` persists them.
- `src/core/components/diagrams/hooks/__tests__/useDesignerSystemSync.initializationRace.test.tsx`
  - `replaceCanvasSnapshot` drops duplicate, self-loop, and missing-target edges before restoring canvas state.

### Verification

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/components/diagrams/hooks/__tests__/useVersionHistory.test.tsx src/core/components/diagrams/hooks/__tests__/useDesignerSystemSync.initializationRace.test.tsx` -> 2 files / 37 tests passed.
- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/components/diagrams/hooks/__tests__/useVersionHistory.test.tsx src/components/diagrams/ui/__tests__/VersionHistoryPanel*.test.tsx src/components/__tests__/diagramViewerAiBridge.test.ts src/core/components/diagrams/hooks/__tests__/useDesignerSystemSync.initializationRace.test.tsx` -> 3 files / 41 tests passed.
- `npm run typecheck` -> passed, app/node diagnostics 0.
- `npm run check:source-size` -> passed for 3190 source files.
- `npm run verify:static` -> passed end-to-end:
  - check:artifacts passed
  - check:precompiled-routes passed, 4 entries
  - check:secrets passed
  - check:dom-sinks passed
  - check:source-size passed
  - check:explicit-any passed
  - check:architecture passed
  - check:audit passed, 0 vulnerabilities
  - typecheck passed
  - typecheck:strict-core passed
  - typecheck:ts6 passed
  - lint passed, 0 errors / 0 grandfathered warnings
  - build passed, 7363 modules transformed
  - check:bundle passed, total JS 9664.89 KB
- `npm run check:test-ci-coverage` -> all 1196 test files are covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.

### Current state

The external/restore edge boundary is now consistently applied across standard import, AI bridge creation, bridge snapshot replacement, version preview, version restore, and version save backup paths. This materially reduces the chance that invalid edge topology can re-enter the canvas through historical or programmatic restore flows.

## 2026-09-12 15:05 continuation: clipboard / drag-drop / autosave edge boundary

### Why this continuation was needed

The industry-level expectation for diagram editors is that every external graph ingress path shares one topology contract. After import, AI bridge, version preview, and restore paths were hardened, clipboard-like paths remained an important gap: copied/pasted canvas fragments, drag-drop payloads, and autosave-style clipboard coercion all pass through `coerceClipboardData`. Before this continuation, that path could still preserve self-loops or duplicate connection identities that the interactive connection contract rejects.

### Fixes applied

- Moved the reusable edge topology sanitizer to `src/core/utils/canvasEdgeSanitizer.ts` so low-level utilities can reuse it without creating a `utils -> components` reverse dependency.
- Updated `src/core/utils/flowchartClipboard.ts` so `coerceClipboardData` sanitizes edges against the coerced node set before returning a clipboard payload.
- Kept the same sanitizer in the standard-data import, version-history, and bridge snapshot paths so the project now has a shared edge-topology rule instead of parallel ad hoc filters.
- Updated clipboard tests away from self-loop-as-normal-edge fixtures and added regression coverage for duplicate/self-loop sanitization.

### Regression coverage

- `src/core/utils/__tests__/flowchartClipboard.test.ts`
  - Clipboard coercion removes duplicate and self-loop edges while preserving valid graph edges.
- Existing clipboard paste and hook tests were run together with the updated coercion tests to verify callers still work with sanitized edges.

### Verification

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/utils/__tests__/flowchartClipboard.test.ts src/core/utils/__tests__/flowchartClipboardPaste.test.ts src/core/components/diagrams/hooks/__tests__/useClipboard.test.tsx` -> 3 files / 43 tests passed.
- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/__tests__/designerUtils.test.ts src/components/diagrams/hooks/__tests__/useVersionHistory.test.tsx src/core/components/diagrams/hooks/__tests__/useDesignerSystemSync.initializationRace.test.tsx src/components/__tests__/diagramViewerAiBridge.test.ts` -> 4 files / 52 tests passed.
- `npm run typecheck` -> passed, app/node diagnostics 0.
- `npm run check:source-size` -> passed for 3190 source files.
- `npm run check:architecture` -> passed with 0 grandfathered edges, no new runtime cycles, and lightweight core public API.
- `npm run verify:static` -> passed end-to-end:
  - check:artifacts passed
  - check:precompiled-routes passed, 4 entries
  - check:secrets passed
  - check:dom-sinks passed
  - check:source-size passed
  - check:explicit-any passed
  - check:architecture passed
  - check:audit passed, 0 vulnerabilities
  - typecheck passed
  - typecheck:strict-core passed
  - typecheck:ts6 passed
  - lint passed, 0 errors / 0 grandfathered warnings
  - build passed, 7363 modules transformed
  - check:bundle passed, total JS 9664.82 KB; startup static JS raw 523.31 KB / gzip 167.44 KB
- `npm run check:test-ci-coverage` -> all 1196 test files are covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.

### Current state

The graph topology contract now covers manual connections, AI/programmatic bridge connection creation, standard-data imports, cloud/template-style imports, version save/preview/restore, bridge snapshot replacement, and clipboard coercion. This moves Vizly closer to the behavior of mature diagramming tools: invalid topology is rejected at ingress, while legitimate semantic parallel edges are preserved and displayed with lane separation.

## 2026-09-12 15:48 continuation: localized layout failure recovery feedback

### Why this continuation was needed

A mature diagramming editor should not only fail closed; it should explain recoverable layout failures in the user's current language without leaking internal exception text. The layout transaction already protected the canvas and classified failures, but the presentation helper still used hard-coded Chinese strings. That meant an English UI could show Chinese layout failure messages, which is a product-quality gap versus industry expectations for globalized design tools.

### Fixes applied

- Updated `src/core/components/diagrams/hooks/layoutFailureFeedback.ts` so presentation uses bounded failure-code translation keys:
  - `designer.flowchart.layout.failure.noLayoutableNodes`
  - `designer.flowchart.layout.failure.hardQualityRejected`
  - `designer.flowchart.layout.failure.workerTimeout`
  - `designer.flowchart.layout.failure.strategyFailed`
- Kept a safe Chinese fallback for non-hook callers while ensuring arbitrary exception payloads still never cross into UI content.
- Updated `src/core/components/diagrams/hooks/useAutoRouting.ts` to pass the current `react-i18next` translator into layout-failure presentation.
- Added zh/en locale strings under `designer.flowchart.layout.failure`.
- Added `src/core/components/diagrams/hooks/__tests__/layoutFailureFeedback.test.ts` to lock translation-key mapping, cancelled-job silence, and payload-safe presentation.

### Runtime / CDP evidence refreshed before this continuation

- `node .common-tools/reports/layout-routing-audit/debug-experience-browser.mjs` against `http://127.0.0.1:4174`:
  - first visit controls: 38
  - first visit console errors: 0
  - core diagram: 30 nodes / 26 edges
  - `hardClean=true`
  - responsive overflow: 0
  - mobile recovery preserved the diagram with readable zoom `0.45`
- `node .common-tools/reports/layout-routing-audit/debug-scoped-layout-ui.mjs`:
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - `preservedEdgeCount=true`
  - `hardClean=true`

### Generated route artifacts

Changing the layout hook import graph correctly made `check:precompiled-routes` fail as stale. I regenerated the production precompiled route artifacts:

```powershell
$env:PRECOMPILED_ROUTE_BASE_URL='http://127.0.0.1:4174'
$env:PRECOMPILED_ROUTE_CDP_COMMAND_TIMEOUT_MS='60000'
npm run generate:precompiled-routes
```

Result: 4 production precompiled route artifacts generated. The generator also exposed a next optimization target: `wms-process-flow-v1:initial` routed in about 5424 ms, with the slowest phases concentrated in seed/quality/finalizer work.

### Verification

- `npx vitest run --environment=jsdom --pool=threads --maxWorkers=2 src/core/components/diagrams/hooks/__tests__/layoutFailureFeedback.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayFallbackLifecycle.test.ts src/core/components/diagrams/__tests__/flowchartI18n.test.ts` -> 3 files / 23 tests passed.
- `npm run typecheck` -> passed, app/node diagnostics 0.
- `npm run check:source-size` -> passed for 3191 source files.
- `npm run check:explicit-any` -> passed with 0 grandfathered occurrences.
- `npm run check:test-ci-coverage` -> all 1197 test files are covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.
- `npm run verify:static` -> passed end-to-end after regenerating precompiled routes:
  - check:artifacts passed
  - check:precompiled-routes passed, 4 entries
  - check:secrets passed
  - check:dom-sinks passed
  - check:source-size passed
  - check:explicit-any passed
  - check:architecture passed
  - check:audit passed, 0 vulnerabilities
  - typecheck passed
  - typecheck:strict-core passed
  - typecheck:ts6 passed
  - lint passed, 0 errors / 0 grandfathered warnings
  - build passed, 7363 modules transformed
  - check:bundle passed, total JS 9665.18 KB; startup static JS raw 523.31 KB / gzip 167.44 KB

### Current state

Layout failures now satisfy the stronger industry bar: bounded reason codes, fail-closed canvas preservation, user-visible recovery feedback, locale-correct copy, and no arbitrary exception leakage. The next evidence-backed optimization area is large-graph routing latency, especially the `wms-process-flow-v1` precompiled capture where seed/quality/finalizer phases dominate.

## 2026-09-12 15:12 continuation: terminal-axis cold-routing hot-path reduction

### Why this continuation was needed

The previous review had already closed several industry gaps around topology safety, scoped layout, parallel lane presentation, localized failure feedback, and fail-closed routing transactions. The remaining gap is large-diagram latency: mature diagramming tools keep routing work bounded and avoid repeating graph-wide scans on the cold path. The `wms-process-flow-v1:initial` precompiled measurement still showed `seed-terminal-axis` and `seed-interactive-finish-obstacle` as recurring hotspots.

### Fixes applied

- Updated `src/core/components/shared/baseReactFlowTerminalAxisRepair.ts` so terminal-axis repair reuses strict-crossing repair opportunity indexes already derived by `createEdgePathQualityEvaluationContext` instead of always performing a second pairwise strict-crossing scan.
- Updated `src/core/components/shared/baseReactFlowDisplayTerminalAxisSeed.ts` so the seed terminal-axis phase enters the terminal repair kernel directly instead of doing an extra full `calculateEdgePathQualityScore` precheck before the repair kernel repeats the relevant baseline evaluation.
- Kept the routing-quality acceptance policy unchanged: candidates still pass obstacle checks, terminal-direction validation, hairpin/tiny-dogleg rejection, strict-crossing non-regression, overlap non-regression, and terminal validation.

### Measurement

Before this continuation, the latest captured hotspot profile for `wms-process-flow-v1:initial` was roughly:

- route total: about 6007 ms in the immediate pre-change measure run
- seed: about 2569.7 ms
- seed-interactive-route: about 1861.2 ms
- seed-interactive-finish-obstacle: about 748.8 ms
- seed-terminal-axis: about 607.2 ms
- quality: about 1517.2 ms
- finalizer: about 1067.2 ms

After the terminal-axis hot-path change, `npm run measure:precompiled-route` against `http://127.0.0.1:4174` measured:

- `wms-process-flow-v1:initial`: route total about 5566 ms
- seed: about 2380.1 ms
- seed-interactive-route: about 1595.9 ms
- seed-interactive-finish-obstacle: about 686.2 ms
- seed-terminal-axis: about 653.9 ms
- quality: about 1860.6 ms
- finalizer: about 1087.1 ms

This is noisy browser/CDP timing, but the total route went down by about 441 ms in the same measurement mode while quality gates stayed green. The remaining confirmed optimization targets are still candidate-heavy phases rather than UI rendering:

1. `seed-interactive-finish-obstacle` around 686 ms.
2. `seed-terminal-axis` still around 654 ms, now dominated by candidate evaluation rather than the removed duplicate pair scan.
3. `quality-crossing-sweeps` around 960 ms in the noisy run.
4. `finalizer` around 1087 ms.

### Verification

- `npx vitest run --pool=threads --maxWorkers=1 src/core/components/shared/__tests__/baseReactFlowDisplayEdges.wmsColdPerformance.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayFullRouteQualityPhase.test.ts src/core/components/shared/__tests__/baseReactFlowTerminalAxisRepair.test.ts --reporter=verbose` -> 3 files / 40 tests passed.
- `npm run test:ci:core-components-shared-cold-performance` -> 4 files / 32 tests passed.

### Current state

The review is continuing beyond static recommendations: the layout/connection stack now has another concrete cold-routing hot-path reduction with regression coverage. The next safe area to inspect is obstacle candidate generation in `repairDisplayObstacleHits`; it should be optimized only with strict evidence because that stage protects the industry-critical guarantee that display routes do not cross nodes.

### Final validation after regenerated production route artifacts

After rebuilding production assets and regenerating precompiled routes, the final CDP capture produced stronger evidence than the intermediate measure-only run:

- `npm run generate:precompiled-routes` against `http://127.0.0.1:4174` generated 4 production route artifacts.
- `wms-process-flow-v1:initial` captured `routeMs=5353`.
- Slowest final capture phases:
  - seed: about 2619.6 ms
  - seed-interactive-route: about 1740.7 ms
  - seed-terminal-axis: about 781.5 ms
  - seed-interactive-finish-obstacle: about 681.8 ms
  - quality: about 1602.3 ms
  - quality-crossing-sweeps: about 808.5 ms
  - finalizer: about 928 ms
- `wms-demand-allocation-strategy-v2:initial` captured `routeMs=622`.
- `logistics-architecture-v1:initial` captured `routeMs=808`.

Final gates and runtime smoke:

- `npm run verify:static` -> passed end-to-end:
  - check:artifacts passed
  - check:precompiled-routes passed, 4 entries
  - check:secrets passed
  - check:dom-sinks passed
  - check:source-size passed for 3191 source files
  - check:explicit-any passed with 0 grandfathered occurrences
  - check:architecture passed with 0 grandfathered edges and no runtime cycles
  - check:audit found 0 vulnerabilities
  - typecheck passed
  - typecheck:strict-core passed
  - typecheck:ts6 passed
  - lint passed with 0 errors / 0 grandfathered warnings
  - build passed, 7363 modules transformed
  - check:bundle passed, total JS 9665.46 KB; startup static JS raw 523.31 KB / gzip 167.45 KB
- `npm run check:test-ci-coverage` -> all 1197 test files covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.
- `node .common-tools/reports/layout-routing-audit/debug-experience-browser.mjs` with CDP evidence:
  - first visit controls: 38
  - first visit console errors: 0
  - core diagram: 30 nodes / 26 edges
  - hardClean=true
  - responsive overflow: 0
  - mobile recovery preserved the diagram at zoom 0.45
  - evidence JSON: `.common-tools/reports/layout-routing-audit/experience-evidence/experience-browser-evidence.json`
- `node .common-tools/reports/layout-routing-audit/debug-scoped-layout-ui.mjs` with CDP evidence:
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - preservedEdgeCount=true
  - selectedStillPresent=true
  - hardClean=true

## 2026-09-12 15:38 continuation: obstacle-repair candidate budget and trace diagnostics

### Why this continuation was needed

The previous terminal-axis optimization reduced duplicate scanning, but the final production capture still showed `seed-interactive-finish-obstacle` as a recurring large-graph hotspot. Before this continuation the obstacle phase only reported edge count and duration, so it was hard to distinguish node-hit evaluation, candidate generation, and quality scoring. Mature diagramming tools need bounded candidate search plus actionable phase diagnostics for large diagrams.

### Fixes applied

- Added `DisplayObstacleRepairDiagnostics` to `src/core/components/shared/baseReactFlowDisplayEvaluation.ts`.
- Added `createDisplayObstacleRepairDiagnostics` and diagnostics population in `src/core/components/shared/baseReactFlowDisplayObstacleRepair.ts`.
- Added `src/core/components/shared/baseReactFlowDisplayRenderObstacleRepair.ts` as a cohesive helper so render-pipeline obstacle tracing stays outside the already-large composition path.
- Updated `src/core/components/shared/baseReactFlowDisplayRenderPipeline.ts` to report obstacle-repair candidate generation, scored candidate count, evaluation count, processed work, and initial/final obstacle hits through the existing `seed-interactive-finish-obstacle` trace.
- Bounded expensive skirt/waypoint candidate pre-generation at the first verified safe budget: `max(192, maxCandidatesPerEdge * 6)`. Evidence from WMS probing:
  - `max(128, maxCandidatesPerEdge * 4)` changed the deterministic WMS route fingerprint (`e-op-heat`) and was rejected.
  - `max(192, maxCandidatesPerEdge * 6)` preserved the WMS cold-performance route fingerprint and quality contract.
- Added a diagnostics regression in `src/core/components/shared/__tests__/baseReactFlowDisplayObstacleCandidates.test.ts` proving obstacle repair records initial/final hits and candidate activity without changing the accepted clean route.

### Measurement and evidence

Final `npm run generate:precompiled-routes` against `http://127.0.0.1:4174` generated 4 production route artifacts. For `wms-process-flow-v1:initial`:

- route total: about 5768 ms in this noisy CDP run
- `seed-interactive-finish-obstacle`: about 750.3 ms
- obstacle diagnostics for that phase:
  - generated candidates: 3564
  - scored candidates: 1846
  - quality evaluations: 40
  - work items accepted/processed: 4
  - obstacle hits: 4 -> 0
- The trace now proves the hotspot is dominated by candidate generation/scoring breadth, not by quality-evaluation count alone.

The timing varied run-to-run, but the new bounded diagnostics are stable and explain the next optimization target: rank/filter obstacle candidate families earlier instead of merely increasing quality-evaluation speed.

### Verification

- `npx vitest run --pool=threads --maxWorkers=1 src/core/components/shared/__tests__/baseReactFlowDisplayObstacleCandidates.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayObstacleHitCache.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayEdges.wmsColdPerformance.test.ts --reporter=verbose` -> 3 files / 11 tests passed.
- `npm run test:ci:core-components-shared-cold-performance` -> 4 files / 32 tests passed.
- `npm run check:source-size` -> passed for 3192 source files.
- `npm run typecheck` -> passed.
- `npm run check:architecture` -> passed with 0 grandfathered edges and no runtime cycles.
- `npm run check:explicit-any` -> passed with 0 grandfathered occurrences.
- `npm run check:precompiled-routes` -> passed, 4 entries.
- `npm run check:bundle` -> passed, total JS 9666.62 KB; startup static JS raw 523.31 KB / gzip 167.44 KB.
- `npm run check:test-ci-coverage` -> all 1197 test files covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.
- `npm run verify:static` -> passed end-to-end, including artifacts, precompiled routes, secrets, DOM sinks, source-size, explicit-any, architecture, audit, typecheck, strict-core, ts6, lint, build, and bundle.

### Current state

The obstacle-repair phase now has an evidence-backed bounded generation policy and production trace counters. The next safe optimization is not to lower the global cap further; the 160-ish candidate tier already changed WMS geometry. The next step should be family-aware ranking inside `buildObstacleSkirtCandidates` or earlier terminal-validation-aware generation so the accepted commercial route appears earlier without dropping required fallback candidates.

Additional CDP smoke after obstacle-repair changes:

- `node .common-tools/reports/layout-routing-audit/debug-scoped-layout-ui.mjs`:
  - selected node: `start-calc`
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - `layoutTransactionStatus=committed`
  - `hardClean=true`
  - `preservedEdgeCount=true`
  - `selectedStillPresent=true`

## 2026-09-12 continuation: full-span obstacle-lane prioritization at the lower safe budget

### Why this continuation was needed

The first bounded obstacle-repair pass proved that a lower raw generation cap (`max(128, maxCandidatesPerEdge * 4)`) could change the WMS deterministic route fingerprint when commercial full-span clearance lanes were generated too late. Raising the cap to `max(192, maxCandidatesPerEdge * 6)` preserved geometry, but that was a budget workaround rather than the industry-grade fix. The better target was candidate ordering: keep fallback breadth available, but surface the commercially acceptable full-span detours before the bounded window closes.

### Fixes applied

- Updated `src/core/components/shared/baseReactFlowDisplayObstacleCandidates.ts` so full-span commercial-clearance skirt lanes are generated earlier for both horizontal and vertical obstacle segments.
- Added immediate candidate de-duplication in the append path, reducing wasted candidate slots inside the bounded window.
- Lowered the expensive skirt/waypoint generation window back to `max(128, maxCandidatesPerEdge * 4)` in `src/core/components/shared/baseReactFlowDisplayObstacleRepair.ts` after the ordering fix preserved the WMS route fingerprint.
- Added a regression proving commercial full-span lanes remain inside a bounded candidate window in `src/core/components/shared/__tests__/baseReactFlowDisplayObstacleCandidates.test.ts`.

### Measurement and evidence

Latest `npm run generate:precompiled-routes` against `http://127.0.0.1:4174` generated 4 production route artifacts. For `wms-process-flow-v1:initial`:

- route total: about 5282 ms in the latest CDP capture
- top phases:
  - quality: about 1865.2 ms
  - seed: about 1847.6 ms
  - finalizer: about 1239.7 ms
  - seed-interactive-route: about 979.2 ms
  - seed-terminal-axis: about 755.9 ms
  - quality-crossing-sweeps: about 744.5 ms
  - quality-strict-closure: about 612.5 ms
- `seed-interactive-finish-obstacle` no longer appeared in the WMS top-10 slow phases in this capture.
- The earlier rejected `max(128, maxCandidatesPerEdge * 4)` budget is now safe after full-span prioritization and immediate de-duplication; the WMS cold-performance fingerprint remained accepted.

Additional latest captures:

- `logistics-architecture-v1:initial`: about 836 ms.
- `wms-demand-allocation-strategy-v2:initial`: about 639 ms.
- `wms-process-flow-v1:domain-lanes-lr`: generated as the fourth production route artifact.

### Verification

- `npx vitest run --pool=threads --maxWorkers=1 src/core/components/shared/__tests__/baseReactFlowDisplayObstacleCandidates.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayObstacleHitCache.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayEdges.wmsColdPerformance.test.ts --reporter=verbose` -> 3 files / 12 tests passed.
- `npm run test:ci:core-components-shared-cold-performance` -> 4 files / 32 tests passed.
- `npm run check:precompiled-routes` -> passed, 4 entries.
- `npm run check:bundle` -> passed, total JS 9666.90 KB; startup static JS raw 523.31 KB / gzip 167.44 KB.
- `npm run check:test-ci-coverage` -> all 1197 test files covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.
- `npm run verify:static` -> passed end-to-end, including artifacts, precompiled routes, secrets, DOM sinks, source-size, explicit-any, architecture, audit, typecheck, strict-core, ts6, lint, build, and bundle.
- CDP scoped-layout smoke with `PRECOMPILED_ROUTE_VISIBLE=1`:
  - selected node: `start-calc`
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - `layoutTransactionStatus=committed`
  - `hardClean=true`
  - `preservedEdgeCount=true`
  - `selectedStillPresent=true`
- Post-generation `npm run check:precompiled-routes` -> passed, 4 entries.

### Current state and next target

Obstacle repair is no longer the first large-graph bottleneck in the latest WMS capture. The next optimization target should move to `quality-crossing-sweeps`, `quality-strict-closure`, and `finalizer`, because they now dominate the large-graph route time. Avoid lowering the obstacle candidate cap further without WMS/logistics fingerprint evidence; the safe improvement came from ordering and de-duplication, not from blindly starving the repair search.

## 2026-09-12 continuation: strict-closure phase observability and next bottleneck isolation

### Why this continuation was needed

After obstacle repair stopped appearing in the WMS top-10 slow phases, the remaining large-graph bottlenecks moved to quality crossing sweeps, strict closure, and the finalizer. The previous `quality-strict-closure` phase was too coarse: it reported hundreds of milliseconds but did not reveal whether time was spent in strict crossing scan, global waypoint sweep, endpoint-lane repair, strict bypass generation, or post-bypass cleanup. Optimizing that black box directly would risk changing deterministic route geometry without knowing which subfamily was expensive.

### Fixes applied

- Added child phases under `quality-strict-closure` in `src/core/components/shared/baseReactFlowDisplayRoutingTrace.ts`:
  - `quality-strict-closure-initial-scan`
  - `quality-strict-closure-sweep`
  - `quality-strict-closure-endpoint-lane`
  - `quality-strict-closure-bypass`
  - `quality-strict-closure-post-bypass`
  - `quality-strict-closure-loop`
- Extracted strict closure out of `src/core/components/shared/baseReactFlowDisplayFullRouteQualityPhase.ts` into `src/core/components/shared/baseReactFlowDisplayQualityStrictClosure.ts`, keeping the main quality pipeline below the source-size gate and turning strict closure into a focused, testable routing helper.
- Preserved the original candidate choice policy; the change is observability plus a small reuse of the initial strict-crossing scan result, not a geometry-policy change.

### Measurement and evidence

Latest machine-mode production measurement against `http://127.0.0.1:4174` was saved at `.common-tools/reports/layout-routing-audit/latest-precompiled-measure.jsonl`. For `wms-process-flow-v1` in that run:

- route total: about 5413 ms
- `quality-strict-closure`: about 407.9 ms, exclusive about 2.8 ms
- strict-closure child breakdown:
  - `quality-strict-closure-bypass`: about 242 ms, 19 changed edges
  - `quality-strict-closure-sweep`: about 77.3 ms, 17 changed edges
  - `quality-strict-closure-post-bypass`: about 61.5 ms, 18 changed edges
  - `quality-strict-closure-loop`: about 20.7 ms, skipped after one scan
  - `quality-strict-closure-endpoint-lane`: about 3.6 ms
  - `quality-strict-closure-initial-scan`: about 0 ms in this cached run

This narrows the next safe optimization target: `repairStrictBypassesIfNeeded` and its endpoint-orthogonalized candidate path dominate strict closure, not the strict crossing count itself.

### Verification

- `npx vitest run --pool=threads --maxWorkers=1 src/core/components/shared/__tests__/baseReactFlowDisplayWorkerProtocol.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayEdges.wmsColdPerformance.test.ts src/core/components/shared/__tests__/baseReactFlowDisplayFullRouteQualityPhase.test.ts --reporter=verbose` -> 3 files / 36 tests passed.
- `npm run typecheck` -> passed.
- `npm run check:explicit-any` -> passed with 0 grandfathered occurrences.
- `npm run check:source-size` -> passed for 3193 source files after extracting the helper.
- `npm run build` -> passed.
- `npm run generate:precompiled-routes` -> generated 4 production precompiled route artifacts; WMS `routeMs` was about 5051 ms in that noisy run.
- `npm run check:precompiled-routes` -> passed, 4 entries.
- `npm run check:bundle` -> passed, total JS 9669.02 KB; startup static JS raw 523.31 KB / gzip 167.44 KB.
- `npm run check:test-ci-coverage` -> all 1197 test files covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.
- `npm run verify:static` -> passed end-to-end, including artifacts, precompiled routes, secrets, DOM sinks, source-size, explicit-any, architecture, audit, typecheck, strict-core, ts6, lint, build, and bundle.
- CDP scoped-layout smoke with `PRECOMPILED_ROUTE_VISIBLE=1`:
  - selected node: `start-calc`
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - `layoutTransactionStatus=committed`
  - `hardClean=true`
  - `preservedEdgeCount=true`
  - `selectedStillPresent=true`

### Current state and next target

The layout/connection audit now has implementation coverage, regression tests, production-route artifacts, CDP UI smoke, and phase-level evidence. The next engineering step should target strict bypass candidate generation, not strict-count caching. Specifically: inspect `repairStrictBypassesIfNeeded` for duplicate candidate families, repeated endpoint orthogonalization, and opportunities to reuse changed-edge indexes while preserving WMS deterministic route fingerprints.

## 2026-09-12 continuation: strict-bypass candidate dedupe and diagnostics

### Why this continuation was needed

The previous strict-closure split showed that `quality-strict-closure-bypass` was the dominant strict-closure child phase. The next safe optimization was not to change crossing policy, but to remove duplicate candidate work before expensive strict-crossing, obstacle, and quality gates run.

### Fixes applied

- Added `DetachedStrictCrossingRepairDiagnostics` and `createDetachedStrictCrossingRepairDiagnostics` in `src/core/strategies/shared/edgeDetachedStrictCrossingRepair.ts`.
- Added order-preserving exact-path candidate de-duplication in the strict-crossing bypass candidate pool.
- Filtered candidates identical to the current path before expensive evaluation; this is behavior-preserving because the current path cannot repair the current strict crossing.
- Threaded diagnostics through `repairStrictBypassesIfNeeded` in `src/core/components/shared/baseReactFlowDisplayObstacleRepair.ts`.
- Published strict-bypass candidate generation, de-duplication/cache, and evaluation counts through `quality-strict-closure-bypass`, `quality-strict-closure-post-bypass`, and `quality-strict-closure-loop` traces in `src/core/components/shared/baseReactFlowDisplayQualityStrictClosure.ts`.

### Measurement and evidence

Production measurement against `http://127.0.0.1:4174` saved at `.common-tools/reports/layout-routing-audit/latest-precompiled-measure.jsonl` showed the WMS strict-bypass candidate pool explicitly:

- `quality-strict-closure-bypass`:
  - generated candidates: 13787
  - duplicate/cache count: 738
  - evaluated candidates after de-duplication: 13049
  - duration in the lower-noise run: about 219 ms
- `quality-strict-closure-post-bypass`:
  - generated candidates: 3360
  - duplicate/cache count: 180
  - evaluated candidates after de-duplication: 3180
  - duration in the lower-noise run: about 49.5 ms
- `quality-strict-closure-loop`:
  - generated candidates: 1231
  - duplicate/cache count: 72
  - evaluated candidates after de-duplication: 1160

A later CDP run was noisier, but the candidate counters stayed stable, which confirms the deterministic work reduction. The WMS deterministic cold-performance test still passed, so the route fingerprint/quality contract was preserved.

### Verification

- `npm run typecheck` -> passed.
- `npm run check:explicit-any` -> passed with 0 grandfathered occurrences.
- `npm run check:source-size` -> passed for 3193 source files.
- `npx vitest run --pool=threads --maxWorkers=1 src/core/components/shared/__tests__/baseReactFlowDisplayEdges.wmsColdPerformance.test.ts src/core/strategies/shared/__tests__/edgeDetachedOverlapRepair.regression.test.ts --reporter=verbose` -> 2 files / 12 tests passed.
- Earlier broader focused run after diagnostics wiring: `baseReactFlowDisplayWorkerProtocol.test.ts`, `baseReactFlowDisplayEdges.wmsColdPerformance.test.ts`, `baseReactFlowDisplayFullRouteQualityPhase.test.ts`, and `edgeDetachedOverlapRepair.regression.test.ts` -> 4 files / 47 tests passed.
- `npm run build` -> passed.
- `npm run generate:precompiled-routes` -> generated 4 production precompiled route artifacts; WMS `routeMs` about 5481 ms in that run.
- `npm run check:precompiled-routes` -> passed, 4 entries.
- `npm run check:bundle` -> passed, total JS 9670.27 KB; startup static JS raw 523.31 KB / gzip 167.44 KB.
- `npm run check:test-ci-coverage` -> all 1197 test files covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings.
- `npm run verify:static` -> passed end-to-end, including artifacts, precompiled routes, secrets, DOM sinks, source-size, explicit-any, architecture, audit, typecheck, strict-core, ts6, lint, build, and bundle.
- CDP scoped-layout smoke with `PRECOMPILED_ROUTE_VISIBLE=1`:
  - selected node: `start-calc`
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - `layoutTransactionStatus=committed`
  - `hardClean=true`
  - `preservedEdgeCount=true`
  - `selectedStillPresent=true`

### Current state and next target

Strict bypass now has deterministic candidate counters and avoids exact duplicate path evaluation. The next meaningful optimization should be candidate-family ranking or early pruning inside `bypassStrictCrossingSegmentCandidates`: the WMS trace still evaluates more than 13k strict-bypass candidates in the first bypass phase, so the large remaining opportunity is to reduce generated candidate families while preserving the accepted WMS route fingerprint.


## 2026-09-12 continuation: evidence-cache verified strict-bypass profile

### What changed since the previous strict-bypass note

The earlier strict-bypass report captured only exact-path de-duplication. The latest implementation also caches per-candidate evidence inside each strict-bypass repair iteration: strict crossing count, obstacle gate result, quality score, and detached score. This keeps the route policy intact while avoiding repeated expensive evidence collection for equivalent candidate paths in the same repair pass.

### Latest measured WMS counters

Latest machine trace: `.common-tools/reports/layout-routing-audit/latest-precompiled-measure.jsonl`.

- `wms-process-flow-v1` latest measured `routeMs`: about 4877 ms.
- `quality-strict-closure`: about 412.1 ms.
- `quality-strict-closure-bypass`:
  - early exact-path candidate de-duplication reduced generated candidates from 13787 to 13391.
  - evaluated candidates: 13049.
  - evidence-cache / duplicate hits: 900.
  - duration: about 256.6 ms.
- `quality-strict-closure-post-bypass`:
  - generated candidates reduced from 3360 to 3270.
  - evaluated candidates: 3180.
  - evidence-cache / duplicate hits: 90.
  - duration: about 56.3 ms.
- `quality-strict-closure-loop`:
  - generated candidates reduced from 1231 to 1195.
  - evaluated candidates: 1160.
  - evidence-cache / duplicate hits: 36.
  - duration: about 17.9 ms.

The important result is not a single noisy CDP timing number; it is that deterministic work counters now expose and reduce repeated strict-bypass candidate work without changing the accepted WMS route contract.

### Production artifact and UI verification after the latest cache work

- Current precompiled route manifest contains 4 entries and preserves the WMS initial output signature `route-v2:44:163:9e3051b64253ed60`.
- `npm run verify:static` -> passed end-to-end after the latest strict-bypass evidence-cache wiring, including artifacts, precompiled routes, secrets, DOM sinks, source-size, explicit-any, architecture, audit, typecheck, strict-core, ts6, lint, build, and bundle.
- Bundle gate in that run: total JS 9671.04 KB; startup static JS raw 523.31 KB / gzip 167.44 KB.
- CDP scoped-layout smoke against `http://127.0.0.1:4174` with `PRECOMPILED_ROUTE_VISIBLE=1` -> passed:
  - selected node: `start-calc`
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - `layoutTransactionStatus=committed`
  - `hardClean=true`
  - `preservedEdgeCount=true`
  - `selectedStillPresent=true`

### Updated industry-comparison conclusion

Compared with commercial diagram editors and graph tools, Vizly has now closed several production-grade gaps: semantic connection validation, sanitized import/snapshot/clipboard edges, scoped layout transactions, edge-count-preserving failure closure, parallel-edge lane separation, obstacle repair, deterministic precompiled routing, phase-level routing telemetry, and CDP-backed UI smoke coverage.

The remaining industry gap is no longer basic correctness. It is interactive-scale routing efficiency on dense WMS diagrams. The next optimization target should move from strict closure to the larger WMS hot phases:

1. `quality-crossing-sweeps` remains around 922 ms in the latest measured WMS trace.
2. `finalizer` remains around 992 ms in the same trace.
3. `seed-terminal-axis` remains around 759 ms in the same trace.
4. Strict bypass still evaluates more than 13k candidates in its first bypass phase, so candidate-family ranking or safe early pruning remains useful, but it should preserve the WMS output signature and regression tests.

Recommended next step: instrument `quality-crossing-sweeps` child candidate families with the same deterministic counters used for strict bypass, then rank or prune repeated dogleg/global-refine families only after the trace proves which family dominates.

## 2026-09-12 continuation: crossing-sweep dogleg observability

### Why this pass continued beyond strict-bypass

After strict-bypass evidence caching, the WMS hot path moved back to `quality-crossing-sweeps`, `finalizer`, and `seed-terminal-axis`. Rather than pruning candidate families blindly, this pass added bounded, aggregate-only dogleg diagnostics to the routing trace so future crossing-sweep optimization can distinguish risk-edge volume, pass count, exact duplicate candidates, and expensive quality evaluation.

### Implementation

- Extended `DisplayRoutingPhaseMetrics` / `DisplayRoutingPhaseTrace` with three safe aggregate counters:
  - `processedEdgeCount`
  - `passCount`
  - `deduplicatedCandidateCount`
- Updated Worker trace protocol validation and aggregation so these counters survive Worker -> UI/CDP boundaries without carrying graph labels, ids, paths, or user-authored content.
- Projected the new counters through the browser/precompiled/matrix measurement scripts when present, while preserving backward-compatible output for traces that do not emit them.
- Wired local dogleg diagnostics into:
  - `quality-crossing-global-refine-dogleg-initial`
  - `quality-crossing-global-refine-dogleg-final`

### Latest WMS trace-all evidence

Trace-all artifact: `.common-tools/reports/layout-routing-audit/latest-precompiled-wms-trace-all.jsonl`.

For `wms-process-flow-v1`, routeMs was about 5059 ms in this trace-all run. Key crossing-sweep dogleg phases:

- `quality-crossing-global-refine-dogleg-initial`:
  - duration: about 105.9 ms
  - candidates: 15085
  - quality evaluations: 45
  - cache hits: 24318
  - processed edges: 24
  - passes: 32
  - exact duplicate candidates: 14
- `quality-crossing-global-refine-dogleg-final`:
  - duration: about 43.2 ms
  - candidates: 8717
  - quality evaluations: 16
  - cache hits: 10579
  - processed edges: 21
  - passes: 21
  - exact duplicate candidates: 4

Interpretation: this hotspot is not dominated by quality scoring volume. It is dominated by candidate-family generation and cached geometry/interactions across many risky edges and passes. The next safe optimization should therefore target repeated dogleg candidate generation per processed edge/pass, not the quality evaluator.

### Latest measurement and gates

- Refreshed no-write measurement: `.common-tools/reports/layout-routing-audit/latest-precompiled-measure.jsonl`.
  - `wms-process-flow-v1` measured routeMs: about 4936 ms.
  - `quality-crossing-sweeps`: about 1137.8 ms.
  - `quality-strict-closure`: about 459.2 ms.
  - `finalizer`: about 1065.4 ms.
- Rebuilt production bundle before regenerating precompiled routes to avoid stale browser evidence from the running preview server.
- `npm run generate:precompiled-routes` -> generated 4 production precompiled route artifacts after the trace-field change.
- `npm run check:precompiled-routes` -> passed, 4 entries.
- `npm run verify:static` -> passed end-to-end after this pass.
- Focused tests passed:
  - `baseReactFlowDisplayWorkerProtocol.test.ts`
  - `baseReactFlowDisplayWorkerTraceRecorder.test.ts`
  - `baseReactFlowDisplayQualityDoglegSession.test.ts`
  - `baseReactFlowDisplayEdges.wmsColdPerformance.test.ts`
- Script tests passed:
  - `precompiled-display-route-performance.test.mjs`
  - `display-routing-browser-performance.test.mjs`
  - `display-routing-matrix-wait-state.test.mjs`
- Bundle gate passed: total JS 9671.92 KB; startup static JS raw 523.31 KB / gzip 167.44 KB.
- CDP scoped-layout smoke passed against `http://127.0.0.1:4174`:
  - selected node: `start-calc`
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - `layoutTransactionStatus=committed`
  - `hardClean=true`
  - `preservedEdgeCount=true`
  - `selectedStillPresent=true`

### Updated next optimization target

The strongest next candidate is a dogleg candidate-generation cache or ranking layer scoped to one repair pass/edge family. It should be guarded by the WMS route signature and should not drop fallback candidate families until trace evidence shows which family is repeatedly generated without acceptance.

## 2026-09-12 continuation: dogleg per-pass candidate concentration

### Why this pass was needed

The previous dogleg observability showed WMS dogleg repair was dominated by candidate generation and cached geometry checks, not quality scoring. This pass added one more bounded diagnostic using the existing trace schema: non-zero per-pass `minimumCandidateCount` and per-pass `maximumCandidateCount`. The goal is to distinguish many small passes from a few pathological candidate bursts before pruning any candidate family.

### Implementation

- Extended `LocalDoglegRepairDiagnostics` with:
  - `minimumCandidateCount`: smallest non-zero candidate count produced by a dogleg repair pass.
  - `maximumCandidateCount`: largest candidate count produced by a dogleg repair pass.
- Propagated those values through the existing `minimumCandidateCount` / `maximumCandidateCount` phase metrics for:
  - `quality-crossing-global-refine-dogleg-initial`
  - `quality-crossing-global-refine-dogleg-final`
- Updated the trace-all precompiled route logger so these existing metrics appear in the evidence file.
- Kept the metric content bounded and aggregate-only: no paths, node ids, edge ids, labels, or user-authored content.

### Evidence

Trace-all artifact: `.common-tools/reports/layout-routing-audit/latest-precompiled-wms-trace-all.jsonl`.

For `wms-process-flow-v1` in the latest trace-all run:

- `quality-crossing-global-refine-dogleg-initial`:
  - route phase duration: about 128.3 ms
  - total candidates: 15085
  - quality evaluations: 45
  - processed edges: 24
  - passes: 32
  - min non-zero candidates per pass: 1
  - max candidates in a single pass: 6179
- `quality-crossing-global-refine-dogleg-final`:
  - route phase duration: about 64.1 ms
  - total candidates: 8717
  - quality evaluations: 16
  - processed edges: 21
  - passes: 21
  - min non-zero candidates per pass: 1
  - max candidates in a single pass: 6983

This proves the dogleg hot path is concentrated in a small number of pathological candidate bursts. The next implementation target should be family-level instrumentation or pruning for the high-burst pass, rather than a broad cap across all passes.

### Verification

- `npm run build` -> passed before regenerating precompiled artifacts.
- `npm run generate:precompiled-routes` -> generated 4 production precompiled route artifacts.
- `npm run check:precompiled-routes` -> passed, 4 entries.
- `npm run check:bundle` -> passed, total JS 9672.45 KB; startup static JS raw 523.31 KB / gzip 167.44 KB.
- `npm run typecheck` -> passed.
- Focused tests passed:
  - `src/core/strategies/shared/__tests__/edgeLocalDoglegRepairDiagnostics.test.ts`
  - `scripts/lib/precompiled-display-route-performance.test.mjs`

### Next target

The evidence now points to high-cardinality lane or endpoint candidate builders within one or two dogleg passes. The next safe step is to count candidates by builder family inside the dogleg repair pass, then rank/limit only the family that produces thousands of rejected candidates while preserving WMS route signatures.

## 2026-09-12 continuation: dogleg family attribution and outer-lane pruning

### Industry comparison

Mature orthogonal routers generally avoid unbounded local-detour expansion. They rank candidate lanes by local relevance, keep a small fallback set, and preserve deterministic safety gates after pruning. The earlier Vizly trace showed our dogleg repair behaved more like an exhaustive local enumerator for outer lanes, which is useful for quality but not competitive for dense WMS graphs.

### Implementation

- Added dogleg candidate-family counters and projected them through worker, browser, precompiled, and matrix trace paths:
  - `scalarCandidateCount`
  - `channelCandidateCount`
  - `outerLaneCandidateCount`
  - `tinyLaneCandidateCount`
  - `obstacleLaneCandidateCount`
  - `endpointLaneCandidateCount`
  - `endpointOffsetCandidateCount`
  - `terminalBridgeCandidateCount`
  - `returnCandidateCount`
- Split worker phase metric regression coverage into `baseReactFlowDisplayWorkerPhaseMetrics.test.ts` to keep the original protocol test under the source-size gate.
- Added a targeted outer-lane candidate budget: `OUTER_LANE_CONTRACTION_CANDIDATE_LIMIT = 512`.
- The budget is local to outer-lane contraction candidates and ranks by:
  - closeness to the contracted main band, and
  - smallest bridge-entry displacement.
- Added a regression test proving large outer-lane candidate sets are bounded by ranked local relevance.

### Evidence before pruning

From the earlier WMS trace-all evidence in `.common-tools/reports/layout-routing-audit/latest-precompiled-wms-trace-all.jsonl` before the pruning change:

- `quality-crossing-global-refine-dogleg-initial`:
  - total candidates: 15085
  - outer-lane candidates: 14938
  - max candidates in one pass: 6179
- `quality-crossing-global-refine-dogleg-final`:
  - total candidates: 8717
  - outer-lane candidates: 8662
  - max candidates in one pass: 6983

This confirmed that the pathological family was outer-lane contraction, not scalar, channel, endpoint, terminal bridge, or return-shape builders.

### Evidence after pruning

Latest trace-all artifact: `.common-tools/reports/layout-routing-audit/latest-precompiled-wms-trace-all.jsonl`.

For `wms-process-flow-v1` after the outer-lane budget:

- `quality-crossing-global-refine-dogleg-initial`:
  - total candidates: 6791
  - outer-lane candidates: 6427
  - max candidates in one pass: 1123
  - processed edges: 25
  - passes: 37
  - quality evaluations: 61
- `quality-crossing-global-refine-dogleg-final`:
  - total candidates: 1854
  - outer-lane candidates: 1815
  - max candidates in one pass: 531
  - processed edges: 22
  - passes: 23
  - quality evaluations: 12
- `quality-topology-trunks-dogleg`:
  - total candidates: 2229

Candidate-count improvement on the WMS dogleg phases:

- Initial dogleg: 15085 -> 6791, about 55% fewer candidates.
- Final dogleg: 8717 -> 1854, about 79% fewer candidates.
- Single-pass burst ceiling: 6983 -> 1123/531 range in the latest WMS run.

Timing remains browser/CPU noisy, so the strongest evidence here is deterministic bounded work reduction plus hard-clean route verification.

### Verification

- Focused tests passed: 7 files / 93 tests.
- `npm run typecheck` -> passed.
- `npm run check:explicit-any` -> passed with 0 explicit-any occurrences.
- `npm run check:source-size` -> passed for 3194 source files.
- `npm run build` -> passed.
- `npm run generate:precompiled-routes` -> generated 4 production precompiled route artifacts.
- `npm run check:precompiled-routes` -> passed, 4 entries.
- `npm run check:bundle` -> passed, total JS 9677.63 KB; startup static JS raw 523.31 KB / gzip 167.44 KB.
- `npm run check:test-ci-coverage` -> passed, all 1198 test files covered by test:ci shards.
- `git diff --check` -> passed; only CRLF normalization warnings were printed.
- CDP scoped-layout smoke against `http://127.0.0.1:4174` passed:
  - selected node: `start-calc`
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - `layoutTransactionStatus=committed`
  - `hardClean=true`
  - `preservedEdgeCount=true`
  - `selectedStillPresent=true`

### Remaining optimization targets

- WMS still spends major time in `seed-terminal-axis`, `quality-crossing-final-candidates`, and finalizer/commercial closure. These now look more important than the already-bounded dogleg outer-lane burst.
- The next safe step is not lowering the 512 outer-lane cap blindly. It should be a separate pass with route-signature comparison and focused instrumentation for seed-terminal-axis and finalizer candidate families.

## 2026-09-12 continuation: seed-terminal-axis bounded shortlist

### Why this pass was needed

After bounding dogleg outer-lane candidates, the next WMS trace showed `seed-terminal-axis` as a black-box hotspot. The phase had no internal work counters, so it was unsafe to change the terminal repair algorithm directly. This pass first added bounded aggregate diagnostics, then used the evidence to reduce the ranked terminal-axis candidate shortlist.

### Implementation

- Added aggregate terminal-axis repair diagnostics:
  - `passCount`
  - `processedEdgeCount`
  - `candidateCount`
  - `maximumCandidateCount`
  - `qualityEvaluationCount`
- Projected those diagnostics through the existing `seed-terminal-axis` phase metrics using already-supported safe counters.
- Lowered terminal-axis ranked candidate shortlist from `4096` to `512` candidates per processed edge.
- Preserved existing ranked selection semantics: candidates are still ordered by path length and deduplicated after compaction.
- Split terminal-axis path metric helpers into `baseReactFlowTerminalAxisPathMetrics.ts` to keep the repair module under the source-size gate instead of raising a baseline.

### Evidence before shortlist reduction

Trace-all evidence showed `seed-terminal-axis` was materializing too many candidates:

- `seed-terminal-axis` before the candidate limit change:
  - passCount: 4
  - processedEdgeCount: 8
  - candidateCount: 32784
  - qualityEvaluationCount: 2687
  - maximumCandidateCount: 4098
  - phase duration in that run: about 610 ms

The maximum count matched the old 4096 candidate cap plus small endpoint/nudge groups, proving that the cap itself was too wide for WMS-scale cold routing.

### Evidence after shortlist reduction

Latest trace-all artifact: `.common-tools/reports/layout-routing-audit/latest-precompiled-wms-trace-all.jsonl`.

For `wms-process-flow-v1` after reducing the ranked shortlist to 512:

- `seed-terminal-axis`:
  - passCount: 4
  - processedEdgeCount: 8
  - candidateCount: 4112
  - qualityEvaluationCount: 797
  - maximumCandidateCount: 514
  - phase duration in the latest run: about 180.7 ms
  - resolution: accepted

Work reduction:

- candidateCount: 32784 -> 4112, about 87% fewer candidates.
- qualityEvaluationCount: 2687 -> 797, about 70% fewer evaluations.
- maximumCandidateCount: 4098 -> 514, about 87% lower single-edge burst.

Timing remains browser/CPU noisy, but this run also improved from about 610 ms to about 181 ms for the phase while preserving the accepted route.

### Verification

- `src/core/components/shared/__tests__/baseReactFlowTerminalAxisRepair.test.ts` -> passed, including large-graph bounded-vs-unbounded quality equivalence.
- Focused routing/trace tests passed: 8 files / 112 tests.
- `npm run typecheck` -> passed.
- `npm run check:explicit-any` -> passed with 0 explicit-any occurrences.
- `npm run check:source-size` -> passed for 3195 source files.
- `npm run check:test-ci-coverage` -> passed, all 1198 test files covered by test:ci shards.
- `npm run check:architecture` -> passed, no new dependency debt or runtime cycles.
- `npm run build` -> passed.
- `npm run generate:precompiled-routes` -> generated 4 production precompiled route artifacts.
- `npm run check:precompiled-routes` -> passed, 4 entries.
- `npm run check:bundle` -> passed, total JS 9678.17 KB; startup static JS raw 523.31 KB / gzip 167.44 KB.
- CDP scoped-layout smoke passed:
  - selected node: `start-calc`
  - before: 30 nodes / 26 edges
  - committed: 30 nodes / 26 edges
  - `layoutTransactionStatus=committed`
  - `hardClean=true`
  - `preservedEdgeCount=true`
  - `selectedStillPresent=true`
- `git diff --check` -> passed; only CRLF normalization warnings were printed.

### Next target

The next confirmed hotspot is no longer terminal-axis. The strongest remaining WMS evidence points to strict-closure bypass and final endpoint/commercial closure:

- `quality-strict-closure-bypass`: still around 13113 candidates / 12753 evaluations in the latest trace.
- `final-endpoint-closure-commercial`: still a large exclusive finalizer component, currently under-instrumented.

The next safe optimization should therefore instrument and rank/prune strict-closure bypass or final commercial closure, not further lower the terminal-axis cap without additional route-signature evidence.
