# Vizly Project Engineering Rules

你现在处于 **Debug / Production Engineering** 模式。

目标不是只让功能“看起来能跑”，而是持续交付：

- 行为正确
- 边界清晰
- 模块可测
- 类型可靠
- 渲染和日志安全
- 构建可复现
- 门禁可验证
- 变更可回滚
- 后续可维护

本文是 Vizly 仓库的项目级工程规则。能够通过脚本验证的要求，以仓库门禁结果为准；不要用文字承诺代替实际验证。

## 1. 工作方式

处理问题时遵循：

```text
复现 → 收集证据 → 定位根因 → 最小修复 → 回归测试 → 完整验证
```

- 修改前先检查工作区、相关模块、现有测试和项目脚本。
- 保留用户已有修改，不覆盖、不回滚、不静默提交无关文件。
- 优先修复根因，不通过增加延迟、重试、非空断言或吞掉异常掩盖问题。
- 禁止通过关闭规则、扩大 baseline、跳过测试或删除失败测试制造绿色结果。
- 临时缓解措施必须说明适用范围、风险和后续清理计划。
- 无法完整交付时，必须说明阻塞、已验证范围、剩余风险和下一步。

## 2. 架构与模块边界

### 2.1 Composition root

主入口只负责：

- 加载并校验配置
- 组装依赖
- 注册模块
- 启动应用
- 管理顶层生命周期

业务规则、协议转换、认证、请求解析、重试、审计、持久化和 UI 状态同步必须放入独立模块。

### 2.2 依赖方向

- `src/core/` 不得依赖 `src/app/`、`src/components/`、`src/context/`、`src/data/`、`src/pages/` 或 `src/services/`。
- `src/core/algorithms/`、`src/core/routing/`、`src/core/types/` 和 `src/core/ports/` 必须保持轻量，不得反向依赖组件、Hook、插件、Store、主题、策略、服务或 Worker 实现。
- `src/core/services/` 不得依赖组件、Hook、插件、Store 或主题实现。
- `src/core/index.ts` 必须保持轻量，不得把组件和插件实现扩散为 Core 公共 API。
- 禁止新增运行时循环依赖、跨层引用或绕过公共接口访问内部实现。
- Provider、Auth、协议、运行环境和能力差异必须显式建模，不要散落成隐式布尔判断。

所有架构修改必须运行：

```bash
npm run check:architecture
```

### 2.3 文件规模

仓库硬门禁：

- composition root：不超过 300 行
- React/TSX 组件：不超过 700 行
- 普通源码模块：不超过 800 行
- 测试文件：不超过 1000 行

单个 handler 达到 300 行时优先拆分，超过 500 行应视为强制重构信号。

拆分必须提取真正内聚的职责。禁止通过删除空行、压缩格式或提高 `scripts/source-size-baseline.json` 规避门禁。解决历史超限文件时，应同步降低 baseline，而不是维持已消除的债务。

## 3. 外部输入边界

任何外部输入都不能直接进入业务模型、持久化层或 UI。外部输入包括：

- 远程接口数据
- URL 参数和路由状态
- localStorage/sessionStorage
- 剪贴板
- 导入文件
- AI 输出
- 分享内容、模板和版本快照
- 用户输入
- Provider/Auth 配置
- 环境变量
- WebSocket 和 Worker 消息
- 第三方 SDK 返回值

必须经过明确的：

```text
parse → coerce → validate → sanitize
```

至少检查：

- `null`、`undefined`、空字符串
- 非法 JSON 和类型错误
- `NaN`、`Infinity`、负数、零值和超大数字
- 超长字符串、数组长度、对象深度
- body、响应和文件大小
- 端口范围
- 超时、取消和重试次数
- `Retry-After`
- 压缩 body
- 重复、乱序或过期消息
- Provider/Auth 差异
- 移动端和桌面端差异
- 失败和降级路径

边界解析器应独立、可测试，并返回明确的成功/失败结果。

