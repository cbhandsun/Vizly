# Vizly 插件开发指南 (v2.0)

欢迎加入 Vizly 生态开发。本指南将介绍如何利用 Vizly 的标准化 SDK 扩展画布能力、UI 交互及 AI 指令集。

---

## 1. 核心架构

Vizly 插件采用 **沙盒化隔离** 与 **统一容器集成**。插件只需实现 `DiagramTypePlugin` 接口，即可被 `FlowchartDesigner` 容器加载。

### 核心接口：`DiagramTypePlugin`
| 属性/方法 | 说明 | 必须 |
| :--- | :--- | :--- |
| `id` | 唯一标识符（如 `standard-flow`） | 是 |
| `name` | 插件显示名称 | 是 |
| `parseData` | 将外部领域数据（如 JSON/XML）解析为 ReactFlow 模型 | 是 |
| `serializeData` | 将 ReactFlow 模型导出为领域数据 | 是 |
| `getNodeTypes` | 注册该插件独有的 Node 组件清单 | 是 |
| `onAIAction` | **[GAP-10]** 接管并响应 AI 派发的原子化指令 | 是 |
| `getPluginState` | **[GAP-12]** 访问插件独立的持久化沙盒状态 | 是 |

---

## 2. 开发者上下文 (`PluginContext`)

每个生命周期钩子都会传入 `ctx` 对象，它是插件与主应用沟通的唯一桥梁。

```typescript
export interface PluginContext {
  // 数据获取
  getNodes(): Node[];
  getEdges(): Edge[];
  
  // 数据变更 (自动触发撤销快照)
  addNode(type: string, data?: any, position?: { x: number, y: number }): string;
  updateNodesBatch(ids: string[], updates: any): void;
  takeSnapshot(): void;
  
  // [GAP-12] 状态沙盒
  getPluginState<T>(): T | undefined;
  setPluginState<T>(patch: Partial<T>): void;
}
```

---

## 3. 快速上手：HelloWorld 插件

### 3.1 定义插件类
```typescript
export class MyPlugin implements DiagramTypePlugin {
  id = 'my-plugin';
  name = '超级插件';

  // 1. 注入工具按钮
  contributeToolbar(ctx) {
    return <Button onClick={() => ctx.setPluginState({ count: 1 })}>初始化状态</Button>;
  }

  // 2. 接管 AI 命令
  async onAIAction(action, params, ctx) {
    if (action === 'optimize-layout') {
       // ... 插件自己的布局逻辑
       return true; 
    }
    return false; // 交回给系统处理
  }
}
```

### 3.2 注册插件
在应用初始化阶段或按需加载处注册：
```typescript
PluginRegistry.getInstance().register(new MyPlugin());
```

---

## 4. 最佳实践 (DX)

### 4.1 实时调试
由于 Vizly 已经在开发环境下暴露了 `window.__vizly_plugins`，你可以在 Chrome 控制台直接测试你的插件逻辑：
```javascript
// 查看已加载的插件
console.table(__vizly_plugins.getAllPlugins());

// 模拟触发 AI 动作
__vizly_plugins.executeAIAction('hello-world', 'hello-greet', { name: 'Dev' }, ctx);
```

### 4.2 性能优化
当需要批量更新 100+ 节点时，请务必使用 `ctx.updateNodesBatch` 而非逐个调用 `setNodes`。这会将多个 React 渲染周期合并为一次，并只产生一个撤销历史节点。

---
*Vizly - 为开发者而生。*
