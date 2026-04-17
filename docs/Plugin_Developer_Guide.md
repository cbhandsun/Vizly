# Vizly Plugin Developer Guide (v1.0)

欢迎来到 Vizly 插件开发指南。Vizly 采用模块化插件架构，允许开发者通过标准化 SDK 扩展画布能力、UI 组件及数据处理模型。

## 1. 核心概念
Vizly 的插件是通过 `PluginRegistry` 注册的单例对象。每个插件可以贡献以下能力：
- **Node Types**: 自定义 React Flow 节点实现。
- **Edge Types**: 自定义边/连线渲染。
- **UI Contributions**: 顶部工具栏、左右侧边栏面板、画布覆盖层。
- **Lifecycle Hooks**: 初始化、销毁及数据同步钩子。

## 2. 插件接口定义 (SDK)

```typescript
export interface Plugin {
    id: string;               // 唯一标识 (例如: 'flowchart', 'mindmap')
    name: string;             // 显示名称
    version: string;          // 版本号
    
    // --- 核心拓扑 ---
    getNodeTypes?: () => NodeTypes;
    getEdgeTypes?: () => EdgeTypes;

    // --- UI 注入点 ---
    contributeToolbar?: (ctx: PluginContext) => React.ReactNode;
    contributeSidebarPanels?: (ctx: PluginContext) => SidebarPanel[];
    contributeCanvasComponents?: (ctx: PluginContext) => React.ReactNode;

    // --- 生命周期 ---
    onInit?: (ctx: PluginContext) => void;
    onDestroy?: (ctx: PluginContext) => void;
    onDataSync?: (nodes: Node[], edges: Edge[], isAutoSave: boolean, ctx: PluginContext) => void;
}
```

## 3. 开发流程

### 3.1 创建插件定义
在 `src/plugins/your-plugin/index.ts` 中实现接口：

```typescript
export const MyPlugin: Plugin = {
    id: 'my-custom-plugin',
    name: '增强套件',
    onInit: (ctx) => {
        console.log('Plugin Initialized', ctx.diagramId);
    },
    contributeToolbar: (ctx) => (
        <Button onClick={() => ctx.takeSnapshot()}>快照</Button>
    )
};
```

### 3.2 注册插件
编辑 `src/services/PluginRegistry.ts` 将你的插件加入注册表：

```typescript
this.register(MyPlugin);
```

## 4. 最佳实践
1. **快照管理**: 在执行破坏性操作前，务必调用 `ctx.takeSnapshot()` 以支持撤销功能。
2. **主题适配**: 使用 `useTheme` 钩子获取全局配色，确保插件在深色和浅色模式下观感一致。
3. **性能**: 在 `onDataSync` 中避免执行复杂的 O(n^2) 计算，建议使用 `requestIdleCallback` 异步处理非关键同步逻辑。

## 6. 原子化指令桥接 (__flowDataBridge)

为了支持 AI 绘图副驾及外部自动化脚本，Vizly 引入了 **Atomic Command Bridge** 机制。这允许您在插件外部（如控制台或 AI 代理）通过命令式 API 操作画布。

### 6.1 访问桥接对象
每个图表实例都会在 `window.__flowDataBridge` 下注册一个名为 `{diagramId}` 的属性：

```typescript
const bridge = window.__flowDataBridge['your-diagram-id'];
```

### 6.2 核心方法
- **`importData(data: DiagramData, options?: { keepHistory: boolean })`**: 全量导入/还原图表数据。
- **`addNode(options: { label: string, shape: string })`**: 在视口中心插入新节点。
- **`deleteNodes(ids: string[])`**: 批量删除指定节点。
- **`triggerLayout(strategy?: string)`**: 触发自动布局（支持 `dagre`, `elk`, `force`）。
- **`animatePath(edgeIds: string[], options?: { duration: number, loop: boolean })`**: 开启路径动效（呼吸发光脉冲）。
- **`updateTheme(styles: Record<string, string>)`**: 注入动态 CSS 变量主题。

### 6.3 示例：从控制台模拟流量
```javascript
const bridge = window.__flowDataBridge['flowchart-main'];
bridge.animatePath(['edge-123'], { duration: 3000, loop: true });
```

---
*Vizly - 保持思考，绘制自如。*
