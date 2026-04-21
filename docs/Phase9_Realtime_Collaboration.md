# Phase 9: 实时多人协作 (Real-time Multi-user Collaboration) 技术文档

## 1. 概述
Phase 9 实现了 Vizly 的实时协同能力，允许全球用户在同一图表上进行低延迟、强一致性的协同编辑。系统基于 CRDT (Conflict-free Replicated Data Types) 技术，确保了复杂拓扑结构在并发修改下的最终一致性。

## 2. 核心架构

### 2.1 技术栈
- **Yjs**: 核心 CRDT 引擎。
- **y-websocket**: 通信与信令层。
- **Zustand**: 本地状态机，与 Yjs 深度绑定。
- **React Flow**: 画布渲染与交互层。

### 2.2 运行模式
系统支持两种运行模式，取决于环境变量 `VITE_YJS_WS_URL` 是否配置：
- **在线协作模式**：建立 WebSocket 连接，启用全量实时同步与 Presence。
- **本地单机模式（默认）**：仅创建 Y.Doc，不建立 WS 连接。所有状态保留在本地。

### 2.3 数据同步逻辑 (`useDiagramCollaboration`)
1. **Yjs -> Zustand**: 监听 Yjs Map 的 `observe` 事件。当远程发生变化时，在 `remote` 事务中更新本地 Zustand Store。
2. **评论同步**: Phase 11 新增，`yComments` Y.Map 双向绑定到 `useDiagramStore.comments`。
3. **循环保护**: 通过 `isRemoteUpdateRef` 引用标记，防止"本地更新 -> 远程广播 -> 远程更新 -> 本地广播"的死循环。

### 2.4 安全 API（防崩溃）
`CollaborationService` 提供了 Null-safe 访问 API，保证离线模式下不抛出异常：

| API | 行为 |
|-----|------|
| `getProviderSafe()` | 返回 `WebsocketProvider \| null`，永不 throw |
| `getAwarenessSafe()` | 返回 `Awareness \| null`，永不 throw |
| `isConnected()` | 检查是否有活跃 WS 连接 |
| `isInitialized()` | 检查 Y.Doc 是否存在（无论是否联网） |

> ⚠️ 组件中 **始终使用安全 API**，不要直接调用 `getAwareness()` / `getProvider()`，它们在离线模式下会 throw。

## 3. 实时存在感 (Presence)

### 3.1 活跃用户追踪 (`CollaborationAvatars`)
- 通过 Yjs Awareness 协议监听在线状态。
- 每个客户端在初始化时广播用户信息（ID, Name, Color）。
- UI 实时显示在线头像组，并带有在线状态指示灯。
- **优化**: 使用签名对比（sorted ID join）避免光标移动触发头像列表重渲染。

### 3.2 远程光标 (`RemoteCursors`)
- 监听 `onPaneMouseMove` 事件。
- 将坐标缩减并广播到 Awareness。
- 渲染层通过 React 生命周期实时感知其他用户的光标坐标，并使用平滑的 CSS 过渡效果进行移动。
- **优化**: 使用 `React.memo` + 静态样式对象，N 个光标移动时仅重渲染当前移动的 cursor（O(1)）。

## 4. 性能优化
- **事务处理**: 所有协同变更均包裹在 `transact` 中，减少过度重绘。
- **按需加载**: WebSocket 连接仅在进入设计器时建立，离开时自动销毁。
- **零包体积抖动**: Yjs 与 y-websocket 已作为基础依赖，未引入冗余重量级库。

## 5. 已知限制与未来计划
- **离线支持**: 目前依赖在线 Websocket 节点，未来可扩展 `y-indexeddb` 实现离线编辑与合并。
- **评论系统**: ✅ 已在 Phase 11 实现，基于坐标的评论 Pin 节点支持多人实时查看与回复。
- **冲突策略**: 目前采用"最后一次写入优先"与 CRDT 自动合并机制。
- **压力测试**: 建议在 10+ 并发用户场景下对 Awareness 同步延迟进行基准测试。

---
*Vizly Team - 2026-04-21 (更新：安全 API 架构、Phase 11 评论系统、性能优化记录)*
