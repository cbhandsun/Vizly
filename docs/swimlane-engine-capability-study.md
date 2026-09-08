# 泳道引擎能力对照：停止无收益的替换

日期：2026-09-08。基准：`6e8bae1f`，本地 elkjs 0.12.0。本文记录实验，不代表新增生产能力。

## 行业能力与项目约束

[ELK partitioning](https://eclipse.dev/elk/reference/options/org-eclipse-elk-partitioning-activate.html)在流程轴上约束分区先后，不能直接用泳道编号代替阶段编号。[半交互排序](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-semiInteractive.html)保留层内次序；它不承诺不同层的同一泳道具有一致且互不重叠的边界。[分组排序](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-considerModelOrder-groupModelOrder-cmGroupOrderStrategy.html)也需要与节点坐标约束区分。

Vizly 已有全局排名、泳道坐标分配、层内重心排序和最终路由验收。不能把“尚未传某个 ELK 参数”直接判断成当前空白的根因。

## 匿名反例

固定六个节点：a/d 属于泳道 0，b/e 属于泳道 1，c/f 属于泳道 2。尺寸依次为 80×40、80×120、120×60、100×80、80×40、160×40。边为 a→f、b→e、c→d，要求全部向前且泳道依次排列。节点间距 48，层间距 80，随机种子 1，关闭独立分量分离；分别运行 RIGHT、DOWN。

| 配置 | 流程全部向前 | 全部层共享有序、互不重叠的泳道边界 |
| --- | --- | --- |
| 默认 layered | 两方向均通过 | 两方向均不满足 |
| partitioning，以泳道编号为 partition | 两方向均不满足 | 两方向均不满足 |
| 分组排序 ENFORCED，默认组 ID 1/2/6，NODES_AND_EDGES，forceNodeModelOrder | 两方向均通过 | 两方向均不满足 |
| semiInteractive，并传入位置 | 两方向均通过 | 两方向均不满足 |

显式把 `cmEnforcedGroupOrders` 作为字符串列表传入本地 JS 引擎时出现属性实例化异常。这是本次序列化形式的失败，不证明 Java ELK 或所有传参形式都不支持该能力。未尝试通过捕获并忽略错误接入生产。

结论只适用于这些明确配置和反例；不能据此声称 ELK 无法实现泳道。它说明应先补齐分区坐标契约，不能把层内排序当作完整泳道支持。

## 业务几何的限定替换实验

固定需求图已测量的节点尺寸、泳道归属和实际边。只用原生 ELK 替换全局阶段坐标，保留现有泳道坐标约束与阶段对齐；显式主流程边赋予方向优先级。两种结果都经完整 Worker 路由和现有质量度量。

| 方向/排名来源 | 总宽 | 总高 | 线长 | 拐点 | 交叉 | 主流程倒向 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| TB / 当前 Dagre | 3461 | 2568 | 10492.5 | 17 | 0 | 0 |
| TB / ELK | 3461 | 2565 | 10432.5 | 17 | 0 | 0 |
| LR / 当前 Dagre | 4810 | 2760 | 12052.5 | 16 | 0 | 0 |
| LR / ELK | 4812 | 2760 | 12012.8 | 16 | 0 | 0 |

四项硬质量均通过，但竖向高度仅减少约 0.12%，横向宽度略增。没有足够可见收益支持增加引擎调用和新的候选分支，因此停止推广。未扩展 WMS 或参数网格，也未将实验脚本加入生产路径。

本地复现记录：`tmp/elk-lane-capability.mjs/json/log`、`tmp/elk-ranked-lane-experiment.ts`、`tmp/elk-ranked-lane.test.mjs`、`tmp/elk-ranked-lane-results.json`、`tmp/elk-ranked-lane.log`。临时脚本不是 CI 门禁，实验通过不能代替产品验收。

## 下一项必须回答的问题

下一项应先明确阶段约束：显式主流程、数据关联、反馈和未知类型的边，哪些必须决定阶段先后，哪些仅影响路由。当前公共 Dagre 排名对所有连接赋予层级跨度；仅改排名引擎没有解决这个建模问题。不能直接删除非主流程依赖来获得更紧凑的截图。

先用匿名跨泳道合流、反馈及未知边类型夹具固定该契约，再做一个候选与当前结果的对照。必须保留边、泳道顺序和所有声明的先后约束；未知语义继续沿用既有行为。若同视口仍没有可见改善，则不接入产品。更大规模、嵌套、增量稳定性和性能尾延迟仍按原迭代计划验收，未因本研究而关闭。
