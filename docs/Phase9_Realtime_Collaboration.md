# Phase 9: 实时多人协作 (Real-time Multi-user Collaboration) 技术文档

## 1. 概述
Phase 9 实现了 Vizly 的实时协同能力，允许全球用户在同一图表上进行低延迟、强一致性的协同编辑。系统基于 CRDT (Conflict-free Replicated Data Types) 技术，确保了复杂拓扑结构在并发修改下的最终一致性。

## 2. 核心架构

### 2.1 技术栈
- **Yjs**: 核心 CRDT 引擎。
- **y-websocket**: 通信与信令层。
- **Zustand**: 本地状态机，与 Yjs 深度绑定。
- **React Flow**: 画布渲染与交互层。

### 2.2 数据同步逻辑 (`useDiagramCollaboration`)
1. **Zustand -> Yjs**: 监听本地 `nodes` 和 `edges` 的变化。使用 `doc.transact` 并在 `local` 事务中将变更推送到 Yjs Map。使用了简单的差异对比（Deep Compare）来优化不必要的广播。
2. **Yjs -> Zustand**: 监听 Yjs Map 的 `observe` 事件。当远程发生变化时，在 `remote` 事务中更新本地 Zustand Store。
3. **循环保护**: 通过 `isRemoteUpdateRef` 引用标记，防止“本地更新 -> 远程广播 -> 远程更新 -> 本地广播”的死循环。

## 3. 实时存在感 (Presence)

### 3.1 活跃用户追踪 (`CollaborationAvatars`)
- 通过 Yjs Awareness 协议监听在线状态。
- 每个客户端在初始化时广播用户信息（ID, Name, Color）。
- UI 实时显示在线头像组，并带有在线状态指示灯。

### 3.2 远程光标 (`RemoteCursors`)
- 监听 `onPaneMouseMove` 事件。
- 将坐标缩减并广播到 Awareness。
- 渲染层通过 React 生命周期实时感知其他用户的光标坐标，并使用平滑的 CSS 过渡效果进行移动。

## 4. 性能优化
- **事务处理**: 所有协同变更均包裹在 `transact` 中，减少过度重绘。
- **按需加载**: WebSocket 连接仅在进入设计器时建立，离开时自动销毁。
- **零包体积抖动**: Yjs 与 y-websocket 已作为基础依赖，未引入冗余重量级库。

## 5. 已知限制与未来计划
- **离线支持**: 目前依赖在线 Websocket 节点，未来可扩展 `y-indexeddb` 实现离线编辑与合并。
- **评论系统**: 计划在 Phase 11 引入基于坐标的评论系统。
- **冲突策略**: 目前采用“最后一次写入优先”与 CRDT 自动合并机制。

---
*Vizly Team - 2026-04-16*
