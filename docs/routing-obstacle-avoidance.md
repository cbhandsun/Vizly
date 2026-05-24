# 连线路由：避障与正交性 — 架构决策与经验教训

> 本文档记录了连线路由系统中 **避障 (obstacle avoidance)** 与 **正交性 (orthogonality)** 两大约束的设计决策、失败案例与最终解决方案。
> 供后续开发和 AI 辅助编程参考。

---

## 1. 多目标约束体系

连线路由需要同时满足以下约束（按优先级排序）：

| 优先级 | 约束 | 说明 |
|---|---|---|
| P0 | **正交性** | 所有线段必须水平或垂直，禁止对角线 |
| P0 | **避障** | 连线不可穿过任何节点矩形的内部 |
| P1 | **端口方向** | 连线从端口出发的第一段必须朝端口方向（Right→向右，Bottom→向下） |
| P1 | **连通性** | 连线必须从源端口到达目标端口 |
| P2 | **最短路径** | 在满足以上约束的前提下尽量短 |
| P2 | **少交叉** | 减少连线之间的交叉 |
| P3 | **主干共享** | 一对多/多对一的边共享主干线段 |

> [!IMPORTANT]
> P0 约束之间存在根本性冲突：A* 需要源/目标不是障碍物才能到达端口点，但这导致路径可能穿过源/目标节点内部。整个修复方案都围绕这个矛盾展开。

---

## 2. 核心架构：Pipeline 障碍物使用策略

### 2.1 两套障碍物列表

```
obstacles         = routingObstacles = graph.obstacles - 源节点 - 目标节点
simplifyObstacles = obstacles + [源节点rect, 目标节点rect]
```

- **obstacles**: A* 寻路用。移除源/目标让 A* 能到达端口点
- **simplifyObstacles**: 后处理用。包含源/目标，防止简化/正交化创建穿透路径

### 2.2 各阶段障碍物分配

```
┌─────────────────────────────────────────────────────────┐
│ A* Pathfinding    → obstacles（无源/目标）                │
│                     允许穿过源/目标到达端口                │
├─────────────────────────────────────────────────────────┤
│ Phase 0:  ensureMinFirstSegment(startPos)                │
│           ensureMinLastSegment(endPos)                    │
│           → 无障碍物检查，只管方向和最小长度               │
├─────────────────────────────────────────────────────────┤
│ Phase 0b: 穿透点删除                                     │
│           → extraObstacles（仅源/目标rect）               │
│           删除在源/目标内部的中间航路点                     │
├─────────────────────────────────────────────────────────┤
│ Phase 1-2: simplifyPath, trySimplify4PointCShape,        │
│            removeLargeBacktrack, collapseRedundantBends,  │
│            removeSmallJogs                                │
│           → simplifyObstacles ✅                          │
├─────────────────────────────────────────────────────────┤
│ Phase 3:  nudgeSegments                                  │
│           → obstacles（nudge 只微移，不涉及穿透）         │
├─────────────────────────────────────────────────────────┤
│ Phase 4:  makePathOrthogonal                             │
│           → simplifyObstacles ✅                          │
│           L 弯选择时避开源/目标节点                        │
├─────────────────────────────────────────────────────────┤
│ Phase 5:  simplifyPath, removeTinyOrthogonalJogs,        │
│            collapseRedundantBends                         │
│           → simplifyObstacles ✅                          │
└─────────────────────────────────────────────────────────┘
```

### 2.3 extraObstacles 传递通道

```
EdgeRoutingWorker
  → clearanceRects = [sRect, tRect]
  → PostProcessContext.extraObstacles = clearanceRects
  → PathPostProcessor.process() 构建 simplifyObstacles
```

---

## 3. 失败案例与教训

### ❌ 方案 1: sanitizeNodePenetration（后处理修补）

**思路**: A* 路径穿过源节点后，扫描中间点，把在节点内部的点推到节点外面。

**失败原因**:
1. 推出点后创建的**新线段**可能穿过**其他节点**（如 YMS）
2. 推出点后与下一个点的连接变成**对角线**，破坏正交性
3. 插入"桥接点"修复正交后，新的垂直/水平段仍可能穿过其他障碍物

**教训**:
> [!CAUTION]
> 不要在后处理中"移动"路径点来修复穿透。移动一个点会创建新的线段，这些线段可能违反其他约束。路径点的正确性必须在生成时保证，或通过"删除+重建"而非"移动"来修复。

### ❌ 方案 2: 缩小源/目标障碍物（Shrink 15px）

**思路**: 不移除源/目标障碍物，而是缩小 15px。端口点在原始边缘上（比缩小后的障碍物外围 15px），A* 可以到达；但内部仍被阻挡。