## 4. 类型安全

- 禁止新增显式 `any`；外部未知输入使用 `unknown`。
- `unknown` 必须经过解析器、schema 或类型守卫后才能使用。
- 禁止用非空断言、双重断言或宽泛类型断言绕过真实边界。
- 优先使用判别联合、泛型约束和显式状态模型。
- 新类型错误必须修复，不得扩大类型 baseline。
- baseline 只能记录经明确审查的历史债务；已消除的债务必须从 baseline 移除。
- `@types/node` 应与项目 Node 运行时主版本保持一致。

类型门禁：

```bash
npm run typecheck
npm run typecheck:strict-core
npm run typecheck:ts6
npm run check:explicit-any
```

默认类型检查使用当前 TypeScript 7 工具链；`typecheck:ts6` 是迁移期兼容门禁，不得无理由删除。

## 5. 安全渲染

默认禁止 `dangerouslySetInnerHTML`。

确需渲染 HTML、Markdown 或 SVG 时：

- 上游必须经过集中、明确的 sanitizer。
- 变量和调用链必须体现已经消毒，例如 `safeHtml`、`safeSvgMarkup`。
- 优先复用项目现有的 HTML、Markdown 和 SVG 清洗工具。
- 新增 DOM/HTML sink 必须说明必要性并补 XSS、安全输入和绕过测试。

禁止：

```tsx
<style dangerouslySetInnerHTML={...} />
```

样式应使用 CSS、CSS 变量、`style` prop、`textContent` 或受控 className。

相关修改必须运行：

```bash
npm run check:dom-sinks
```

## 6. 日志与秘密保护

- 生产路径不得直接使用 `console.log` 输出业务调试信息。
- 默认使用 `safeLog`，实现位于 `src/core/utils/consoleCleanup`。
- 错误进入日志前必须使用项目现有的敏感信息清洗工具处理。
- URL、headers、token、API key、Bearer、secret、cookie、认证状态、用户内容、模板内容和 Provider 配置不得原样记录。
- 不记录完整请求体、响应体、导入内容、分享内容或运行时内部状态。
- `.env*`、密钥、认证缓存、调试产物和临时导出文件不得进入 Git。

涉及日志、安全或持久化的修改必须补充安全测试，并运行：

```bash
npm run check:secrets
```

## 7. React、状态与 Worker

- React 组件应负责渲染和交互编排，复杂业务规则提取为纯函数、Hook 或 service。
- 不要在 effect 中无条件同步写状态；避免由 effect 制造第二套派生状态。
- ref 只能在允许的生命周期中读取和写入，不得把可变 ref 当作渲染状态。
- 手工 memo 必须有明确收益，不要用 memo 掩盖不稳定依赖。
- Zustand/Yjs 状态边界必须明确区分本地 UI 状态、业务状态和协作状态。
- Worker 消息必须有显式协议类型和运行时校验。
- Worker 必须处理超时、取消、终止、过期响应和序列化失败。
- 重型布局、寻路和图形计算优先放入 Worker，避免阻塞主线程。

## 8. 测试要求

- 每个非平凡模块必须有测试。
- 每个 bug 修复必须补回归测试。
- 新边界逻辑至少覆盖正常、空、非法、极端、类型错误、安全输入和失败路径。
- Node、jsdom、Worker 和浏览器集成测试必须选择正确环境。
- 新增测试文件必须进入 `test:ci`，不能只存在于仓库。
- 新增 CI shard 必须加入 `scripts/lib/test-ci-shards.mjs` 并由 runner 实际调度。
- 重试只允许处理明确识别的基础设施瞬时故障，不得掩盖业务失败。

新增或移动测试后必须运行：

```bash
npm run check:test-ci-coverage
```

按范围选择验证入口：

```bash
npm run test:changed
npm run test:ci:node
npm run test:ci:fast
npm run test:ci
```

## 9. 测试效率

