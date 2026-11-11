# CI 平台策略：linux-macos-v1

本仓库的日常 devfleet-native.yaml 在 push / pull_request / workflow_dispatch 执行 Linux 和 macOS 的全部原生检查，native-complete 强制两者成功。集成、安全、浏览器、Core 额外质量与 Mac 宿主性能门禁保持独立且未删减。日常通过不代表 Windows 已验证。

App 不再有默认 Windows 全量 job。Core 另有仅 workflow_dispatch 的 devfleet-windows-compat.yaml，执行原有完整 Core Windows 检查，收据 scope=windows-compatibility / native_policy=core-windows-compat-v1。它不属于日常 native-complete，也不能替代 Linux 或 Mac 发布证据。

Windows Runner 平常停用但保留注册、目录和原任务。需要 Core Windows 检查时，由授权操作员先在 Gitea 重新启用保留的 Core runner，并通过 Windows 任务计划程序启用、运行 DevFleet-Vizly-core-Windows；然后显式触发手动工作流。等待该检查完成后，再通过 DevFoundry 的受控退役流程关闭接单、核对空闲、退出实例并禁用登录任务。不要启用 App Windows runner，不要重新注册或复制 token，不要在构建中停止任务。没有新建自动唤醒或守护机制。

新发布证据使用 vizly-release-v2 / vizly-gitea-native-v2，并显式记录 nativePolicy=linux-macos-v1；每个原生结果保留源提交、tree、lock、实际 OS、固定运行时和所有检查结果。旧 v1 证据仍按三系统规则验证，不能通过改标签或删除 Windows 结果冒充新策略。

当前分支与默认 main 都必须迁移后才能退役常驻 Windows runner。历史分支不改写；若继续从旧分支开发，先合入这次 CI 策略再推送，避免生成无人接收的旧 Windows 任务。保留原失败记录，不取消旧构建，不因修改平台策略绕过产品失败。