**失败原因**:
1. 缩小后的障碍物边缘与原始边缘之间有 15px 的"间隙"
2. A* 在这个间隙区域生成路径，但间隙太窄，导致**非正交路径**
3. 不同的端口方向（上/下/左/右）需要不同方向的间隙，统一缩小不够精确

**教训**:
> [!CAUTION]
> 修改障碍物几何形状（缩小/膨胀）会引入难以预测的 A* 行为。A* 网格对齐、间隙大小、端口位置三者交互复杂。

### ❌ 方案 3: 只用 simplifyObstacles 但 Phase 4 用 obstacles

**思路**: Phase 1-2, 5 用 simplifyObstacles 防止简化穿透，但 Phase 4 makePathOrthogonal 用 obstacles（不含源/目标），因为担心 isPointBlocked 误判端口点。

**失败原因**:
1. Phase 4 用 obstacles 时，正交化选择 L 弯方向不考虑源/目标 → 可能选择穿过源节点的方向
2. 例如: (1236,871)→(1142,1430) 正交化时选 (1142,871) 作为拐点（在 TMS 内部），而非 (1236,1430)

**教训**:
> [!IMPORTANT]
> makePathOrthogonal 的 isPointBlocked(PAD=10) 只检查**新创建的中间点**，不检查已有的端口点。stub 点（port + minLength ≈ 30px）远在 PAD=10px 范围之外。所以用 simplifyObstacles 是安全的。

---

## 4. 最终方案：三层防护

```
              A* 寻路（可穿过源/目标）
                      │
                      ▼
    ┌─── Phase 0: 端口方向强制 ───┐
    │ ensureMinFirstSegment(startPos) │
    │ 检测方向不匹配 → 插入正确 stub  │
    └───────────────────────────────┘
                      │
                      ▼
    ┌─── Phase 0b: 穿透点删除 ───┐
    │ 删除在源/目标内部的中间点     │
    │ 保留 stub 和远端点            │
    └────────────────────────────┘
                      │
                      ▼
    ┌─── Phase 1-5: 避障约束 ───┐
    │ simplifyObstacles 含源/目标 │
    │ 所有简化/正交化操作都检查    │
    │ 不会创建穿透路径             │
    └────────────────────────────┘
```

**为什么这个方案有效**:
1. Phase 0 保证了出发方向正确 → stub 点在节点外部
2. Phase 0b 删除了节点内部的点 → 路径可能有对角线，但无穿透点
3. Phase 4 makePathOrthogonal 用 simplifyObstacles → 对角线转正交时选择不穿透的方向
4. Phase 1-5 的所有简化函数用 simplifyObstacles → 不会重新创建穿透

---

## 5. 关键代码位置

| 功能 | 文件 | 关键行 |
|---|---|---|
| extraObstacles 传递 | `EdgeRoutingWorker.ts` | `clearanceRects = [sRect, tRect]` |
| Phase 0b 穿透删除 | `PathPostProcessor.ts` | `isInside(p, sR) && isInside(p, tR)` |
| simplifyObstacles 构建 | `PathPostProcessor.ts` | `[...obstacles, ...extraObstacles]` |
| 端口方向 stub | `smartEdgeUtils.ts` | `ensureMinFirstSegment(pts, min, sourcePos)` |
| L 弯方向选择 | `smartEdgeUtils.ts` | `makePathOrthogonal → isPointBlocked` |

---

## 6. 回归测试检查清单

修改路由代码时，必须验证以下场景：

- [ ] **穿透测试**: 从 TMS 到 visibility 的边不穿过 TMS 节点
- [ ] **正交测试**: 所有连线段必须水平或垂直
- [ ] **避障测试**: 从 L-OMS 到 visibility 的边绕过 TMS 和 YMS
- [ ] **端口方向**: Right 端口的连线第一段向右，Bottom 端口向下
- [ ] **bus 路径**: 一对多/多对一边的主干线不受影响
- [ ] **Trunk Direct**: 快速路径（直线+拐弯）不受 simplifyObstacles 影响

---

## 7. 常见陷阱

1. **不要在 A* 障碍物中包含源/目标的完整矩形** — A* 无法到达端口点
2. **不要在后处理中"移动"路径点** — 会创建新的未验证线段
3. **Phase 4 的 isPointBlocked 有 PAD=10px** — 不影响 stub 点（>= 30px 远）
4. **Trunk Direct 和 Reverse U-Turn 走快速路径** — 绕过 Phase 0-5
5. **nudgeSegments 用原始 obstacles** — nudge 只做微小位移，无穿透风险