- 分析测试耗时时区分 transform、import、环境初始化、Worker 启动和测试执行时间。
- 避免为了逻辑分组而创建大量重复的 Vitest/jsdom 进程。
- 相同环境的测试优先共用进程；Node 和 jsdom 仍需隔离。
- Windows 下提高并发前必须验证内存竞争和 Worker 启动稳定性。
- 性能敏感 shard 可以独占执行。
- 修改测试编排时必须保留测试目录覆盖门禁，并比较修改前后的总时长和最慢 shard。

## 10. 依赖管理

项目运行环境：

```text
Node >=22.22.2 <23
npm  >=12 <13
packageManager: npm@12.0.1
```

- 直接使用的包必须声明为直接依赖，禁止依赖传递依赖偶然存在。
- 运行时依赖和开发依赖必须正确分类。
- 删除未使用依赖。
- 必须提交 `package-lock.json`。
- 依赖变更必须使用 npm 12 并通过干净安装验证：

```bash
npm ci
```

依赖升级按风险分批：安全补丁、构建工具、测试工具、UI/状态库、数据客户端、图形和布局引擎。每批独立执行类型检查、相关测试、生产构建和提交。

不兼容升级必须记录阻塞原因、暂缓版本和后续迁移计划。不得为了追求“全部最新”而忽略运行时、peer dependency 或类型兼容性。

## 11. 构建与性能

- 运行时依赖、Vite、React、图形库或布局引擎变更后必须执行生产构建。
- Three.js、ELK、Monaco、导出工具等大型依赖应按页面或功能动态加载。
- 检查动态导入是否生效，以及 preload 是否提前下载懒加载资源。
- 不得无审查地扩大 bundle 预算。
- 性能优化必须有修改前后测量，不以主观感受代替证据。

构建门禁：

```bash
npm run build
npm run check:bundle
```

## 12. 统一门禁

统一验证入口：

```bash
npm run verify
```

更完整的路由与移动端验证：

```bash
npm run verify:full
```

开发阶段可按风险使用：

```bash
npm run verify:changed
npm run verify:batch
npm run verify:quick
npm run verify:fast
```

提交前至少执行与改动风险匹配的门禁。涉及跨模块、依赖、架构或生产路径时，优先执行完整 `npm run verify`。

门禁失败时必须修复或明确记录真实债务。禁止：

- 提高 baseline 掩盖新增问题
- 关闭规则
- 添加无依据的 ignore
- 跳过失败测试
- 把失败测试移出 `test:ci`
- 仅在本地执行 CI 不会运行的脚本

## 13. Git 与交付

- 提交前检查工作区，只暂存当前任务范围内的文件。
- 工作区存在其他修改时，禁止默认执行 `git add -A`。
- 变更按风险和职责分批提交，每个提交应可验证、可回滚。
- 依赖升级、架构调整和大规模重构使用独立分支和 PR。
- 禁止使用 `git reset --hard`、`git checkout --` 等命令覆盖用户修改，除非用户明确授权。

PR/MR 应说明：

- 修改内容和原因
- 用户与工程影响
- Bug 根因或关键设计决策
- 执行过的验证
- 已知遗留项
- 必要时的回滚方式

进入主分支后应确认远端包含目标提交、本地主分支已同步、CI 已触发且失败项可追踪。

## 14. 完成标准

任务只有在以下条件满足后才算完成：

- 行为正确且根因明确
- 输入边界完整
- 类型和架构门禁通过
- 渲染和日志安全
- 新逻辑有测试
- 回归测试进入 CI
- 生产构建和 bundle 门禁通过
- 依赖安装可复现
- 变更范围清晰且可追溯
- 未通过放宽规则掩盖新债务
- 遗留问题已明确说明并给出处理顺序

如果无法达到完整完成标准，最终交付必须列出：

- 未完成项
- 阻塞原因
- 已验证范围
- 风险影响
- 推荐的下一步
