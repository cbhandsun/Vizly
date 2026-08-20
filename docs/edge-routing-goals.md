# 连线质量目标体系

本标准把连线质量分成四层：**几何正确性、视觉可读性、交互可追踪性、多尺度/导出一致性**。`hardClean=true` 只代表第一层通过；只有四层都达到对应门禁，才可称为商业级连线。视觉与交互问题不得混入几何硬错误，但也不能因几何全绿而静默忽略。

术语必须保持单义：**dual-trunk edge（双主干边）** 专指同一条业务边同时属于 source trunk 与 target trunk 的情况；**crossing bridge / line-hop（交叉跳线）** 只专指两条无拓扑连接关系的可见线在不可避免交叉处使用的 jump/gap 渲染语法。不得再用 `bridge edge` 表示双主干身份，也不得把交叉跳线写回真实路径拓扑。

## 🔴 硬约束（必须满足）

1. **正交性** — 所有线段必须水平或垂直，不允许对角线/斜线
2. **端点正交进出节点** — 连线离开 source 节点的第一段、进入 target 节点的最后一段必须垂直于对应节点边界，并沿端口声明方向延伸；例如 Right 端口第一段向右、Bottom 端口第一段向下、Top 入口从上方垂直接入。不能出现从节点边缘斜出、贴边横滑后再转向、或从错误侧“蹭入”节点的最终路径。方向正确但首段/尾段过短也不能静默视为合格，因为水平/垂直段会贴着节点边缘形成视觉误连
3. **节点避障** — 线不能穿过真实节点，必须绕行；泳道/分组容器可作为视觉边界处理，但不应被当作普通节点硬障碍误判
4. **共享主干不可破坏，但必须先按端口侧和目标扇区分组** — 1-to-N / N-to-1 的 bus 边只能在端口侧兼容、目标/来源处于同一方向扇区、且共享不会制造反向首段或可消除端点肘弯时共享锚点和主干。不能仅因同源/同目标就把 left、right、top、bottom 扇区强行并入同一 trunk；分组完成后，组内主干才属于不可破坏结构
5. **dual-trunk edge 必须同时保真** — 一条边可能同时属于一对多和多对一，例如中继边既从上游 source trunk 分出，又汇入下游 target trunk；修复时必须同时保留两个 buddy 身份，不能让一个身份覆盖另一个身份
6. **修复不可反弹硬约束** — 交叉修复可以临时尝试更长或更外侧的通道，但最终结果必须再次满足正交、端点正交进出、节点避障、共享主干；不能出现“少交叉了但斜着进节点”“避障了又新增硬交叉”或“压平小拐弯后破坏端口方向”的最终状态
7. **端点必须真实附着节点边界** — 首尾点不仅要方向正确，还必须落在当前实测节点矩形的合法边界上。旧布局坐标、远端悬空点、只靠视觉延长线“看起来接上”都不得通过最终门禁；重新附着后必须重新检查交叉、避障和 stub，不能直接拉长原段造成飞线或穿线
8. **相反流向同侧冲突必须分区** — 同一节点同一侧同时承载反馈入边和业务出边时，如果两者形成反向重叠、端口墙或不可读穿插，应按 `flowRole` 分侧或分区。允许的弱/free 端口优先把入边移到相对侧并复用多对一入干；显式 strong/fixed/forbidden 约束不得被覆盖

## 🟡 软约束（平衡优化）

1. **端口方向合理且必须参与候选选择** — 出发方向应该朝着目标的主导方位，不该向右出发去到左边的目标。不能先固定 handle 再只修中段；当端口不是显式 strong/fixed 约束时，必须比较相邻 source/target side 候选，并把端点弯折、方向一致性、路径长度、交叉、避障和 bus 扇区一起评分
2. **少交叉** — 线与线之间的交叉尽量少；普通交叉优先消除，buddy 内部的重叠主干不算交叉，buddy 间的垂直穿插仍然是缺陷
3. **最短路径** — 在满足以上约束的前提下，连线尽量短，不走冤枉路；允许为了避障、共享主干和消除交叉走外侧通道
4. **同侧出入分离** — 节点同一侧同时有入边和出边时，入端口和出端口要分区放置，不能混在一起
5. **端口顺序合理** — 同一侧多条出边的端口排列顺序应该与目标节点的空间位置一致，避免不必要的交叉
6. **微小偏移消除** — 两个几乎对齐的节点间连线不应出现肉眼可见的 S 弯
7. **局部小拐弯消除** — 连续短距离 dogleg、小阶梯、局部 S 弯应被合并到更少、更稳定的拐点；尤其是节点旁、bus 分叉/汇聚点、容器边界附近，不应因为几像素到几十像素的绕行产生肉眼可见的小凸起
8. **全图上下文一致** — 后处理、避障、交叉修复应使用当前真实路径上下文，包括 bus 边和上一轮已计算路径，不能只依赖非 bus 缓存
9. **局部直连优先** — 近距离、近似同轴的父子链路不应为了消除一次轻微线线交叉而产生巨大绕行；当直连不穿真实节点、长度明显更短且交叉点远离节点/标签时，可接受有限交叉并输出解释
10. **锁定路径仍需质量门** — 布局器输出的 `computedPath` / locked path 可以保留端口和主干意图，但不能跳过最终 SVG 几何质量检查；如果真实渲染路径出现端点短 stub、贴边、穿真实节点或无意义小拐点，渲染层仍应做局部修复

## 🟢 美观性

1. **主干共享（视觉整洁）** — 从同一个 hub 出发的多条边应该共享主干段，在分叉点才分开，形成清晰的树状结构
2. **走廊通道对齐** — 平行的线尽量走在统一的通道上，不散乱
3. **外侧绕行可读** — 当内侧通道会造成穿节点或交叉时，优先选择稳定、可读的外侧通道；不要为了短路径挤进拥挤区域

## 🟨 最少交叉专项标准

这些标准用于约束“尽可能少交叉”的具体含义。目标不是机械地让所有边走最短路，也不是把所有同源/同目标边都合并，而是在保证正交、节点避障、端点方向和共享主干语义的前提下，让流向最容易读。

1. **普通边交叉优先消除** — 非 buddy 边之间的严格交叉默认视为高优先级缺陷。候选路径评分时，减少一个普通硬交叉应优先于减少少量路径长度或弯折数。
2. **共享主干不是任意共享段** — O2M/M2O 允许共享的 overlap 只能发生在明确的 source/target 主干或显式 bus trunk 上。远离共同端点的中间重叠、无关边共线、或同源/同目标但没有 trunk 语义的共享段，都应按视觉缺陷处理。
3. **一对多/多对一按 bus group 路由** — fan-out/fan-in 不应被完全拆成多条独立边各自寻路。应先为整组选择 trunk lane，再按 target/source 的投影顺序布置 tap/junction，最后生成各分支。
4. **tap/junction 顺序必须减少穿插** — 同一条 bus 上的分叉/汇聚点应按目标或来源在主干垂直方向上的空间顺序排列。若分支为了到达目标需要穿过同组主干或同组分支，优先重选 trunk lane 或 junction 顺序。
5. **双主干边保持两端语义但中段可动** — 同一条边同时属于 O2M 和 M2O 时，它是 dual-trunk edge。修复时必须保持源端/目标端点和出入方向，但中间 corridor 允许为减少交叉、避免中段共享、让开无关边而移动；不能因为 dual-trunk 双角色把整条边两端都锁死。
6. **交叉点位置也要评分** — 无法消除的交叉应远离节点边界、端口 stub、标签、bus junction 和短 dogleg。交叉发生在节点旁、箭头入口旁或主干分叉点附近，比远离业务对象的直角交叉更难读，应提高风险级别。只要交点仍落在两条可见笔画的有效内部，即使距某个 bend 仅 `0.5-1px` 也必须算严格交叉；只有交点精确落在真实线段端点/junction 并有拓扑语义时才能豁免，不能用过大的几何 EPS 把“看似误接”静默抹掉。
7. **buddy 内部穿插仍是缺陷** — 同一 buddy group 内的垂直穿插不是允许共享主干。只有共线、同向、靠近共同端点且被识别为 trunk 的 overlap 才能豁免；分支之间互相穿过应尝试合并 junction、借用同组后缀或重排 tap。
8. **先换拓扑，再做 nudging** — 对 bus 交叉问题，优先通过 trunk lane、junction 顺序、共享后缀/前缀修复拓扑；nudging 只用于分离可辨间距，不应作为修复错误 bus 拓扑的主要手段。
9. **短直链路可接受可解释交叉** — 当消除一个远离节点和标签的交叉会制造巨大绕行、多个短 dogleg 或破坏共享主干时，可以保留该交叉，但必须输出原因链并降为 `info`/低风险 `warning`，不能静默通过。

## 🟦 视觉软约束检查项（应报警/打分，不一定阻断）

这些问题通常不会违反硬几何约束，因此不能只靠“正交、穿节点、严格交叉”检查发现。它们应作为视觉风险输出，供评分器、调试面板或人工验收使用。

1. **容器视觉边界穿越** — 线可以穿过 group/subGroup/titleGroup/swimlane 的内部区域，但不应无意义地横穿容器标题栏、容器边框、相邻子域分隔线，尤其是跨越不属于 source/target 的子域。  
   - 检查信号：线段与容器矩形相交，但 source/target 均不在该容器内；或线段沿容器标题栏/边框附近长距离贴行。
   - 示例：`pool-a-entry -> calc-real-ratio` 的汇聚线向上绕行时穿过“初分逻辑/库存修正”视觉区域，硬检查可通过，但视觉上像走错区域。

2. **业务节点近距擦边** — 不穿节点也可能读起来像贴着节点边缘或标签。  
   - 建议分级：`0px` 为边界接触，`0-12px` 为高风险近距，`12-28px` 为中风险近距，`28px+` 通常可接受。
   - 检查时应排除 source/target 节点自身，但不要排除路径经过的无关业务节点。

3. **无关节点走廊挤占** — 线段从两个无关节点之间很窄的缝隙穿过，虽然没有命中矩形，但会造成“像连到了旁边节点”的误读。  
   - 检查信号：同一线段两侧各有一个无关节点，通道宽度小于推荐安全走廊（如 32-40px）。

4. **过度绕行 / 绕远比异常** — 在没有硬障碍或共享主干理由时，路径长度不应明显大于曼哈顿距离。  
   - 建议阈值：`pathLength / manhattanDistance > 1.8` 标记为风险，`> 2.5` 标记为严重风险。
   - 例外：为避障、消除交叉、保留 O2M/M2O 主干而走外侧通道时可降权，但仍应说明原因。

5. **紧凑对齐链被过度避让** — source/target 几乎同轴且距离较短时，应优先检查直连或极短折线路径。  
   - 检查信号：端点横向/纵向偏差小于 1px，端点曼哈顿距离小于 260px，当前路径长度超过直连长度 2.2 倍，且横向绕行跨度超过 80px。
   - 建议处理：如果直连不穿真实节点，且只新增不超过 1 个严格交叉，应优先使用直连并把该交叉记录为 `info` 或低风险 `warning`；否则会出现为了避免轻微交叉而制造更明显视觉噪声的问题。
   - 示例：`merge-res -> alloc-mixed` 这类上下父子链路，直连比左侧大绕行更符合阅读预期。

6. **反向首段 / 目标背离** — 首段不应明显背离目标方向，除非有明确的避障或共享主干理由。  
   - 检查信号：source 到 target 的主方向与第一段方向相反，且首段长度超过 40px。
   - 例外：反向反馈边、需要外侧绕行的边、显式 bus trunk 边。

7. **方向单调性破坏** — 行业布局器通常会把 monotonic path restriction 作为重要质量项：从 source 到 target 的主方向上，路径不应反复前进又后退。  
   - 检查信号：水平主导边在 x 方向出现多次符号翻转，或垂直主导边在 y 方向出现多次符号翻转。
   - 建议分级：1 次轻微回退为 warning，多次回退或回退长度超过主方向距离的 25% 为 high risk。
   - 例外：明确外侧绕行、共享主干接入、避开硬障碍。

8. **无意义折返 / U 形回头** — 短距离内出现先远离再返回的 U 形或 S 形，即使正交也影响可读性。  
   - 检查信号：连续三段的首尾段反向且中间跨接段小于 `140px`；其中小于 `24px` 属于严重微折返，或回头后重新占用同一走廊。
   - 建议处理：先尝试折叠回头；若折叠会新增交叉或错误 overlap，则沿既有外侧方向把跨接段扩到可读阈值，并保持端点、handle 和后续主干轴不变。候选仍必须通过全图质量与障碍门禁。
   - 小拐弯场景：节点边缘、共享主干分叉/汇聚点、容器边界附近出现很短的 H-V-H 或 V-H-V 小凸起；如果不穿真实节点、不破坏端口方向、不拆散 bus 主干，应优先压平或移到一条干净中轴。

9. **标签/路径冲突** — 路径不应穿过边标签、节点标签或关键说明文字；标签也不应贴在线段拐角上。  
   - 检查信号：线段与 label rect 相交，或 label rect 到路径距离小于 8px。

10. **箭头入口几何不清** — 进入目标节点前的最后一段应从几何上清晰的一侧进入，并留有足够直线段。  
   - 检查信号：最后一段长度小于 `minLastSegment`，入口侧与整体来向明显冲突，或最后一段未垂直于目标节点边界。
   - 尺寸感知：`minLastSegment` 不应只是固定像素值；普通业务节点建议按节点短边计算，例如 `max(48px, min(96px, shortSide * 0.75))`。这样可识别“方向已垂直但入射段只有几十像素、水平段仍贴着节点上沿”的问题，同时避免小节点被过度拉远。

11. **端口候选/端口约束违规** — 行业布局器通常支持 port candidates / port constraints；边应优先使用节点允许的侧边、锚点和出入方向。  
    - 检查信号：边从未授权侧进入/离开节点；同侧端口拥挤时未做分区；端口顺序与目标空间顺序明显相反。
    - 建议输出：记录 `expectedSide`、`actualSide`、`portOffset`、`sideCongestion`。

12. **边-边间距不足** — 平行边不应过近，除非它们属于同一个允许的共享主干。  
    - 检查信号：两条非 buddy 平行线段之间距离小于 8-12px，且重叠投影长度超过 24px。
    - 建议分级：`< 6px` 为高风险，`6-12px` 为中风险。

13. **节点角点擦边** — 线段即使没有穿过节点，也不应贴近节点圆角/角点穿过，容易被误读为命中节点。  
    - 检查信号：线段到无关节点角点距离小于 12px，或从节点角附近 45 度视觉方向擦过。
    - 说明：这是 `业务节点近距擦边` 的细分，重点捕捉角点附近的视觉误判。

14. **交叉角度过小** — 无法消除的交叉也应尽量接近直角；小角度交叉会显著降低可读性。  
    - 检查信号：两条线段交叉角小于 45 度。正交图中普通线段理论上应为 90 度，若出现小角度通常意味着渲染路径、曲线圆角或非正交残留有问题。

15. **弯折复杂度过高** — 在相近长度和避障质量下，应优先选择弯折更少、更稳定的路径。  
    - 检查信号：bend count 超过 6；或相邻弯折间距小于 16px；或同一路径出现多个连续小阶梯；或单个局部 dogleg 的横向/纵向深度小于 24-40px 且可被等价正交路径替代。
    - 例外：复杂区域的外侧绕行可以放宽，但应在 `reason` 中说明。

16. **通道容量过载** — 统一通道能提升整洁度，但过多无关边挤在同一通道会形成视觉黑带。  
    - 检查信号：同一 corridor 内非 buddy 平行线数量超过容量阈值，或线间距低于最小 nudging gap。
    - 建议输出：`corridorId`、`edgeCount`、`minGap`、`allowedCapacity`。

17. **增量稳定性/心理地图破坏** — 小改动不应导致大量无关边跳到另一侧通道。  
    - 检查信号：输入节点/边变化很小，但超过 20% 的既有边发生端口侧变化、主通道变化或路径长度大幅波动。
    - 用途：作为自动布局和拖拽后的质量回归指标，不一定用于单次静态截图阻断。

18. **共享主干误放行** — 同源或同目标 overlap 不应一律视为合格。只有靠近共同 source/target 或明确 bus trunk 的重叠才算允许共享主干。  
   - 检查信号：两条边同源/同目标，但重叠段远离共同端点，且没有 treeRouting/bus buddy 标记。

19. **容器层级穿越过深** — 边可以穿越容器内部，但应避免在无关容器内部长距离穿行或连续穿越多层容器边界。
    - 检查信号：路径在无关容器内部累计长度超过 80px，或穿越无关容器数量超过 1。

20. **远侧主干绕行** — 共享主干不应被机械套用到 source/target 的远侧，导致边先远离目标、绕到外侧再折回。  
    - 检查信号：端口对本来支持直接或近侧接入，但共享主干轴位于 source/target 连线主方向的反侧，且路径长度、弯折数或回退距离明显增加。
    - 建议处理：当远侧 trunk 只会制造大绕行而不是减少穿节点/交叉时，应保留原端口方向并跳过该 trunk；跳过时仍需保护其他 buddy 身份和端点正交。

21. **交互态路径污染** — 选中一条边、打开调试器、hover 或显示视觉高亮时，不应让无关边重新选择端口、重算主通道或改变 SVG path。  
    - 检查信号：图数据未变，仅 selection/debug state 改变，却出现多条无关边路径 diff、缓存 key 变化或 routing metadata 变化。
    - 建议处理：路径缓存、局部修复和调试覆盖层必须按 edge 实例隔离；共享 path 数据需要不可变复制，避免选中态写回全局路径上下文。

22. **交互端点与最终路径脱节** — 选中态端点圆点、拖拽热区、调试高亮等视觉控制层必须以最终 SVG path 的首尾点为准，不能继续使用 worker 原始点、React Flow 默认 `sourceX/sourceY` 或过期 `computedPath` 端点。
    - 检查信号：主 path 已经被渲染层修复到节点正确侧边，但选中圆点/热区仍落在节点中心、旧端口或另一侧，导致用户误以为线从错误位置绕行。
    - 建议处理：最终 path 是唯一视觉真相；交互层读取 path 端点时要支持圆角 arc、严格正交 path 和缓存路径，并随缓存版本统一失效。

23. **主轴/象限端口偏好** — source/target 中心位移应先归一化，再决定首选端口侧。若 `abs(dx) / max(abs(dy), sourceShortSide) >= 1.4`，优先 left/right；垂直方向同理。阈值附近允许按拥挤度、交叉和稳定性选择，明显主导时不得被普通 bottom/top bus 静默覆盖。
    - 建议输出：`horizontalDominance`、`verticalDominance`、`preferredSourceSide`、`preferredTargetSide`。

24. **可消除端点肘弯** — 若切换到相邻端口侧可以减少至少一个 bend，且不新增非正交、节点命中、严格交叉、错误 overlap，也不让路径长度增加超过 10%-15%，则默认接受该侧切换。
    - 典型形态：从 bottom 先向下，紧接着长距离向左；若 source 已位于左下角附近，应比较 left 直接出发候选，而不是保留 `down -> left` 的多余肘弯。
    - 该规则优先于少量路径长度差，低于显式 strong/fixed 端口和硬避障。

25. **节点角点端口消歧** — 端点距角点小于 12-16px 时，几何上可能同时属于两条边界，必须结合 handle policy、目标主轴和第一条有效长段确定实际 side。
    - free/weak 端口不应默认落在精确角点；优先使用带 12-16px inset 的同侧 anchor，或声明 `fixedRatio` / `fixedPosition`。
    - 若最终第一段沿 left 离开，则 source side 必须同步为 left，不能 metadata 仍写 bottom。

26. **bus 扇区错误合并** — 同源/同目标边在不同象限时，不应仅凭 buddy 身份共享同一端口和首段。建议先按 `side + directionSector + flowRole` 分组，再在组内计算 trunk。
    - 若共享导致主方向回退、端点 bend 增加、路径长度增加超过 15%，或出现角点肘弯，应拆成独立 sector bus。
    - dual-trunk edge 仍可同时属于两个 bus，但每个身份必须带独立的 side/sector 信息。

## 🟧 行业通用非语义约束补充

这些规则来自正交/分层图布局器的通用实践，先按视觉和几何质量落地，不引入业务语义判断。

1. **层级/容器感知 routing** — 容器不是硬障碍，但应参与评分：穿越容器边界、标题栏、子容器分隔线要有成本；跨越层级越深成本越高。
2. **Port candidates / port constraints** — 每个节点应能声明允许的入/出侧和优先端口；评分器应区分“可用但不优先”和“禁止”。
3. **Minimum distance** — 分别维护 edge-node、edge-edge、edge-label、node-corner 的最小距离，不用一个统一 clearance 覆盖所有对象。
4. **Crossing minimization + crossing angle** — 先减少交叉数量；无法消除时提高交叉角度，并确保交叉点远离节点、标签和拐角。
5. **Bend minimization** — 同等条件下减少弯折数、连续小阶梯和短折返；弯折成本应低于硬约束成本，高于轻微路径长度成本。
6. **Nudging / channel spacing** — 平行线进入同一走廊后需要做均匀拨线，确保最小 gap；允许 bus buddy 合并，非 buddy 必须保持可辨间距。
7. **Label-aware routing** — 边标签应作为软障碍参与路径评分，优先移动标签，其次调整局部路径；不要让标签压在线段或拐角上。
8. **Incremental stability** — 拖拽、局部增删节点后，未受影响边应尽量保持原端口、主通道和弯折结构，降低心理地图破坏。
9. **Path explainability** — 对每个高风险或看似绕远的路径输出原因：避障、消交叉、保留共享主干、容器成本、端口限制或通道容量。
10. **Local readability over global neatness** — 对短距离父子链路，局部可读性优先于全局交叉数最小化；当绕行本身比一个远离节点的正交交叉更刺眼时，评分器应允许“少量可解释交叉”。

## 🟪 行业对齐增强项

这些是从成熟正交路由器能力抽象出的工程要求，用于把上面的目标落到可配置、可评分、可回归的实现上。

1. **端口约束分级** — 端口约束应区分 `strong`、`weak`、`forbidden`。强约束必须满足；弱约束可为避障、共享主干或硬交叉让路，但必须记录降级原因；禁止端口不能被自动路由使用。
2. **端口候选模型** — 节点侧应声明可用 port candidates，边侧应声明期望 source/target candidates。候选至少包含 `side`、`anchor`、`priority`、`fixed/free`、`in/out/both`，并支持同侧多端口排序。
3. **边级 routing profile** — 每条边可声明独立 profile：`routingStyle`、`sourcePortPolicy`、`targetPortPolicy`、`monotonicAxis`、`minFirstSegment`、`minLastSegment`、`minimumNodeToEdgeDistance`、`minimumEdgeDistance`、`labelPolicy`、`groupId`、`incrementalPolicy`。默认 profile 只兜底，不能覆盖显式边约束。
4. **主方向单调限制可配置** — 对层级/树状/流程图，默认启用主方向 monotonic restriction；如果为了避障或共享主干必须回退，应限制回退次数和回退距离，并把原因写入检查输出。
5. **增量路由策略** — 拖拽、折叠、局部新增时，路由器应支持 `keep`、`path-as-needed`、`segments-as-needed`、`reroute` 四类范围策略；未受影响且仍满足硬约束的边不应无故换端口或换主通道。
6. **标签感知路由** — 节点标签、边标签、固定边标签都应作为软障碍进入评分；优先调整标签位置，其次局部调整路径，最后才大范围重路由。
7. **分项间距模型** — 不使用单一 clearance 统管所有对象，应分别维护 edge-node、edge-edge、edge-label、label-node、node-corner、port-port、container-boundary、between-layer spacing。
8. **网格与走廊约束** — 正交段应优先吸附到稳定 grid/corridor；同一走廊内需要容量和最小间距检查。bus buddy 可共享主干，非 buddy 必须保持可辨 gap。
9. **分组/容器边界路由** — group/subGroup/swimlane/titleGroup 不是普通硬障碍，但跨层级、穿标题栏、贴边长距离行走都应有成本；跨容器边界的 entry/exit 点应稳定且可解释。
10. **不要把 ortho 当作完整质量保证** — “正交折线”只说明线段水平/垂直，不代表端口、标签、容器、节点间距都正确。最终必须以真实渲染点检查端点进出、标签碰撞、容器穿越和软约束风险。
11. **Computed path 不是免检路径** — 外部布局器或 domain-aware 布局生成的路径只能作为候选或锁定意图，最终仍要通过端点长度、真实节点避障、容器视觉成本和小拐点压平检查；锁定的是语义意图，不是跳过质量门。
12. **端口侧是拓扑变量，不是渲染属性** — source/target side、同侧 anchor ratio 和首段方向必须在路径候选阶段共同选择；渲染层只能做有质量门禁的局部 correction，不能用错误 handle 包装一条看似连上的路径。
13. **端口候选采用分层剪枝** — 不必对所有边暴力枚举 16 个 side pair。先用显式约束和主轴/象限保留每端 1-2 个候选，再比较最多 4 个 pair；只有候选接近或硬门禁失败时才扩展搜索。
14. **端点弯折成本高于普通中段弯折** — 节点旁的第一个/最后一个 bend 比远离节点的普通 bend 更影响流向识别。评分器应单独维护 `endpointBendPenalty`、`cornerAmbiguityPenalty`、`portDirectionPenalty`，不能只统计总 bend count。
15. **端口移动后局部正交修正** — 当只改变 source/target candidate 时，优先在端点附近 2-3 段或一个有界窗口内正交重连，保留中间 corridor、标签位置和另一端 bus；局部候选失败才触发全边或全组重路由。
16. **端口侧切换稳定性** — 当两个 side candidate 分数接近时保留原 side；只有新候选显著更优或原候选违反质量门时切换，避免拖拽或测量微变导致端口在相邻侧之间抖动。
17. **端口顺序修复是拓扑协商，不是坐标交换** — 顺序门禁只比较最终仍位于同一侧、同一 flow-role 分区内的边。若直接交换两个 anchor 会新增严格交叉、穿障、错误 overlap、短 stub 或拆散合法主干，必须拒绝该交换，并为 `free/weak` 边有界枚举相邻侧与局部正交重连候选；通过完整 hard gate 后，允许把弱约束支路移出拥挤侧。不得为了满足一份预设顺序，强迫原本应分侧的所有边继续挤在同一侧；`strong/fixed/forbidden` 和人工 exact handle 仍不可改写。
18. **源端与目标端主干分别识别、联合提交** — 同一轮候选应分别按 source/target 角色识别真实公共前缀和后缀；一条 dual-trunk edge 可以同时参与两端 canonical trunk。对几何兼容但末端 lane 尚未对齐的 fan-in，可在不改变另一端身份的前提下有界对齐 terminal stem；只有 source/target 两套 membership、隐藏区间、canonical backbone 与最终路径同时通过原子校验后才可提交，不能先隐藏成员线再等待后续补画主干。
19. **多边交叉搜索必须“先多样性、后深度”并有硬预算** — 候选生成不能先为一个端口/锚点组合穷举数万条走廊，再把绝大多数丢弃。应先覆盖每个合法 side pair，并按当前点、中心点、两侧锚点对 source/target 组合做轮转采样，再逐步深入 corridor；局部候选数、单 side-pair 深度、beam width、search depth 和全图质量评估次数都必须有确定性上限。达到预算时保留当前硬门禁最优解并输出聚合诊断，不得因预算耗尽提交穿节点、非正交或未附着结果。
20. **商业绕行修复允许有界多边原子事务** — 当一条过长边的直接捷径只因穿过一条可移动的 `free/weak` 阻挡边而失败时，不能把巨大外绕当作唯一安全解。应同时枚举“主边缩短 + 阻挡边换侧/换 lane”的二边或小簇事务，并在一次提交前验证节点避障、严格交叉、端口方向/附着、短 stub、合法 source/target trunk 和总长度。任何一项回归都整组回滚；`strong/fixed/forbidden` 端点不得作为可移动 blocker。
21. **主干换侧必须联动处理分支阻挡** — 主干候选改端口或换走廊后，如果只把原交叉转移到同组/邻近分支，或让该分支穿节点、贴边、产生微 dogleg，则单边候选不得提交。应把“主干换侧 + 可移动阻挡分支移到外侧车道”作为同一有界事务评分；最终事务必须同时达到零新增节点命中、零新增严格交叉、零新增错误 overlap，并分别保留 source trunk、target trunk 及 dual-trunk edge 的两端 membership。允许事务内部的中间种子暂时多一个交叉，但中间种子永远不能单独成为最终结果。
22. **每条逻辑边只保留一条命中热区** — semantic paint、canonical backbone、junction、contrast underlay 和 marker-only carrier 都属于绘制层，必须 `pointer-events: none` 且不得各自生成 React Flow interaction path。每条逻辑边只保留一条覆盖最终完整 path 的透明命中热区；共享主干成员仍各自保留一条成员级热区和可访问名称。DOM/导出验收应分别统计 `visiblePaintPathCount` 与 `interactionPathCount`，禁止通过重复透明宽线扩大 DOM、命中竞争和缩放重绘成本。
23. **节点移动后的冻结分支必须重新做分层安全距离筛查** — 增量闭包中的 `contextEdgeIds` 只能作为优先提示，不能当作完整避障边界；一条原本无拓扑关系的冻结分支可能在节点移动后首次进入 `48px` 商业安全区。每次节点移动都应对冻结边与 changed business nodes 做有界几何筛查，把确有穿透或安全距离不足的分支提升到同一增量事务，并先尝试恢复 `48px` 商业间距。若端口/交叉硬门禁证明不存在安全的 `48px` 局部候选，小幅拖动可保留不低于 `16px` 的硬安全间距和原心理地图；不得为了软间距触发整图换道跳转。低于 `16px`、真实节点命中或提升数量超预算仍必须回退完整路由，并保持未提升边引用不变。
24. **预编译路线发布必须形成版本化闭环** — 改动任何影响路线、端口、质量门禁或渲染载体的源码后，必须提升 routing cache version，并按“生产构建用于捕获 → 强制 full-route 生成 artifact/manifest → 再次生产构建纳入新 artifact → reproducibility/browser audit”顺序发布。manifest 必须绑定 routing source hash，运行时旧版本的 IndexedDB/local cache 必须自然失效；正常首屏只能出现一个可见 route fingerprint，禁止先画 seed、数秒后再跳到预编译/最终路线。
25. **真主干资格只能在完整安全事务中固化** — `source trunk`/`target trunk` 不是看到近似公共前缀或后缀就立即建立的锁。若基线仍有节点命中、严格交叉、端点脱离、非正交或硬微折返，主干合成候选只有在本次提交同时把全部硬缺陷清零时才可成为新的 preservation contract；仍不安全的中间候选不得提前增加 trunk membership。随后进行主干换侧、分支避障或正逆向协商时，应只保护进入事务前已经成立的真主干，并在提交后分别复核 source/target 两端 membership 和 stem 长度，避免“为了保护伪主干而拒绝唯一安全路径”。

## 🟫 商业级感知与多尺度质量

这些规则补足“几何正确但仍不像成熟商业工具”的差距。它们不改变 source/target、端口、主干或路径拓扑，主要约束最终呈现、交互反馈和不同缩放档位下的可辨识度。

1. **默认态连线必须按最终像素可感知** — 承载流程含义的线、箭头和 junction 属于理解图表所必需的图形对象，必须在实际主题、透明度和相邻背景上保持足够对比。不能依赖 hover/选中后才看得清，也不能用更大的透明点击热区代替可见笔画。分析式计算必须先合成 stroke/fill 的 RGBA、`stroke-opacity`/`fill-opacity`、element `opacity` 和全部祖先/group opacity，再与每个最不利相邻背景做 alpha compositing；验收值是最终屏幕像素，而不是 authored color 或单个 computed-style 字段。必要连线默认态的 `edgeStrokeContrast` 不低于 `3:1`；箭头/方向 marker 还要分别输出 `markerFillContrast`、`markerBoundaryContrast` 和 `markerTipVisiblePixels`，不能拿线身合格替代 marker 合格。对影响颜色或覆盖率的 `filter`、`mask`、`clip-path`、`mix-blend-mode` 和 backdrop/blend 效果，必要连线默认禁止使用；确需使用时必须在每个主题、缩放档和导出目标上做最终 raster pixel sampling，并以采样的最差像素结果进入门禁。
2. **线宽采用屏幕空间下限** — fit-all、常用编辑缩放和高倍缩放下都要保持稳定笔画，不得随画布缩小成亚像素灰线，也不得放大成遮挡节点的粗带。可以使用 `vector-effect: non-scaling-stroke` 或等价的缩放补偿；验收看最终屏幕像素，而不是只看模型坐标中的 `strokeWidth`。
3. **共享主干是 group-owned 一级视觉对象** — 已判定合法的 source/target trunk 应以一条稳定 backbone 呈现，分支在明确 junction/tap 处分离或汇入。不得仅靠多条成员边重复叠画同一段来“变深”，否则透明度、抗锯齿、hover 和导出结果会随成员数变化。主干资格由共同端点、角色、端口侧/扇区和真实公共 stem 决定，不能因成员边颜色、虚实或线宽不同而把同一条真主干拆成多条叠线。跨语义成员共享时，公共段必须使用显式、确定性的 canonical bus paint（不能随机继承某个成员样式）；各成员从 tap/junction 离开公共段后恢复自身语义，标签、命中区和追线身份仍分别保留。**canonical base/backbone 归 trunk group 所有**，其 identity、paint、opacity 和 marker policy 只能由 group contract 决定；**render host** 只是确定性承载 base DOM 的成员/容器，**marker carrier** 只是承载唯一 marker 的无笔画渲染载体，二者都不是语义 owner。更换 host/carrier 不得改变像素、group identity 或导出结果。canonical base 永不继承任一成员的 hover/focus/selected/disabled/locked/peer-dim 状态、className 或成员 opacity；单成员交互只能新增 markerless trace，不能改写、调暗或隐藏 base。公共段到达真实 source/target 端点时，同一 canonical backbone 只能有一个方向 marker：同语义组沿用共同 marker，跨语义组使用明确 canonical marker；实现受限时可确定性使用 carrier marker 并输出 fallback 诊断，但绝不能按成员数重复叠画。marker-only carrier 必须无可见 path、无标签、无独立 interaction path，不能盖住成员各自的命中区；carrier 的 path underlay 必须完全不可见，但其 marker 自身必须有独立 contrast boundary/halo 并与导出结果一致。dual-trunk edge 必须同时关联 source trunk 与 target trunk，不能因视觉合并覆盖任一角色。
4. **主干、分支和普通边有一致层级** — 主干可通过稳定的线宽、明度或 junction 语法体现结构，分支保持次一级权重；同类边的视觉权重必须一致。层级表达不能只依赖颜色，也不能让主干样式反向修改路径或把无关 overlap 伪装成 bus。
5. **junction/tap 节奏可读** — 同组 tap 除了顺序正确，还应在空间允许时保持单调、均匀、可辨的间距；节点旁不应出现多个几乎重合的 T 形接点。建议输出 `junctionClearance`、`tapGapMin`、`tapGapVariance` 和 `branchStubLength`，把“顺序正确但分叉仍显得拥挤”单独评分。
6. **标签必须能唯一归属路径** — 标签位置应由最终 path 段决定，并在路由变化后稳定跟随。标签胶囊遮住线段时，左右/上下露出的同轴线段必须足以证明它属于哪条边；标签不得更靠近无关边、junction 或相邻主干。除碰撞距离外，还应输出 `ownEdgeDistance`、`nearestForeignEdgeDistance`、`ownerAdvantage` 和 `anchoredSegmentLength`，识别“没有相交但像悬浮文本”的情况。
7. **语义缩放采用分级显示，而不是全量缩小** — fit-all 总览、常用编辑缩放和细节缩放应有明确 LOD。总览优先保留主流程、关键方向和高优先级标签；次要标签可稳定隐藏、聚合或在 hover/focus 时出现。不得把全部标签反向放大后继续铺满画布，也不得让可见标签缩到不可读；隐藏/显示顺序必须稳定，缩放临界点附近不能闪烁。
8. **方向性在验收缩放档可读** — 单向边的箭头、终端短段和必要的中途方向提示应在 fit-all 与编辑缩放下仍可辨，不能只在 100% 放大后看清。超长或跨屏路径如果终端箭头不在当前视口，可使用不改变拓扑的重复方向提示；反馈边、双向边和无方向边必须使用可区分且一致的语法。
9. **hover/focus/selected 提供完整追线反馈** — 交互态应同时强化整条最终路径、所属标签、source/target 端口或节点；密集区域中应降低无关边的视觉竞争，不能只把一小段变色。每个状态都必须满足 `tracePathCoverage = highlightedFinalPathLength / finalPathLength = 100%`，共享主干的隐藏成员区间也要由临时 trace 完整补齐；临时 trace 必须满足 `traceMarkerCount = 0`，不能复制终端或中途 marker。canonical base 不参与单个成员的 hover/selected 改色，也不被 peer dim 降低 opacity；成员态只允许叠加无 marker 的临时 trace，离开交互态后 base 必须逐属性恢复。键盘 focus 与鼠标 hover 应提供等价反馈：edge wrapper 与其 label 都必须具备可访问 focus target 或等价 `focus-within` 关系，focus 后 path、label 和两端同步可见，低缩放下隐藏标签仍保留可访问名称。`interactionEventToPaintMs` 从 pointer/keyboard event timestamp 计到包含完整 trace 的首个已提交 paint，所有验收场景都必须 `<= 100ms`；不得通过预先常亮 trace 伪造时延，也不得触发重路由、端口变化或共享主干身份丢失。
10. **不可避免交叉需要 crossing bridge / line-hop 语法** — 软例外允许保留的交叉必须用统一的 jump/bridge/line-hop/gap 表示“谁从谁上方经过”，并规定稳定的优先级；不能让两条实线直接相交后要求用户猜测连接关系。crossing bridge / line-hop 只属于交叉处的渲染层语法，不能用于命名 dual-trunk edge，不能改变 SVG 几何门禁中的真实拓扑，也不能遮住附近箭头、标签或 junction。
11. **状态、主题和导出保持同等可读** — 默认、hover、focus、selected、disabled/locked，浅色/深色、高对比主题，以及 PNG/SVG/PDF 导出都要分别验收。导出不得丢箭头、junction、桥接、标签背景或主干层级；交互装饰可以不导出，但静态图必须独立可读。
12. **商业级门禁必须使用确定性的布尔聚合** — 每条 `warning` 必须带 `blockingFor: QualityLayer[]`；严重级别本身不能替代门禁归属。下列集合中的任一计数非零就阻断对应层，未知或缺少 `blockingFor` 的商业质量 warning 按所属层 fail-closed。只有同时带 `blockingFor: []` 和可审计 `nonBlockingReason` 的解释性 warning 才不阻断：

    ```text
    perceptualBlockers = edgeContrastViolations
      ∪ markerContrastViolations ∪ subpixelStrokeViolations
      ∪ trunkOverdrawMultiplicity ∪ ambiguousEdgeLabels
      ∪ missingDirectionCues ∪ unbridgedCrossings
      ∪ canonicalPlanViolations ∪ hiddenRangeCoverageViolations
    interactionBlockers = interactiveTraceFailures
      ∪ tracePathCoverageViolations ∪ traceMarkerCountViolations
      ∪ keyboardFocusFailures ∪ interactionPaintLatencyViolations
    multiScaleBlockers = lodDensityViolations
      ∪ scaleContrastViolations ∪ scaleStrokeViolations
      ∪ scaleMarkerViolations ∪ themeParityViolations
      ∪ exportParityViolations

    perceptualClean = (count(perceptualBlockers) == 0)
    traceable = (count(interactionBlockers) == 0)
    multiScaleClean = (count(multiScaleBlockers) == 0)
    commercialClean = hardClean && perceptualClean && traceable && multiScaleClean
    ```

    同一 warning 可以阻断多个层；总分、平均分、已记录原因或另一个层的富余分数都不能抵消上述任一 blocker。
13. **视觉语义必须贯穿转换链保真** — 输入中合法的 edge role/type、`style.stroke`、`strokeWidth`、dash、opacity、marker 和 label priority 必须经过 parse/coerce、自动布局、Worker、缓存补丁、stable path 与导出链保持一致；只有字段确实缺失时才能使用主题 fallback。不得因“无保存坐标”、切换 renderer 或命中预编译候选而把主流程、依赖、支持和数据边统一成同一条灰线。几何路由仍不得根据颜色猜业务语义，但渲染层必须忠实呈现已经显式声明的视觉语义。
14. **算法、预编译产物与最终 DOM 必须同版一致** — 单元测试中的新候选、已检入预编译 route 和浏览器最终 SVG 不能各自满足不同标准。routing/visual version、端口顺序、trunk membership、path signature 与视觉样式任一不一致时，旧产物必须 miss 或重新生成；不得用模型层全绿替代最终承载结果验收。人工反馈和发布门禁都以 production DOM/SVG 为最终真相，同时保留算法与产物差异诊断。
15. **render-only plan 每轮全图原子重建且永不持久化** — render-only plan 是从本帧最终 path 派生的短生命周期视图数据，禁止写入 Edge 业务数据、`localStorage`、导入/导出快照、预编译 route、任意跨帧 cache、Worker request/response 或 Worker replay；Worker 和缓存只能传递 routing-owned 几何。每份计划至少包含下列身份字段以及 `role`、member ranges、canonical owner/host 与 marker carrier 身份：

    - `schema`：固定命名空间字面量（当前约定 `vizly.render-only-trunk-plan`），只接受精确匹配。
    - `version`：正整数 schema 版本；字段、hidden-range 语义或 carrier 规则变化时必须递增，未知版本拒绝。
    - `groupId`：由 `role + endpoint + side + sector + canonical stem signature` 确定性生成的非空有界字符串；同一计划内唯一，source/target 两种身份不得碰撞。
    - `pathRevision`：绑定本轮 normalized final paths、handles 与 source/target trunk memberships 的完整、抗碰撞 revision；只有与当前最终路径集合精确匹配才可消费。

    任一 schema/version 不匹配、`groupId` 冲突、`pathRevision` 陈旧、owner/host/carrier 缺失都必须整组 fail-closed。任何入站 edge 都必须先剥离旧版或残留的 hidden range/backbone/host/carrier 信息，再从当前全图几何与角色重新计算并整体提交。跨 edge 校验必须逐个可见线段证明 `hiddenRangeCoverage = coveredByVisibleCanonicalLength / hiddenMemberLength = 100%`，覆盖区间的坐标、方向和 role 必须一致；不得以包围盒相交、近似总长度或另一组 backbone 代替。任一 gap、越界、重叠归属冲突、孤立 hidden range 或不可证明的覆盖都必须撤销整组隐藏并恢复成员原始可见边，不能把陈旧隐藏状态带入新帧。

16. **视觉令牌必须连续且交互态不得引发布局抖动** — 普通边、分支、canonical trunk、junction、marker 和标签应使用一套确定性的视觉层级。内置或缺省箭头必须继承该边最终 semantic stroke；canonical trunk 到达真实端点时使用 canonical marker token，不能回退为组件库默认灰色或与线身不同的随机颜色。marker 缺失的颜色和尺寸应在最终展示边界一次补齐，已有安全的用户样式与内部 marker URL 保持不变。hover/focus/selected 可以改变颜色、opacity、shadow 和视觉线宽，但不得改变最终 path，也不应通过改变标签 padding、border width、字体尺寸或几何 transform 造成标签跳动；默认态必要连线和标签禁止依赖模糊、发光或透明叠画才能读清。
17. **缺省样式必须表达业务角色且不得污染几何缓存** — 当输入只声明合法 edge role/type、没有显式视觉样式时，最终展示层必须提供克制且可区分的确定性 fallback：主流程使用较深实线，数据流使用冷色虚线，依赖/支持关系使用中性细虚线，状态流使用警示色长虚线。该 fallback 只参与最终 paint、marker 与 DOM/SVG 输出，不得写回 routing-owned path、Worker 输入、预编译 route 或持久化缓存；显式且安全的用户 stroke、width、dash、marker URL/paint 始终优先。role 只接受有限枚举并通过固定 class token 传递，未知、超长或非法值 fail-closed 为普通中性边，禁止把外部字符串直接拼入 CSS。

## 🧮 推荐默认阈值

这些阈值是默认验收口径，允许根据画布密度、缩放、节点尺寸和业务图类型配置，但不能缺省为“不检查”。

| 检查项 | 默认阈值 | 严重风险 | 说明 |
|---|---:|---:|---|
| 端点正交误差 | `<= 1.5px` | `> 3px` | 第一段/最后一段与节点边界法线方向的横纵偏差 |
| 最短首段/尾段 | 基础 `>= 24px`；普通业务节点建议 `max(48px, min(96px, shortSide * 0.75))` | `< 12px` 或方向正确但贴边横滑 | 特殊小节点可按节点尺寸降级，但需记录原因；方向正确不代表入射清晰 |
| 内部 tiny dogleg | `< 24px` 为硬错误；`24-40px` 为视觉 warning | `< 24px` 阻断 `hardClean`，连续出现时升级 | `23.8px` 等漂移必须归一化/修复；可压平、移到中轴或合并到共享主干 |
| edge-node 距离 | `>= 16px` | `< 8px` | 排除 source/target 自身 |
| node-corner 距离 | `>= 12px` | `< 6px` | 捕捉角点擦边 |
| 非 buddy edge-edge gap | `>= 8-12px` | `< 6px` | buddy trunk 需要显式 group 标记 |
| 中段共享 overlap | `< 24px` | `>= 48px` | 仅显式 source/target trunk 可豁免；dual-trunk edge 中段不可默认豁免 |
| 交叉点到节点/标签/junction 距离 | `>= 24px` | `< 12px` | 无法消除交叉时仍需保证交叉点位置清晰 |
| 同组 tap 顺序反转 | `0` 次 | `>= 1` 次且造成穿插 | O2M/M2O bus 上分叉/汇聚点应按空间投影排序 |
| edge-label 距离 | `>= 8px` | 相交 | 标签优先移动，路径次之 |
| path/manhattan 比 | `<= 1.8` | `> 2.5` | 避障、共享主干、消交叉可降权但需解释 |
| 主方向回退 | `<= 1` 次轻微回退 | 回退距离 `> 25%` 主方向距离 | 反向反馈和外侧绕行可例外 |
| bend count | `<= 6` | 小阶梯连续出现 | 同等成本下优先少弯折 |
| 主轴端口偏好 | 主导比 `>= 1.4` 时优先对应水平/垂直侧 | 主导比 `>= 2.0` 仍从相反/次要侧出发 | 使用节点中心位移和短边归一化 |
| 可消除端点肘弯 | bend 至少减少 `1`，长度增幅 `<= 10%-15%` | 相同或更短却保留多余肘弯 | 候选不得新增任何硬缺陷或错误 overlap |
| 角点端口 inset | `>= 12-16px` | free/weak 端口精确落角点且 side 不明确 | 显式 corner port 可例外 |
| bus 扇区拆分 | 不同主要 side/sector 默认拆分 | 合并后产生反向首段、端点肘弯或 `>15%` 绕远 | 组内共享主干仍是硬保护 |
| 默认态必要连线对比度 | `edgeStrokeContrast >= 3:1` | `< 3:1` 且无等价文本/表格表达 | 以最终像素 RGBA 为准，合成 stroke opacity、element/祖先 opacity 和背景；filter/mask/blend 必须像素采样 |
| marker 最终像素对比度 | `markerFillContrast >= 3:1`，且边界/halo 能从最不利背景分离 | 箭头尖端或方向轮廓在验收档不可辨 | 独立记录 `markerFillContrast`、`markerBoundaryContrast`、`markerTipVisiblePixels`；不得拿 path 对比度代替 |
| marker 与线身视觉连续性 | 普通/语义边 marker paint 与最终 semantic stroke 一致；canonical 端点使用确定性 canonical token | 缺省箭头回退为组件库默认灰、同一边线身与箭头颜色不一致 | 在最终 DOM/SVG 检查 marker definition 的 stroke/fill、尺寸和引用关系；不能只检查 edge 配置对象 |
| 缺省业务角色可辨性 | main/data/dependency/status 至少通过颜色、dash、线宽中的两项形成稳定区分；显式用户样式优先 | 合法角色全部退化为同色同宽同 dash，或视觉 fallback 改变 route/cache signature | 在最终 DOM/SVG 按 role class 抽样 line + marker；再比较 Worker/预编译输入未携带 render-only class/style |
| 屏幕空间可见线宽 | 默认态 `>= 1.25 CSS px`；交互强调态 `>= 2px` | 任一验收缩放档 `< 1px` | 读取最终渲染宽度；透明 interaction path 不计入可见线宽 |
| 可见边标签字号 | 屏幕空间 `>= 11px`，否则进入稳定 LOD 隐藏/聚合 | 持续显示但 `< 9px` | 标签不得仅靠逆缩放把全部内容留在总览；hover/focus 可按需显示 |
| 标签路径归属优势 | 自有路径距离 `<= 12px`，且比最近无关边至少近 `6px` | 标签更靠近无关边或遮住 junction | 胶囊覆盖自有线段时还需有足够同轴露出段证明归属 |
| junction/tap 可辨间距 | 非重合 tap 默认 `>= 12px` | `< 6px` 或视觉上无法区分 | 合法同点 junction 可为 `0`，但必须有明确共享语义 |
| 箭头屏幕尺寸 | 主轴方向长度目标 `>= 7px` 且不被裁切 | fit-all 中不可见或与线同化 | 长路径可用中途方向提示，不要求改变真实 route |
| 交互追线反馈 | `<= 100ms` 强化 path + label + 两端；密集区降低无关边竞争 | 仅局部变色、端点不明或触发路径变化 | 鼠标 hover、点击 selected、键盘 focus 分别验证 |
| 追线路径覆盖率 | `tracePathCoverage = 100%` | 任一最终路径或隐藏主干区间未被强化 | hover/focus/selected 分别计算；键盘 focus 同时覆盖 wrapper、label 与两端 |
| 追线 marker 数 | `traceMarkerCount = 0` | trace 复制任一终端/中途 marker | marker 只由 canonical/成员正式载体绘制，trace 永远 markerless |
| 共享主干可见叠画数 | `1` 条可见 backbone stroke | 成员数改变导致主干颜色/线宽变化 | 每边独立 hit area 可保留，不计为可见叠画 |
| 跨语义真主干绘制 | `1` 个显式 canonical bus paint；成员分支恢复原语义 | 按 paint signature 拆干、随机继承 owner 样式或叠画多种语义色 | 主干识别只依据几何/角色/扇区；标签和 hit area 保留成员身份，marker 保留方向语义且在 canonical 端点合并，dual-trunk 的 source/target memberships 分别保留 |
| 真主干坐标归一化容差 | `<= 4px`，并要求端点角色与拓扑连续 | `> 4px` 或前缀/后缀断裂 | scorer、repair、protected overlap 与 render plan 使用同一容差 |
| canonical 端点 marker 叠画数 | 每个到达真实端点的 backbone、每个方向 `1` 个 | 按成员重复 marker，导致箭头加深、变粗或导出重影 | 同语义沿用共同 marker；跨语义用 canonical marker，受限 fallback 必须确定且可诊断 |
| render-only hidden coverage | 每组每段 `hiddenRangeCoverage = 100%` 且 `pathRevision` 同版 | 任一 gap、越界、陈旧 revision 或 owner/host/carrier 缺失 | 计划只存在当前渲染帧；禁止持久化、cache 和 Worker replay，失败整组恢复原始可见边 |
| 不可避免交叉桥接 | `100%` 使用统一 jump/bridge/line-hop/gap | 普通实线直接相交且关系不明 | 仅用于已记录原因的软例外交叉；不得表达 dual-trunk identity |
| 视觉语义字段保真 | 合法显式字段 `100%` 保留 | 任一转换分支静默丢失或被 fallback 覆盖 | 对比输入、canvas edge、Worker patch、最终 DOM computed style 与导出结果 |

## 优先级排序

**正交 > 端点连接/strong 端口约束 > 节点避障 > bus 侧边/扇区正确性与 dual-trunk 保真 > 修复不反弹 > 普通严格交叉 > 可消除端点肘弯 > 主轴/象限端口偏好 > 同扇区共享主干 > 默认态可感知与方向可读 > 标签唯一归属 > 方向单调性 > 容器视觉边界 > 节点/边/标签最小间距 > 端口顺序与 junction 节奏 > 弯折复杂度 > 最短路径 > 增量稳定性 > 交互追踪与多尺度一致性 > 美观对齐**

## 修复流程建议

1. **先统一几何表示** — 规范化路径点，消除微小斜线、重复点、过短折返，保证后续评分看到的是正交路径
2. **再保护 bus 结构** — 建立 O2M/M2O buddy group；dual-trunk edge 必须同时加入 source 与 target 两个 group
3. **交替修复硬约束** — 推荐顺序为共享主干修复 → 硬避障修复 → 交叉修复 → 硬避障复核 → 交叉复核 → 硬避障复核
4. **候选评分按目标排序** — 候选路径比较时应先看硬交叉数和障碍命中数，再看 buddy 交叉、路径长度、弯折数量
5. **保留最新真实路径上下文** — 当前批次之外的已路由路径也要参与评分，尤其是 bus 边；否则跨批次修复会看不见真实主干和交叉
6. **渲染层软修复兜底** — worker/布局层输出后，还应基于真实 SVG path 做轻量修复：近似同轴微偏移、局部小 dogleg、端点 hairpin、过度对齐绕行、标签贴线等问题都应在渲染层二次检查
7. **允许带解释的软例外** — 检查器不能只按“交叉数越少越好”静态排序；当直连满足正交和节点避障、且只引入有限交叉时，应和当前绕行路径比较长度比、弯折数、横向跨度、交叉位置，再决定是否接受软例外
8. **锁定路径局部修复顺序** — 对 locked/computed path，先验证端点是否仍连接当前节点，再检查短 stub、贴边、真实障碍和容器标题栏风险；只对失败的局部段做修复，避免因为一条边被选中或局部风险触发而重算整组无关边
9. **缓存版本单一来源** — worker、渲染修复和协调器清缓存必须共享同一个 rendered path cache 版本；不能让不同层各自维护版本号，否则 HMR、重载、选中重挂载会反复清空或复用错误路径
10. **先选端口侧，再保护 sector bus** — 根据显式约束、目标象限和主轴生成 source/target side 候选；按 side/sector 重建 buddy group 后，再选择 trunk lane。不能先把所有同源边锁进一个 bus，再尝试用中段修复弥补错误端口。
11. **端口候选采用有界局部验证** — 对每个 side pair 只重建端点附近路径，复用中间 corridor，并依次检查正交、端点方向、节点命中、严格交叉、错误 overlap、endpoint bend、长度和稳定性；通过后才写回 handle 与 computedPath。
12. **只展示通过门禁的最终结果** — 页面可以等待 Worker 完成，但不能先显示低质量临时路径再跳成最终路径。节点几何稳定后只启动一次可取消计算；最终候选必须通过同一套硬门禁，超时或预算耗尽不能被当作质量合格。
13. **缺陷驱动与精确增量评分** — 每轮先识别仍存在的缺陷，只运行对应修复器；单边或少量边候选应复用未变化边的单边/边对评分、障碍结果和线段分解。增量评分必须与全量评分逐项等价，不能用近似分数换性能。
14. **缓存只保存路由补丁** — Worker/持久化缓存只保存 handle、renderer type、computed path 和实际发生变化的 routing metadata；应用时合并到最新源 Edge。不得用旧缓存整条覆盖最新 `style`、marker、className、交互属性或业务 metadata。
15. **性能预算不能降低质量门槛** — 标准 Logistics 最终候选目标 `< 3s`，WMS Process Flow 冷路由目标 `< 30s`，命中缓存应接近即时；预算内未达硬门禁时必须进入完整兜底或显式失败，不能静默返回非正交、穿节点、错误端口、严格交叉或异常 overlap 的候选。
16. **先做零风险阶段跳过** — 每个阶段先读取可复用的硬门禁报告；不存在对应缺陷时必须直接跳过修复器。相同 edge/node 签名的质量、障碍和端点附着结果应复用，不能在连续阶段重复做完整 `O(E²)` 扫描。
17. **候选评估必须有界且缺陷定向** — 终端交叉、反向 overlap、脱离端点分别使用独立的有限候选预算；优先尝试由相邻边段、节点矩形和端口角色推导出的车道，不做固定偏移的全空间枚举，也不通过增加最终 pass 数掩盖首个候选不准的问题。
18. **脱离端点逐边修复** — 不得为了三条飞线统一重锚整张图。每次只修改一个真实脱离端点，顺序为原侧精确锚定 → 相反流向角色分侧 → 面向象限的 source/target 成对端口 → 障碍外连接车道；候选只有在全图质量不回退、障碍不增加且端点真实附着时才能写回。
19. **最终效果一次提交** — 性能优化只缩短最终候选生成时间，不引入低质量快速首帧。Worker/主线程可以内部进行有限候选比较，但 UI 只接收一次通过完整 hard report 的最终路径；端口和路径必须作为同一补丁原子更新。
20. **密集交叉采用有界链式 junction** — 当一条内部段依次穿过多根相邻主干，普通外移会穿节点、而直接绕单个交点会产生 `<24px` 小段时，可以沿行进方向把交点改成单调 junction 链：每次只沿阻塞主干跟随 `24px`，再进入下一条正交车道。入口、相邻 junction 和出口间距必须为 `0` 或 `>=24px`；整条候选仍须满足零严格交叉、零异常 overlap、零 tiny dogleg、零节点命中。这个 `24px` junction 是消除交叉的局部拓扑，不得被扩展成无关边的长共享主干。
21. **运行时 handle 锁不等于语义端口约束** — `runtimeHandleLock` 只保证 renderer 在当前路径上使用同一 handle，不能升级为 `strong/fixed`。只有人工端口、显式 `*HandleLocked` 或 strong/fixed policy 才禁止自动换侧；否则应以实际节点边界和首尾有效长段判定端口方向，允许合法的边界 trunk 或相邻侧修复。
22. **候选评分复用精确增量上下文** — detached/residual overlap、链式 junction 和端点候选通常只修改 1-2 条边，必须以当前不可变 edge 集为 baseline 建立增量评分上下文，只重算受影响边对；每次接受候选后重建上下文。增量结果必须通过单边、双边 parity 测试与全量评分逐项一致。
23. **Worker 只预热模块，不提前计算** — 图表路由进入加载流程后可以立即创建或预取 Worker，使脚本下载、转换和编译与 preset/layout 并行；预热不得提交路径、读取未稳定 measured geometry 或触发候选计算。React StrictMode 的模拟挂载也不得因此产生一次无效路由。
24. **完整稳定几何只启动一次** — 只有 node/edge 集合、绝对坐标、实测宽高、handle 约束和路由版本共同形成稳定 geometry signature 后，才允许启动最终 Worker。冷缓存的一次加载应表现为一次 start、一次 final commit、零 abort；测量抖动必须在 start 前由 settle/debounce 吸收，不能靠反复启动再取消来收敛。
25. **可信 hard report 避免主线程重复全门禁** — Worker 返回 `hardClean=true` 时，只有路由版本、输入 geometry signature、输出路径签名和 edge shape 均与主线程当前状态一致，主线程才可复用该报告并跳过重复的全图质量、障碍和端点附着扫描。主线程若重新锚定、修补或合并后改变任一路径/handle，必须视为新签名并重新门禁；边界解析和补丁结构校验始终保留。
26. **changed-index 评分必须精确等价** — 增量上下文可以只重算 changed edge 的单边分数及其相关 edge pair，但最终每个质量字段、排序结果和接受/拒绝结论必须与对同一候选执行全量评分完全一致。不得以抽样、近似空间索引或权重总分相等代替逐字段 parity。只有由不可变 baseline 构造、且调用方能完整证明 changed indexes 的内部候选可以走可信快路；外部、可变或来源不明的候选必须核验未声明变化，并在漏报、重复、越界或结构变化时退回全量评分。
27. **失败候选不得污染最终缓存** — rendered path 缓存只能写入并复用 `hardClean=true` 的最终补丁；`hardClean=false`、字段缺失或旧版本条目必须视为 cache miss 并重新计算。缓存是最终结果加速器，不能把一次预算失败固化成跨刷新复现的穿节点、错误端口或飞线。
28. **阈值小数漂移要归一化而不是放宽门禁** — 节点测量和布局缩放可能产生 `47.8px` stub、`23.8px` dogleg 等接近阈值的浮点结果。若短差在明确数值容差内，应把局部 staircase/lane 平移到精确的 `48px`/`24px`，并重新执行全图质量、障碍和端口门禁；不得把全局阈值下调或在评分器中静默忽略，从而让真实短段混入最终路径。
29. **精确有界内存 memo/cache 契约** — 内存 memo/cache 的 key 必须完整覆盖 edge path、source/target handles、quality intent，以及按统一容差和稳定顺序编码的归一化节点几何；缺失任一影响评分或门禁的字段都必须视为 cache miss。缓存容量必须明确有界，并采用确定性的 LRU 或 FIFO 淘汰，不能随图表操作无限增长。patch/result 写入缓存时必须 copy-in，读取命中时必须 copy-out，避免调用方突变污染缓存基线或后续命中结果。此类缓存只在当前 JS realm/tab 内有效，不跨标签页共享，因此多个标签页首次加载会分别执行独立冷计算，不能承诺跨标签热命中。缓存的命中、未命中或淘汰不得改变硬门禁字段、候选排序、接受/拒绝结论或最终路径语义；同一输入的缓存结果必须与无缓存全量计算逐项精确等价。
30. **硬下限与渲染偏好分层** — `48px` 是普通业务节点 endpoint stub 的正式硬下限；`56px` 等更长距离只能作为渲染清晰度偏好。候选已经满足全部硬门禁时，不得仅因未达到软偏好而回退到存在飞线、节点穿越、严格交叉或错误端口的旧路径。软偏好修复仍须原子执行并重新门禁，失败时保留 hard-clean 候选。
31. **评分缓存不得跨语义 evaluator 复用结论** — 正交、交叉、overlap、障碍等只由几何决定的昂贵指标可以按完整路径/节点签名共享；`terminalsAttached`、`terminalsAnchored`、端口策略等依赖 evaluator 或 policy 的结论必须按当前语义重新计算，或把 evaluator/policy identity 纳入 key。允许共享几何中间量，不允许让一次宽松 evaluator 的结果污染后续严格门禁。
32. **分层惰性候选必须保持精确最优语义** — 性能优化可以先评估低成本、低优先级编号的局部候选，并只在它们不能达到当前理论下界时生成 outer escape、waypoint 等昂贵候选；但停止条件必须能证明后续候选不可能改善硬门禁或既定排序。无法证明时必须继续生成，且最终接受/拒绝结果须与原完整候选集逐项一致。
33. **无结果搜索只允许精确 fixed-point 复用** — 有界 cluster 等昂贵修复器只有在完整预算内搜索结束且返回原 `Edge[]` 时，才能记住“该输入没有可接受修复”这一事实；产生过正修复结果、预算/语义不明时不得登记。命中前必须重新核对最终路径/handle/quality intent、端口锁与 policy、节点类型/位置/尺寸和路由版本；原地改变任一字段都必须失效。相同数组可用不强持有输入的 `WeakMap` 快路；跨数组引用只允许使用带长度前缀、逐字段完整编码的 canonical exact identity，必须覆盖 edge/node 顺序、edge id/source/target、完整 computed path 和全部上述语义，不能把 32/64-bit route hash 当作相等依据。跨引用表必须采用明确容量的确定性 LRU/FIFO，只保存不可变字符串 fixed-point identity，不能保存或回放可变 Edge 结果；非法、非有限、超长、超量或带异常 getter 的边界输入直接按 cache miss 处理。
34. **同轴拓扑锁采用双 stub 外侧包络兜底** — 当一条 `H→H` 或 `V→V` 边与无关反向主干形成长 overlap，且平移单段必然让两条接腿产生新严格交叉时，常规局部候选失败后才可惰性生成整边外侧包络候选。候选必须保留首尾原轴向和既有 endpoint stub，外侧 lane 只能从附近真实障碍矩形的上下/左右包络加安全间距推导，不能写死边 ID、图坐标或无界 delta。生成数量、路径点和参与节点必须有明确上限；最终仍须同时满足零严格交叉、零错误 overlap、零障碍命中、零 tiny dogleg/hairpin 和 stub 硬下限，不能以远距离绕行换取单项清零。
35. **深层候选使用父子数值状态而不是字符串 pair memo** — beam/compound 搜索从父候选继续修改少量边时，应保存父状态的单边分数、线段分解和受影响 pair contribution，只减去本轮旧贡献并加入本轮新贡献；不得每深入一层就从最初 baseline 重算全部累计变化边，也不得为每个 pair 构造字符串 key。状态必须使用当前 candidate 的完整 Edge metadata 判定 related/permitted overlap；跨 evaluator、边数变化、重复/越界索引或未声明引用变化必须退回全量评分。
36. **阶段内几何快照只做精确复用** — 同一候选在 local dogleg、endpoint lane、障碍和 overlap 检查之间应复用一次 compact path、segments、length/bends 和有限数值 bounds。空间索引只能缩小待扫描集合，最终开闭区间、source/target 排除、容器过滤和原有迭代顺序必须保持；NaN、Infinity、超量或无法证明等价的输入必须退回原完整扫描。阶段快照不得升级成无界全局缓存。
37. **所有路径后处理必须是空间安全事务** — micro cleanup、可读旧路径恢复、圆角前压平和 compound/beam 联动修复不能只比较边自身的正交、交叉、overlap、长度和弯折。候选生成前应复用节点障碍与端点校验快照；每个普通候选和累计 beam 状态都必须按完整 \`changedIndexes\` 证明节点命中不增加、端点 attached/anchored 不退化，失败后继续搜索次优安全候选而不是提交后再指望后续 pass 补救。调用阶段仍须保留全图 hard gate 作为纵深防线；任何后处理都不得把已 hard-clean 的输入改回穿节点、贴边反向逃逸或飞线状态。
38. **持久化缓存属于外部输入** — `localStorage`、导入快照和预编译产物即使携带 `hardClean=true` 也不能直接进入 UI。必须先经过有界 schema parse、有限数值和路径点校验，再只提取 routing-owned 字段；旧 `label`、`style`、marker、className、交互状态、业务 metadata 和未授权 quality intent 必须丢弃。候选合并到最新 Edge 后，还要在当前实测节点几何上重新执行完整 hard gate，验证完成前不得显示。
39. **缓存验证与失效重算必须原子化** — 持久化候选和预编译候选都应通过同一个 Worker job 执行 `validate-or-route`：候选 shape、版本、签名、路由字段或硬门禁任一失败时，直接在同一 job 内进入完整路由；成功时只提交一次最终结果。验证完成前宁可保持连线层为空，也不得先显示候选或临时 smooth-step、失败后再跳成重算结果；同时不得把全图硬门禁搬回主线程造成双份 CPU 和 bundle。
40. **静态标准图允许预编译最终路由，但不得特判图或边** — 预编译产物必须由 production-preview 浏览器在真实 DOM measured geometry 下生成，以通用 input geometry signature 索引，并用独立 64/128-bit canonical geometry digest 做碰撞保护；产物还必须绑定 routing version、source hash、显式 schema、output route signature 和 `hardClean=true`。源码受控产物可以通过独立 schema 授权路由器生成的 `sharedTrunkAware`、`sharedTrunkSynthesized`、`isTreeBus` 三个布尔 intent，但持久化缓存仍不得携带这些字段，其他 intent 或类型一律拒绝。运行时按签名惰性加载，仍执行第 38、39 条验证；任何浏览器、字体、DPR、CSS、布局或版本差异都只能安全 miss 并回退正式 Worker，不能按 diagram ID、edge ID 或固定坐标强行命中。
41. **端口侧约束与精确 handle 身份必须分离建模** — `left/right/top/bottom` 只表示端口侧，不能替代人工提供的 exact/compound handle ID。人工 handle、显式 lock、strong/fixed/forbidden policy 必须在 normalize、重锚、共享主干、端点排序、回退恢复及最终提交等所有写回入口保持不可变；同侧修复也不得把 compound ID 降级为裸 side。只有路由器在本次计算中生成的 runtime handle，才允许由通过完整 hard gate 的可信 worker/预编译结果继续细化；持久化缓存、导入内容等不可信候选不得据此改写端口身份。
42. **主线程与 Worker 的共享路由代码必须按构建图求交** — 共享 chunk 应由“路由 Worker 的静态可达模块”与“客户端入口（含动态入口）的可达模块”求交得到；仅 Worker 使用的候选生成、修复和评分阶段必须留在 Worker 私有闭包，不能为了方便维护白名单而让主线程重复下载、解析和解码。分类器要有循环、缺失模块信息、重复 Worker 或入口缺失的 fail-closed 测试；每次生产构建还须同时验证 chunk 依赖闭包、总 bundle、关键 decoded 资源和真实冷路由时延，性能优化不得改变最终路径或 hard report。
43. **严格阶段逐边、逐角色保持端点单调** — 进入 strict、full-route、render-finalize 或 fail-closed 阶段前，必须按 `edgeId + terminalRole` 建立 source/target 快照。基线中已 `attached` 或 `anchored` 的角色，以及受 policy 保护的 exact handle/fixed side，任一子阶段都不得退化；不得只比较全图 attached/anchored 总数，因为“一条修好、另一条飞线”仍可能让总数不变。减少交叉、障碍或 overlap 不能补偿任何端点角色退化，失败后必须继续搜索次优安全候选；`finalized` 与 `continue` 两类出口执行同一门禁。
44. **tiny interior dogleg 是商业发布硬错误** — 最终路径压缩重复点与共线点后，任一内部段满足 `0 < length < 24px` 都计为 `tinyInteriorDogleg` 并阻断 `hardClean`；`24px` 边界通过，`23.8px` 等测量漂移必须归一化或修复到合法阈值。H-V-H、V-H-V、小阶梯、trunk tap 附近和 terminal 前内部微段全部适用；安全修复优先压平到合法 corridor/canonical trunk，否则把跨接段扩至 `>=24px`。若无法同时保持障碍、端点、交叉、overlap 和双端真主干，则不得提交。
45. **双主干身份按区间多角色集合建模** — 一条边可以同时持有独立的 `{role, groupId, side, sector, interval}` source-trunk 与 target-trunk membership；任一侧修复不得覆盖、清空或重解释另一侧身份。source 后 target、target 后 source必须得到等价结果，重复执行必须幂等。同一物理区间同时满足两类真主干且方向兼容时，只绘制一条 group-owned canonical backbone、保留两个语义 membership，并只隐藏一次成员区间；不兼容时确定性拆分区间并输出诊断，仍不得丢失任一端身份。
46. **主干识别、质量豁免与渲染计划共享同一坐标容差** — visual near-parallel overlap、source/target trunk chain、protected overlap exemption 与 canonical render plan 必须使用同一个 `sharedTrunkCoordinateTolerance`，默认 `<=4px`。容差内仍须同时满足共同端点、role、side/sector 与连续前缀/后缀，随后归一化到同一 canonical 轴；超过 `4px` 不得按真主干豁免。坐标接近不能替代拓扑连续性，断裂前缀/后缀即使偏差不足 `4px` 仍按异常 overlap 处理。
47. **算法与预编译文件必须作为原子、可复现批次交付** — 任一改变路径、端点、trunk membership、几何容差、compaction、terminal evaluator 或候选接受规则的修改，都必须更新 routing version，并用修改后的同一 production build 重生成全部标准目标。manifest、generated loader 与 route artifacts 必须精确绑定目标集合、routing version、diagram source hash、由 production 路由静态依赖闭包逐文件内容计算的 routing implementation source hash、input signature、canonical geometry digest、output route signature 和 `hardClean=true`，不得缺项、重复或保留孤儿文件；只改算法而未重生成时必须 fail-closed。生成模式必须使用独立参数绕过预编译及持久化候选，`--check` 必须要求当前算法实际完成 `full-route`，不能让旧产物作为候选自证；生成完成后再运行 reproduction 必须字节级零差异。运行时 artifact 合并结果还须与同版算法及最终 DOM 逐边一致，包括 source/target memberships、dual-trunk identity 与 `tinyInteriorDoglegs=0`，差异只能 fail/miss。
48. **兄弟端点节点始终是绝对障碍** — 在 O2M 中，其他分支的 target 节点；在 M2O 中，其他分支的 source 节点，都必须像任意无关业务节点一样参与逐段避障。共享 source/target trunk 只延伸到共同节点边界，不能把兄弟节点内部误当成 trunk 的合法续段。共享主干合成、端点排序或 crossing repair 后必须再次执行 sibling-terminal obstacle closure；候选不得以减少交叉、增加公共 stem 或改善 tap 顺序为理由交换出新的节点命中。对同时属于 source 与 target 真主干的 dual-trunk edge，避障事务可以延长两端公共 stem，但不得缩短、覆盖或丢失任一端 membership，并须原子保持端点 side、attached/anchored 与全部硬质量字段。selected/hover/focus trace 必须复用同一条最终 obstacle-safe path，render-only hidden range 也不得跨过节点内部把被隐藏区间重新连成穿节点直线。
49. **正逆向端口束必须整体换道并原子验收** — 当一条长边同时穿过同源正向分支和逆向目标主干时，不能逐交点局部平移，也不能只交换一个端口；这种修复会把交叉依次推到下一个 sibling approach。候选必须以整个受影响线束为事务：先归一化同侧 source stem 与 tap 顺序，再把 through-edge 移入由真实节点包络推导的外侧 lane，最后让所有同目标分支在最早受保护 target trunk 处同向汇聚。事务只在端口 inversion/tie、业务节点命中、严格交叉、异常 overlap、tiny dogleg、端点 attached/anchored 全部为零，且基线中的 source/target/dual true trunk 均不缩短时提交；任一项失败即整批回滚。算法必须按拓扑、端口侧、节点矩形和既有真主干推导，禁止按图 ID、边 ID 或固定画布坐标特判。
50. **真主干接点必须显式且由主干唯一绘制** — O2M/M2O 的合法 tap/junction 即使不属于严格交叉，若仍以两条成员边各自描线，会在 T 形接点处产生“穿过/误接”观感。渲染层必须从与 canonical backbone 相同的 membership/range 计划推导接点，只由 canonical owner 在每个内部公共 stem 边界绘制一个确定性圆接点；成员边不得重复绘制。接点不改变真实 path、handle、hard report 或 dual-trunk 身份，默认/hover/focus/selected、固定缩放和 SVG/PNG/PDF 导出必须同位、同色且不被 peer dim。无拓扑共享语义的严格交叉禁止借用 junction 圆点伪装，仍须重路由或使用 crossing bridge / line-hop。
51. **逆向 through lane 与正向 bus 必须分域审计** — 反馈/逆向长边不能因方向相反就被当作普通独立边，也不能因碰到同目标 trunk 就整段锁死。先把它与同目标/同源的真实共享区间识别为 target/source trunk 并使用唯一 junction；其余中段必须逐段检查与所有正向 source/target bus、分支和节点的严格交叉。无共享语义的交点优先换到 bus 包络外侧，稳定安全间距默认 `>=48px`；无法消除时只能走已解释的 crossing bridge / line-hop，禁止用 junction 圆点或 buddy 身份豁免。逆向 lane 换道仍须原子保持两端端口、attached/anchored、节点避障、dual-trunk membership 和 tiny dogleg 门禁。
52. **端点相邻长段同样必须逐段避障** — 只有 `2-3` 个点的 H-V、V-H 或 H-V-H 路径，第一段/最后一段可能同时承担 source/target trunk，不能因为“不是内部段”而跳过业务节点避障。若直接平移会让端点脱离节点、改变 handle side 或拆散真主干，必须保留真实端点及已有公共 stem，在障碍前插入正交换道、沿节点包络外侧通过，并在障碍后以满足 edge-node clearance 的位置汇回原 trunk。候选按“节点命中数、硬质量、clearance 风险、长度”词典序选择；任何少交叉但仍穿另一个节点的交换候选必须拒绝。selected/hover/focus trace、交互热区与导出路径全部复用这条修复后的最终几何。
53. **窄走廊按障碍簇判定，不以内部命中为前提** — 业务节点之间的通道若不能同时为线条两侧提供至少 `48px` 的商业安全距，即使中心线没有进入节点数学内框，也视为视觉穿节点。最终阶段必须在 `obstacleHits = 0` 时继续检查 clearance；相邻障碍应合并为一个包络簇，候选从整簇外侧绕行，禁止先避开一个节点却贴住或穿过另一个节点。路由坐标默认保留 `192px` 内部间距，以吸收中文换行、边框和 DOM 实测宽高漂移；在容器边缘最多允许使用这 `144px` 的测量余量，最终仍必须由 SVG 门禁确认可见间距 `>=48px`。换道不得改变真实 source/target 锚点、handle side 或双重主干身份；只有为消除节点净距风险时才可在一次事务内把既有公共 stem 最多缩短 `144px`，且不得短于 `48px`，两端 membership 必须完整保留。
54. **自动首选端口侧只能作为有界线束证据恢复** — source-authored 的自动端口侧是软拓扑证据，不是固定锁，也不能被后处理永久遗忘。只有同一 source/side 至少有 `3` 条候选、至少 `2` 条当前仍在该侧、缺失成员的远端投影落在现有成员的切向包络及 `48px` 容差内，且全部目标都位于该侧的真实外向半平面时，才可原子恢复整束；超出包络的报关、反馈或外侧 escape corridor 必须保持独立。恢复后公共 source stem 默认至少 `70px`，并须完整保持每条边的 target suffix、另一端 true trunk、人工/固定 handle、节点避障、端点 attached/anchored、零严格交叉和零 tiny dogleg；任一条件失败即整束回滚。候选只改一条边时，障碍评分应复用基线逐边贡献，只重算该边并与全量 scorer 保持逐项 parity。
55. **双角色边补入缺失真主干时允许有界局部折返** — 已经属于另一端 true trunk 的自动 dual-trunk edge，若补入同端现有真主干会增加少量 backtrack，不得仅凭该软分数否决真实共享关系；但例外只能作用于跨 side 的双角色成员，默认新增 backtrack 上限为 `128px`。候选仍须保留另一端 trunk 的 edge set 与 common stem，且非正交、严格交叉、节点命中、反向/无关/未解释 overlap、短 stub、tiny dogleg、hairpin、端点 attached/anchored 和端口顺序全部不得退化。超过上限、普通单角色边或人工/固定端口一律沿用原硬门禁并拒绝候选。
56. **源端与目标端捷径必须可独立提交** — 一条硬门禁已通过的外侧路线，可能只需要调整 source side，也可能只需要调整 target side；不能把“另一端已经做过运行时换侧”升级成整边不可再优化。单端捷径应保留另一端已接受的 corridor、端口和 true trunk membership，只在本端使用 `>=56px` 的 render-safe endpoint stub 接回既有路线；候选生成器与最终短 stub 门禁必须复用同一最小值，禁止生成后必然被终审淘汰的 32/48px 微短桩。候选先做逐边节点净距、障碍和短 stub 预筛，再进入全图正交、严格交叉、overlap、端口顺序和双端主干门禁。候选数、每边深度与全图评估次数必须分别有上限，禁止通过 16 个 side pair 的无差别全图枚举换取少量折点优化。

## 近期布局与路由协同方案（2026-08）

1. **布局按拓扑分派** — `Tree` 只直接处理有向有根森林；多父节点、反馈环和自环自动交给同方向的 ELK Layered 排名。菜单语义仍保持 Tree，但不再把非树图强塞进树算法。
2. **提供显式行业分层布局** — 增加 `ELK Orthogonal Layered (Top–Bottom)` 与 `ELK Orthogonal Layered (Left–Right)`。它们使用 ELK Layered 的正交路由提示、模型顺序策略、layer sweep crossing minimization、two-sided greedy switch、straight-edge preference 与有界 thoroughness。
3. **布局与最终路由职责分离** — ELK 布局阶段只计算节点层级与坐标；最终边路径统一交给 Worker 中的完整路由事务。布局阶段不得先执行一次完整 HandlePicker/全局路由，再把结果清空后重复计算。
4. **轻量路由画像必须保留** — 延迟完整寻路只省略路径搜索，不得丢弃 `obstacleScope`、`obstaclePadding`、节点内走廊策略和正交渲染参数，否则会把本可一次通过的图推入昂贵 repair/finalizer 阶段。
5. **新布局仍遵守同一发布门禁** — 目标节点位置与候选边在屏幕外计算；只有精确路由补丁、端点 attached/anchored、正交、避障、严格交叉、overlap 与商业软质量均通过后才原子替换可见图。失败时保留旧图，不显示中间路径。
6. **端口侧由最终几何决定** — 分层布局默认沿主方向进出；同层边和横向跨度显著大于纵向跨度的远对角边改用左右端口，避免被固定 bottom/top 端口迫使绕外圈。
7. **性能验收必须绑定质量** — 同一图的冷/热布局分别记录节点布局、初始路由、repair/finalizer 与最终提交耗时；只有最终 route signature 和完整 hard report 等价时才能宣称提速。大图不得通过删除轻量画像、降低阈值或扩大超时制造表面性能。
8. **DomainDagre 收口稳定方向** — DomainDagre 保留已通过硬门禁的纵向域感知布局；多父节点、反馈环与跨域边密集图的横向入口由 ELK Layered LR 取代。不得为保留不稳定的菜单项而降低障碍、严格交叉或端点门禁。
9. **ELK 候选必须有独立安全回退** — 单段、有限、正交的 ELK section 可作为屏幕外的布局候选，先进入有界 measured repair；只有完整硬门禁通过才能直接提交。候选被拒绝时，必须从已清理的业务边重新生成独立几何 seed 并走原完整路由，不得用被拒绝的 ELK 路径污染回退基线；最终快照和补丁始终以未 seed 的业务图作为身份基线。
10. **预编译补丁必须自包含渲染契约** — 产物生成以 Worker 投影边为路由输入，但运行时会合并到未投影的业务边；因此 `type`、source/target handle、路径、tree intent、trunk intent 与有界 line-hop 质量身份必须完整写入 routing-only patch，不能因其在投影输入中“未变化”而省略。生成后必须用真实生产源边重放并逐字匹配 output route signature，禁止只验证 artifact 自身 schema。

## 验证标准

1. **以真实 SVG 几何为准** — 最终判断必须检查渲染后的 path/points，不能只看 worker metadata 或 peer group 信息
2. **至少检查四类失败** — 非正交线段、端点非正交进出、真实节点穿越、线线严格交叉
3. **区分节点和容器** — 检查避障时应过滤 title/group/subgroup 容器，避免把合法穿越泳道区域误判成节点穿越
4. **关注 dual-trunk 样例** — 回归用例应覆盖一条边同时是一对多和多对一的情况，并确认 source/target 两个共享主干都未被拆散
5. **输出视觉风险而不是静默通过** — 对容器穿越、节点近距、边间距不足、标签冲突、过度绕行、方向单调性破坏、无意义折返等软约束，检查器应给出 `warning`/`risk` 级别结果，即使硬约束全部通过
6. **区分允许 overlap 和误放行 overlap** — 同源/同目标重叠只有在靠近共同端点、存在 buddy group、或明确为 bus trunk 时才算允许；远离共同端点的长重叠必须进入 review
7. **报告原因链** — 软约束告警应说明为什么没有当作硬错误，例如“穿越的是 subGroup 容器，不是业务节点，但跨越了无关子域 320px”
8. **dual-trunk edge 回归** — 至少覆盖一条边同时属于 O2M 和 M2O 的场景，确认它保留两端端点/方向，同时允许中间 lane 为减少交叉或共享段而移动；crossing bridge/line-hop 另按交叉渲染用例测试，两个概念不得复用身份字段
9. **bus tap 顺序回归** — O2M/M2O 用例应验证同组分叉/汇聚点没有空间顺序反转；如果顺序反转导致同组分支穿插，应视为路由质量失败
10. **保留非语义边界** — 当前检查只评估几何和视觉质量，不因业务含义、流程阶段、节点职责等语义关系直接报错；这类规则以后单独建模
11. **交互稳定性回归** — 至少覆盖“只选中一条边/打开调试面板”这类非数据变更场景，确认其他边的 path、端口侧和缓存结果不发生变化
12. **截图问题要落到真实边 ID 和 SVG path** — 人工截图反馈应先定位到具体 edge、source/target 节点矩形和最终 SVG path，再判断是路由几何、渲染后处理还是交互态污染；不能只看 worker metadata 或蓝色选中效果
13. **选中态视觉控制层跟随最终 path** — 对被选中边，应检查可见端点圆点/热区和 SVG path 首尾点一致；如果不一致，即使主 path 正确也应视为交互态视觉缺陷
14. **象限端口回归** — 至少覆盖目标处于左下/右下/左上/右上且某一主轴明显占优的边，验证首选 source side 与主轴一致；阈值附近允许稳定性策略保留原 side。
15. **可消除端点肘弯回归** — 构造 `bottom -> short vertical -> long left`、`right -> short horizontal -> long up` 等路径，确认相邻侧候选能在不新增硬缺陷时减少一个 bend，并同步更新 handle metadata。
16. **bus 扇区拆分回归** — 同一 source 同时连接 left、bottom、right 三个目标时，验证只在同 side/sector 内共享 trunk，不因全局 O2M 身份把三组强行合并。
17. **性能与缓存保真回归** — 冷路由计时只覆盖生产最终候选入口，并同时断言全部硬质量指标；缓存回归还要验证路由补丁能合并到最新 Edge，且颜色、marker、className、交互状态和业务 metadata 不被旧结果覆盖。
18. **端点附着硬回归** — WMS 冷路由和全部标准图总门禁必须逐边断言首尾点位于 source/target 的当前实测边界；诊断至少输出 edge ID、节点 ID、handle 和最终 path。只断言正交、无交叉或无节点命中不足以发现飞线。
19. **相反流向角色分侧回归** — 至少覆盖同一节点 right 侧同时存在反馈入边与业务出边的图，验证 free/weak 入边能切换到 left 入干并消除反向 overlap；同时覆盖 `forbidden`/strong 端口不会被自动换侧。
20. **链式 junction 回归** — 至少覆盖同一路径连续遇到两根阻塞主干、相邻主干不足 `24px` 时拒绝候选、以及水平/垂直镜像三类场景；正式整图用例还必须验证 junction 候选不会制造新的无关共享段。
21. **端口约束来源回归** — 同一条边分别带 `runtimeHandleLock`、人工 fixed handle 和 forbidden policy，验证前者仍可按实际边界接受合法自动端口，后两者不能被自动换侧。
22. **冷启动单次计算回归** — 清空该 geometry signature 的最终路径缓存后加载标准图，记录 `workerPrewarm`、`workerStart`、`workerAbort`、`finalCommit`；必须满足 `workerStart=1`、`workerAbort=0`、`finalCommit=1`，并且提交结果通过完整硬门禁。节点测量期间允许多次更新待定输入，但不得计为 route start。
23. **热缓存可信层级回归** — 只有当前 JS realm 内生成、且 hard report 已绑定同一完整 geometry identity 的内存结果才允许 `workerStart=0`。来自 `localStorage`、快照或预编译产物的候选必须走一次 Worker `validate-or-route`，满足 `workerStart=1`、`workerAbort=0`、`fullRouteStart=0`、`finalCommit=1`；还要断言验证前 UI 为空、非法/陈旧候选在同一 job 内回退完整路由、业务和交互属性不被覆盖。
24. **增量评分全量 parity 回归** — changed-index 上下文至少覆盖零条、一条、两条和多条边变化，以及 source/target、共享主干意图和 path carrier metadata 变化；逐项断言其完整质量对象、候选排序和最终选择与全量评分一致。
25. **fixed-point 缓存失效回归** — 至少覆盖同一数组命中、逐字段完全等价的克隆数组命中，以及 computed path、edge id/source/target、source/target handle、人工端口侧、handle lock、port policy/constraint、quality intent、edge/node 顺序、节点 id/type/parent/位置/尺寸和路由版本的变化失效；还要验证 canonical key 不依赖 route hash、容量淘汰确定，正修复结果和本来零交叉的便宜早退不会被登记为 fixed point，非法、非有限或超大输入安全退化为 miss。
26. **同轴外侧包络回归** — 至少覆盖 `H→H`、`V→V` 镜像、局部平移会新增严格交叉的长反向无关 overlap，以及空路径、非有限坐标、超量路径点/节点和非法选项；断言外侧候选保留首尾轴向与端点、候选数有界，正式 WMS 用例的 overlap、严格交叉、障碍、stub、tiny dogleg 和 hairpin 同时为零。
27. **父子增量状态全量 parity 回归** — 至少覆盖深度 1–4、连续修改不同边、同一边重复修改、source/target/handle/共享主干 intent 变化、跨 context、重复/负数/小数/越界索引，以及未声明边引用变化；每一步完整质量对象必须逐字段等于全量 scorer，最终候选顺序和选择不得改变。
28. **阶段几何快照 parity 回归** — endpoint-lane 与 local-dogleg 快照至少覆盖空路径、非正交、端点相触、严格交叉、正反向 overlap、源/目标节点内嵌、容器过滤、NaN/Infinity 和大输入边界；索引路径与原始全扫描必须逐项一致，非有限输入必须验证 fallback。
29. **后处理空间安全回归** — 至少构造一个单边简化会穿无关节点、一个端点沿节点边界反向滑行、以及一个 compound cleanup 为清理 tiny dogleg 而需要联动移动 peer 的场景；断言不安全候选被跳过、搜索可继续命中次优安全候选，并且最终障碍、attached/anchored 与全部边质量硬字段同时不退化。
30. **增量分层安全距离回归** — 至少覆盖未出现在 `contextEdgeIds` 的冻结分支在 changed node 移动后进入 `<48px` 区域、恰好 `48px` 不提升、incident/mutable 边不重复提升、超过八条需提升时回退完整路由，以及 TMS/WMS/L-OMS 的大位移与吸附后小位移。断言被提升分支进入完整 transaction；安全候选存在时恢复 `48px`，端口几何无解时仍须满足 `>=16px`、零节点命中、零严格交叉、端点 anchored，并保持 incremental commit，不能退化成整图跳转。
31. **预编译首屏稳定性回归** — 从最终 production preview 加载标准图，必须断言 `routeResolution=validated-candidate`、`visibleRouteVariants=1`、`workerStart=1`、`fullRouteStart=0`、manifest/source hash/版本一致；随后从相同生产构建强制 full-route 重算，artifact、loader 和 manifest 必须逐字可复现。若生成后未重建导致 dist 仍包含旧清单，门禁必须失败。
30. **预编译路由产物回归** — 生成器必须在 production-preview 浏览器中等待稳定 geometry 和单次 final commit，再输出 routing-only patch；CI 至少验证 artifact schema、routing version、diagram/source hash、routing implementation source hash、32-bit lookup key、独立 canonical digest、output signature 和当前节点硬门禁。还要覆盖路由源码任一受控文件变化即失效、digest 碰撞保护、版本/字体或几何变化 miss、畸形/超量产物拒绝、惰性 chunk 加载，以及命中后不进入完整路由。production-preview 从导航开始采样全部非空 SVG path fingerprint，预编译命中只能出现一个最终几何版本；临时线、未验证候选或旧产物先上屏再被替换都必须失败。
31. **端口来源与精确身份回归** — 至少覆盖人工 compound handle、人工 fixed side、forbidden policy、路由器 runtime handle、可信 worker/预编译候选和不可信持久化候选；断言人工 exact ID 在同侧 normalize 后仍逐字符保留，固定/禁止端口不能换侧，runtime handle 只有在可信结果通过完整门禁时才能改写，并确认所有策略入口使用同一 policy 而不是直接写 handle 字段。
32. **路由 bundle 图分类回归** — 构建分类器至少覆盖 POSIX/Windows 路径、客户端动态可达、Worker 私有模块、循环依赖、缺失模块、重复 Worker、排除 Worker 入口和重复构建清理；生产构建须断言 Worker 静态闭包、共享 chunk 不包含 Worker 私有修复阶段、主题 chunk 不反向依赖路由共享 chunk，并在相同构建上运行总 bundle 与三次独立冷启动预算。
33. **交接前统一工程门禁** — 路由语义、缓存 schema、Worker 协议或 chunk 边界变化后，必须先通过无增量缓存的 `tsc --noEmit`，再通过项目 `typecheck` 增量基线、生产 build、bundle、预编译产物复现、统一 CI 入口与静态安全检查；不得只运行单个回归测试就宣称可以交接。冷路由 profile 必须基于与最终产物相同的 production build，且质量断言与计时在同一次样本中完成。
34. **固定缩放档视觉回归** — 标准图至少在 fit-all、`50%`、`100%`、`200%` 和两个代表性视口尺寸下截图并读取 computed style；分别断言可见线宽、必要边对比度、箭头可见性、标签 LOD 和节点/标签遮挡。截图用于发现问题，数值与 DOM/SVG 检查用于形成门禁，二者不能互相替代。
35. **共享主干视觉身份回归** — 至少覆盖 source trunk、target trunk 和同一 dual-trunk edge 同时属于两类 trunk 的场景；默认态每段合法 trunk 只出现一条 group-owned canonical base backbone，不因成员数、render host 或 marker carrier 改变颜色、opacity 或线宽。选中任一成员边时可以叠加临时高亮，但不得拆主干、继承成员状态、覆盖另一端身份或改变其他成员 path。
36. **标签归属与 LOD 回归** — 在总览和编辑缩放下检查每个可见标签的 owner path、最近无关边、锚定段长度与屏幕字号；缩放跨过 LOD 阈值时，标签优先级和显隐结果必须确定且无抖动。隐藏标签仍应能通过 hover/focus 或可访问名称找到对应边。
37. **完整追线交互回归** — hover、键盘 focus、点击 selected 分别断言 `tracePathCoverage=100%`、`traceMarkerCount=0`，并验证整条 path、edge wrapper、label 与 source/target 端点获得一致反馈；密集图中还要验证无关边视觉竞争被抑制。按事件 timestamp 到首个完整 trace paint 计时必须 `<=100ms`；交互前后 route signature、handle、trunk identity、canonical base 全部视觉属性和 hard report 必须完全不变。
38. **交叉桥接与方向回归** — 对允许保留的软例外交叉，断言稳定生成 jump/bridge/gap，且桥接优先级在重载、缩放和导出后不反转；同时验证箭头和中途方向提示在 fit-all 中不被桥接、标签或裁剪遮住。
39. **主题与导出视觉回归** — 浅色、深色和高对比主题分别计算必要连线的最不利对比度；PNG/SVG/PDF 导出逐项检查主干层级、junction、桥接、箭头和标签背景。导出产物必须在没有 hover/selected 状态时仍能独立追线。
40. **输入转换与渲染保真回归** — 同一组带显式 edge type/style/marker 的标准数据必须分别覆盖“有保存坐标”和“无保存坐标”两条转换分支，并贯穿自动布局、Worker、缓存命中、stable path、主题切换和导出。逐边断言 role/type、颜色、线宽、dash、opacity、marker 与 label priority 未被静默丢失；缺失字段才允许落入已记录的主题 fallback。
41. **算法/产物/DOM parity 回归** — 对每个标准图，从同一 production build 依次取得当前算法候选、预编译 artifact 合并结果和最终 SVG path/computed style；逐边比较 route signature、端口顺序、source/target trunk 身份、dual-trunk identity、marker 与视觉样式。浏览器结果与模型或 artifact 不一致时必须失败并输出最小 diff，不能只重新录制截图或只更新测试期望。
42. **不安全同侧交换的相邻侧回归** — 至少构造一个 anchor 直接交换会新增严格交叉的同侧倒序组；断言交换候选被 hard gate 拒绝，`free/weak` 支路可改走相邻侧并局部重连，最终按“实际同侧分组”统计的 inversion、ambiguous tie、collapsed pair 均为零，同时 `strong/fixed` 与人工 exact handle 保持不变。
43. **canonical trunk 原子性与 marker 唯一性回归** — source、target、dual-trunk edge、嵌套 trunk 和跨语义 trunk 都要验证：非法/孤立 hidden range 整体 fail-closed；默认态每个公共区间只有一条 group-owned canonical base；每个真实 canonical 端点只有一个 marker；任一成员 hover/focus/selected 只增加 markerless trace；SVG/PNG/PDF 导出保持同样计数和样式。render host/carrier 轮换前后 base 像素与 identity 必须一致。
44. **最终像素 opacity、carrier marker 与交互基线回归** — 分别组合 stroke/fill RGBA、`stroke-opacity`/`fill-opacity`、element style、CSS class、祖先/group opacity，以及 filter/mask/blend 有无两类路径，按最终合成像素计算连线与 marker 对比度；使用 filter/mask/blend 时必须走 raster sampling fallback。分别断言 `edgeStrokeContrast`、`markerFillContrast`、`markerBoundaryContrast` 和 `markerTipVisiblePixels`。marker-only carrier 的 path/interaction underlay 必须保持不可见，但 canvas marker halo 与导出一致且达到阈值。hover、selected、keyboard focus 前后逐属性比较 canonical base，确认不继承成员 state/opacity、不改色、不 peer-dim、不重复 marker，仅新增并移除完整的 markerless trace。
45. **render-only plan 生命周期与覆盖回归** — 注入旧版、schema/version 不匹配、重复 `groupId`、owner/host/carrier 缺失、跨帧 stale `pathRevision`、hidden range gap/越界/重叠归属冲突，逐项断言整组 fail-closed 并恢复原始可见边；合法计划逐段满足 `hiddenRangeCoverage=100%`。同时证明 plan 不进入 Edge 持久化字段、localStorage、导入导出、预编译 artifact、跨帧 cache、Worker message 或 replay。
46. **商业布尔门禁聚合回归** — 为 perceptual、interaction、multi-scale 的每种 blocker 各注入一条 warning，断言只要对应集合非空就令 `perceptualClean`、`traceable` 或 `multiScaleClean` 为 false，且 `commercialClean=false`；再覆盖带 `blockingFor: []` 与 `nonBlockingReason` 的解释性 warning 不阻断，以及未知/缺少分类的商业 warning fail-closed。
47. **严格阶段端点单调回归** — 构造一个能把 strict crossing 从 `1` 降到 `0`、却会让另一条边的 source 或 target 从 attached/anchored 退化的候选；`finalized` 与 `continue` 出口都必须逐角色拒绝，并继续选择不退化端点的次优候选。
48. **tiny dogleg 精确阈值回归** — 同时覆盖 H-V-H、V-H-V、水平/垂直镜像以及 `12px`、`23.8px`、`24px`；断言前两者被压平或扩至合法阈值，`24px` 不被误报，并覆盖“压平到 source/target trunk”与“只能扩宽跨接段”两类结果。
49. **dual-trunk 顺序与幂等回归** — 对同一边分别执行 source→target、target→source 与重复修复，逐项断言最终 path、source/target membership 集合、common stem、hidden ranges 和 canonical stroke 数完全一致；同一物理区间兼容时可见 backbone 恰为一条。
50. **主干容差与原子产物回归** — 坐标偏差覆盖 `0/3/4/4.01px` 和“坐标接近但前缀断裂”，并断言 scorer、repair、overlap exemption、render plan 结论一致；随后从同一 production build 连续生成两次全部标准 artifact，验证 manifest/loader/artifact 无孤儿文件且第二次字节级零差异。
51. **兄弟端点绝对避障回归** — 分别覆盖 O2M 的 sibling target、M2O 的 sibling source，以及同一条被修边同时属于 source/target 真主干的 dual-trunk 场景；使用浏览器实测节点尺寸和边界构造“共享主干合成后刚好穿入兄弟节点”的样例，逐段断言节点命中为零、两端 true trunk 不缩短、端点 attached/anchored、严格交叉/异常 overlap/tiny dogleg 不增加，并验证 selected/hover/focus trace 与最终 SVG path 完全一致。
52. **正逆向端口束事务回归** — 使用 production-preview 实测几何保留一组“正向 sibling source trunk + 逆向 sibling target trunk + through-edge”的完整图，先证明单边外移必然在下游产生新交叉，再断言线束事务一次提交后 `inversions/ambiguousLaneTies/collapsedLanePairs/nodeHits/strictCrossings/reverseOverlap/unrelatedOverlap/unexplainedRelatedOverlap/tinyInteriorDoglegs/unsafeEndpointStubs` 全部为零。还要逐组比较修复前后的 true trunk edge 集合与 common stem，验证双角色边的 source/target 主干均未缩短，并对候选顺序和重复执行做确定性、幂等检查。
53. **真主干接点像素与拓扑回归** — 至少覆盖简单 source trunk、简单 target trunk、嵌套 trunk 和 dual-trunk edge：每个 interior common-stem boundary 恰有一个 canonical junction，坐标与最终 SVG path 的真实 tap 完全一致，端点本身不重复画点；非 owner 成员、重复计划和 selected trace 不得增加 junction 数。Logistics 正式图需锁定 L-OMS 源主干分叉与 DATA 目标主干汇入两个截图反馈点，并在 canvas 与 SVG 导出中验证圆帽、线宽、颜色、对比度和数量一致；普通严格交叉不得生成 junction。
54. **逆向线独立交叉回归** — 至少构造“逆向 through lane 穿过无关正向 source bus”“逆向边合法汇入同目标 trunk”“逆向边同时属于另一端真主干”三类场景；前者必须重路由或桥接且不得生成 junction，后两者只能在公共 stem 边界生成一个 owner junction。Logistics 正式图需逐段断言 DATA→下游逆向竖线与 DATA 正向汇入主干间距 `>=48px`、与全部无关正向横线严格交叉为零，并锁定其顶部同目标 target-trunk junction；端口、节点避障、dual membership 和导出像素同步验证。
55. **首选源主干恢复回归** — 至少覆盖“三边线束中一条被后处理换到错误侧”“远端投影超出线束包络的合法独立侧通道”“缺少可信 source-authored 快照”三类场景；分别断言前者恢复为 `>=70px` 的真实公共 stem 且保留全部 target suffix，后两者保持原样。正式 Logistics 图还须锁定 WMS 的 BMS/visibility/WCS 三边共享 source trunk、L-OMS customs 保持 right-side corridor，并验证恢复前后节点命中、严格交叉、异常 overlap、tiny dogleg、端点附着与双端主干身份均不退化。
56. **浏览器性能样本必须隔离且可回收** — 每个首屏或拖拽性能样本必须在固定桌面 viewport、全新的临时浏览器 profile 和同一 production-preview build 中独立运行；不得复用上一用例写入的 `localStorage`、IndexedDB、session state、节点位置或内存路由缓存，否则后续样本会把持久化串扰误报为冷启动性能。每个样本同时记录预编译候选验证时间、`releaseToFinalMs`、`workerToFinalMs`、local-route 时间、mutable/affected edge 数、Worker start/abort、fallback 和完整 hard report；`releaseToFinalMs` 必须使用页面记录的 `finalAppliedAt - mouseReleasedAt`，不得用验证器轮询观察时刻代替。当前 Logistics production-preview 参考门禁为：预编译首屏 `<=750ms`、释放到最终提交 `<=1000ms`、Worker 到最终提交 `<=750ms`、local-route `<=250ms`。性能通过不能抵消节点命中、交叉或主干退化。验证器结束后必须关闭其浏览器、调试端口和临时 preview，并确认监听端口已释放，禁止留下长期后台进程。
57. **主干后分支逐边避障回归** — source/target/dual trunk 合成、延长或换轴后，必须重新审计每条成员边离开公共 stem 之后的完整 branch suffix/prefix，不能只检查靠近端口的首个分支段。多边事务不得用全图 obstacle 总数相互抵消：任一 changed edge 的节点命中数都不得高于该事务基线；主干改善一处不能换取兄弟分支新增一处穿节点。若分支需要绕障，必须在保持 source/target true-trunk edge 集合、common stem、端点 attached/anchored 以及严格交叉/异常 overlap/tiny dogleg 不退化的前提下逐边提交；无法安全闭合时应拒绝主干候选，而不是保留穿节点支线。回归至少覆盖深层水平/垂直分支、O2M/M2O 镜像、dual-trunk member 和 mutable closure。
58. **最终 SVG 障碍门禁不得信任上游布尔值** — production-preview 浏览器验收必须直接读取每条边的完整最终几何：共享主干边优先读取 `.shared-trunk-edge-interaction`，其次读取完整 accent trace，普通边才读取 `.react-flow__edge-path`；禁止把 DOM 中排在前面的 semantic fragment、junction 或 marker carrier 当作整条边。使用 SVG screen transform 转为视口坐标，并逐段或按不超过 `2px` 的屏幕步长采样，检查是否进入任一非 source/target 的真实业务节点内部；title/group/subgroup 容器必须过滤。`hardClean=true`、Worker phase accepted、route signature 一致或路径条数正确都不能替代这项检查。普通模板 URL 与预编译 capture URL 都要覆盖，首次提交及代表性增量拖动后重复执行；selected/hover/focus 的可见 trace 和交互热区还须与基础 path 使用同一 `d`。失败报告必须包含 `edgeId`、`nodeId` 和首个命中屏幕坐标。production preview 重建后已打开页面不会热替换旧 JS，因此人工截图复核前必须刷新页面；但刷新要求不能替代自动 DOM/SVG 门禁。
59. **超长主干不得把历史长度误当成语义身份** — source/target/dual true trunk 的共同端点、角色、side/sector、成员集合和最小 `48px` 公共 stem 属于硬保护；某次候选偶然形成的超长公共段不是永久锁定资产。当该公共段迫使成员边离开业务容器、跨越多个空白走廊或形成“短横移—长平行段—短横移”的阶梯式外绕时，应枚举节点包络之间的内部安全 corridor。候选通常必须缩短总长与 detour；若当前成员已经分布在最近合法 corridor 的数值容差附近，可在不超过 `128px` 的有界总质量预算内先归一化并标记该 corridor，防止后续 `192px` 软净空偏好把整束重新推回远端外圈。无论哪种路径，逐边障碍命中必须为零，硬交叉/异常 overlap/tiny dogleg 不得增加，端点 attached/anchored 不得退化，且原 source/target/dual 主干成员仍共享不少于 `48px` 的真主干；不得为了保留历史 stem 最大值或追逐软净空最大值而固化肉眼明显的冗余台阶。
60. **后置恢复不得重新打开已关闭的端口缺陷** — preferred/authored trunk 恢复、商业绕行压缩、端点重锚和渲染模式提交都属于可能改变最终几何的后置阶段；任何阶段执行后都必须重新验证同侧端口 inversion、ambiguous tie、独立块最小 `12px` 间距、逐边节点命中、严格交叉和 source/target/dual trunk 身份。合法真主干块应作为原子锚保留，邻近独立分支优先单独移开；不得因为“主干已经恢复”而跳过端口排序，也不得在最终质量闭包之前写入 finalized/cache 标记。回归必须覆盖“多边真主干 + 相距 8px 的独立分支”、远端顺序并列、恢复前已 clean、恢复后重新 collapsed，以及第二次执行幂等。
61. **输入身份不得混入路由器生成的渲染状态** — 最终事务把普通边切换为 `stablePath`、写入 computed path 或增加 render lock，均属于路由输出，不得反过来改变下一轮的原始输入 identity；同一节点几何、业务拓扑、人工端口约束和质量意图的已 final 结果再次进入管线时必须按引用幂等复用。`canvas-ref` 等专用 renderer 仍须保持独立身份，节点位置/尺寸、source/target、人工 handle、lock、policy/constraint 或 routing version 变化必须可靠失效。回归至少覆盖 renderer swap 等价、专用 renderer 不等价，以及已 final 结果二次调用不分配新 edge 数组。
62. **布局快捷路径与完整路径必须共享同一端口语义** — 无容器、单域、小图等布局快路只能省略与当前拓扑无关的昂贵阶段，不能另行实现或跳过 interactive 端口选择、人工 handle 锁、正逆向分区、O2M/M2O 主干合成和最终端点门禁。所有入口必须调用同一个可测试的端口准备模块，并基于当前最终节点对象重建 `nodeById`，不得复用布局前的旧对象索引。回归至少覆盖同一反向边分别经过快捷路径与完整路径时得到等价的 source/target side、首尾方向和主干身份，同时验证自动生成的默认 bottom/top handle 可被当前几何纠正、人工 exact handle 保持不变、缺失端点安全且确定性降级。
63. **同源短分支应优先借用安全兄弟主干** — 当 O2M 中一条短分支的内部横段切穿另一条同源边的竖向 spine 时，不能把它当作共享端点接触放行，也不应直接把分支送往全图外圈。对 `free/weak/auto` 端口，应有界枚举“切换到兄弟 source side → 精确复用其同向公共前缀 → 在目标投影处形成一个正交 tap → 沿原 target side 接入”的原子候选；只有整条候选同时满足逐边节点命中为零、严格交叉为零、异常 overlap 为零、端点 attached/anchored、既有 source/target/dual true trunk 不缩短时才能提交。严格交叉豁免只适用于两边 segment 0 在同一真实 source 点形成的拓扑 T-junction，或两边最后一段在同一真实 target 点形成的汇聚；任何内部 segment 的相交仍是硬交叉。回归必须包含短分支与长兄弟 spine、兄弟主干本身兼具 target trunk 身份、人工 fixed 端口拒绝切换，以及候选顺序打乱后的确定性结果。
64. **跨域反向分支不得被源主干重新吸收** — 主干合成后若某成员的目标中心位于源主干反向半球、目标在源容器之外且该边同时属于一个多对一目标束，应把它识别为 dual-role reverse branch。优先从面向目标的相邻源侧离开，在源容器外侧使用由真实容器边界和节点包络推导的有限走廊，并完整保留既有 target-trunk suffix；随后必须再次执行逐边障碍、端点、严格交叉、异常 overlap 和 source/target trunk 身份门禁。该分支分离应在共享主干提交之后再次受控执行，防止后续 source-trunk synthesis 把它吸回错误侧；授权只作用于带明确分离证据的 removed edge，不能允许任意真主干缩水。
65. **强制全量重算必须隔离所有可复用路线源** — 预编译路线生成、修复录制和显式 `forceFreshFullRoute` 不能只跳过静态 artifact；同一请求还必须绕过已提交 snapshot、持久化 display cache、内存 route cache 和 incremental baseline，且 capture 只能接受 `operation=route`、零 `candidateEdges`、完整 route resolution 的响应。否则“重新生成”会把旧路线自举为新 artifact，版本号和文件时间虽变化，穿节点、错误端口和小拐点仍会永久固化。回归需分别注入四类旧候选并证明它们不会进入 capture，同时验证正常交互请求仍可复用安全缓存。
66. **标签避障必须消费与连线相同的业务节点快照** — 标签不能只避让自身路径和其他边；画布应基于已测量绝对坐标一次构建、共享业务节点矩形，标签候选同时评估 own-path、peer-path 与 node clearance，容器和不可见节点按连线障碍规则过滤。不得让每条边独立扫描全量节点，也不得通过缩放后隐藏所有标签规避碰撞。production-preview 必须在 fit-all、`50%/100%/200%` 逐个检查可见标签与节点相交为零，失败输出 `edgeId/nodeId/priority`。
67. **增量严格交叉可按证据动态提升上下文边** — 节点移动后的 incident closure 若只剩严格交叉，而交叉另一端位于只读 context，不得立即退化为全图重算，也不得越权开放全部 context。只把实际 strict-crossing hit 直接涉及的 context edge 加入同一原子 mutable transaction，随后运行有界 residual closure、逐边 `48px` 商业净空和完整 hard gate；其余边保持引用冻结。动态提升失败才允许 full fallback，并必须记录 mutable/affected 数、fallback level 与阶段时延。
68. **分支避障不得以缩短端口段或制造微折线换取净空** — 当目标/源主干的长直段靠近业务节点时，不能简单平移整段后把端口 stub 压到 `<48px`，也不能用 `<24px` 的“移出—回归”小台阶假装完成避障。应在障碍物安全包络外使用局部绕障槽：离开与回归腿均不少于 `24px`，穿越障碍投影的主绕行段保持 `>=48px` 节点净空，并在离开障碍包络后恢复原端口干线，使 source/target attached、anchored 与原 true-trunk suffix/prefix 不退化。增量事务的 `48px` 商业净空复核必须覆盖所有 incident mutable edge 及动态提升的 context edge，不能只检查后者；移动节点导致兄弟分支从安全距离降到 `16–48px` 时，即使仍为 hard-clean 也不得直接提交。若局部槽与严格交叉冲突，顺序必须是“净空候选 → 端口门禁 → strict residual closure → 最终逐边净空复核”，任一步失败都拒绝整笔事务。
69. **大图微拐点搜索必须有界且保留车道多样性** — `>32` 条边时，单边微拐点候选的完整图质量评分上限为 `36`；候选集合必须同时保留基础视觉排序、水平/垂直两端包络极值和共享主干候选，不能只截取最短路径。该上限只减少重复候选评分，不放宽节点避障、端点、严格交叉、异常 overlap、`24px` tiny dogleg 或 true-trunk 门禁；生产性能样本必须在同一最终 route signature 下比较，若更小预算导致后续闭合变慢或改变路线则必须回退。
69. **阶段诊断必须贯穿同一条路由上下文，重算语义不得解除安全预算** — `candidate-validation → seed → quality → post-render → strict → terminal → final hard gate` 的聚合 trace 回调必须随 route context 透传到所有子阶段，不能因模块边界丢失而形成看似“跳转”的诊断空洞。强制全量重算负责绕过旧 artifact、snapshot、内存 cache 与 incremental baseline，但不得因此解除 bounded seed 和质量阶段的收敛预算；性能优化必须基于各阶段实测耗时与 hard-clean 结果。trace 只记录时延、候选数、变更数和结果枚举，不记录节点、边、标签或路径内容。
70. **终结链只能复用同请求、同路线签名的精确证据** — `final endpoint order → commercial detour → final safety closure` 必须共享一个 request-local evaluation context，复用 hard report、端口顺序、通道顺序和 stub 审计；不得在相邻模块中对未变化的路线重复全图扫描，也不得复用跨请求或几何已变化的结果。strict-crossing 热循环应为同一 segment snapshot 只构建一次横/纵轴索引，候选仍逐一执行完全相同的垂直相交判定并保持命中顺序。只有 hard-clean、端口段安全、无顺序缺陷且无近主干机会的候选才能走闭包快路径，其余必须保留完整 final safety closure。
71. **严格交叉索引必须按坐标范围裁剪且保持全扫描 parity** — 同一 segment snapshot 的水平段按 `y`、垂直段按 `x` 建立稳定索引；候选只扫描落在另一轴开放区间内的垂直段，并继续执行原始 strict predicate。索引不得改变 source segment 顺序、命中 pair 顺序、`0.5px` 端点容差或同边排除语义；回归必须覆盖乱序坐标、端点阈值、正反向路径和逐边 crossing count 与全量双循环逐项一致。候选修复器已经创建的索引必须显式传给所有当前/候选评分，禁止默认参数在热循环中反复重建。
72. **规范预置验证必须与可编辑 autosave 隔离** — production-preview、预编译 capture/regenerate 和人工 canonical 验证必须显式携带与活动 route 完全匹配的有界 preset ID；匹配时从标准预置装载，不读取用户 autosave，也不得把验证画布回写 autosave。普通 URL 必须继续恢复用户编辑，验证模式不得删除或覆盖原数据。重复、错配、超长或非法控制参数一律 fail closed。浏览器验收报告必须证明实际挂载节点/边来自 canonical preset，不能只根据 URL、标题或 route signature 推断。
73. **外圈台阶消除必须拥有独立有界预算** — 商业软质量阶段应先按超额路径长度排序，对每条候选分别评估保留 source/target stub 的两种正交直接投影，再进入配对换端口、lane nudge 或 obstacle skirt 扩展。一个被阻挡投影不得耗尽整条边的预算并饿死另一个安全投影；每次提交仍必须通过全图节点避障、严格交叉、端口附着/轴向、同侧顺序、真主干成员和总长/detour 非退化门禁。较宽的软净空修复必须先于台阶压缩执行，台阶压缩作为该分支的后置抛光；后续阶段不得仅凭更大的软净空把已经满足 `48px` 商业净空且更短的结果恢复为历史外绕，确需覆盖时必须证明逐边硬质量严格改善。回归应覆盖“硬质量已 clean 但外圈仍存在可安全删除的两折台阶”，并断言完整 Worker 流水线重复执行后仍保持同一路径。
74. **大图候选笛卡尔积必须在实体化前限界** — 端口、终端轴、外侧 lane 与 trunk 的组合搜索，在 `>24` 条边时不得先展开全部 `lane × trunk` 再排序截断；应先按当前端点/主干距离保留最近坐标，同时保留两侧全局极值以维持真正 outer-skirt 逃逸能力，再生成候选。显式 full-quality 只表示不能降级为 fast 质量，并不解除 bounded seed 和候选预算；force 标志必须从 Worker 请求贯穿 seed 与 quality budget。小图保留完整搜索，大图回归同时断言零严格交叉、零异常 overlap、零节点命中、端点 attached/anchored、真主干不退化与冷路由预算，不得通过降低质量或提高超时换取性能。
75. **商业缩短候选必须公平入围、逐笔累积且稳定化不反弹** — terminal-preserving 直接投影、节点外侧 full-span skirt 和需要联动端口/阻塞边的原子变体应分层分配有界预算；不得让第一个投影的全部派生变体耗尽单边预算，也不得让更短但穿节点或贴近节点的候选在截断前挤掉满足商业净空的候选。等价路径应在昂贵全图评分前去重，候选预排先比较精确节点命中，再比较商业净空风险、长度与弯折。多条边都存在安全缩短时，后续候选必须以当前已验收图为基线累积，并把此前所有 changed indexes 纳入精确增量质量与逐边避障门禁；不能每条边都从初始图重建、最终只保留收益最大的一条。商业修复后的 endpoint/trunk 稳定化只能以“上一轮已验收结果”为 preferred baseline；中间阶段若恢复历史外绕，终结阶段必须重新执行同一有界商业修复并通过完整 hard gate 后才能锁定或写入预编译产物。回归至少覆盖两个可同时缩短的外圈台阶、其中一个需要 full-span 节点 skirt、合法 source/target/dual true trunk 保持、第二次执行幂等，以及完整 Worker 最终结果不恢复旧路线。
76. **预编译路线的运行时验收必须幂等** — 已通过精确 hard/commercial 门禁的预编译候选，在容器边界与最终安全检查没有改变几何时必须逐边原样返回；不得仅因为历史 preset 走廊同样 hard-clean 就覆盖较短候选。若容器边界闭包确实改变候选，结果必须进入与实时 full-route 相同的有界商业稳定化序列，并在终结阶段重新缩短受影响分支，不能停留在合法但更长的临时外绕。回归必须把 production WMS 新鲜路线再次作为预编译候选执行，断言 e13 的正坐标安全走廊不会被恢复成旧的负坐标外圈台阶，同时保持节点命中、严格交叉、端点和真主干门禁不退化。

## 布局与路由组合边界

布局命令必须显式区分“全图节点布局”“可组合域布局”和“固定域布局”，不能让工具栏状态暗示一个实际未执行的组合：

1. **全图节点布局** — Tree、Force、全图 ELK 以业务节点为唯一布局对象，激活期间可隐藏生成的域/子域容器；切回域布局时必须从语义数据重新生成容器，不能永久删除分组。
2. **可组合域布局** — DomainVertical、DomainHorizontal 负责域/子域放置，并消费用户选择的 Flow、Grid、Horizontal、Vertical 或 Dagre 域内节点排布；工具栏可以同时展示两层选中状态。
3. **固定域布局** — DomainDagre、Domain ELK Compound 和有序域泳道拥有自己的域内排名模型，不得继续展示或记忆为“当前正在应用”的第二个节点排布；用户从节点排布菜单选择新算法时，应切换到对应方向的可组合域布局。
4. **循环域拓扑** — 当域级 quotient graph 存在反馈环或同一域在业务流程中不连续时，默认拓扑分层不得静默改写用户选择或反复重试。显式有序域泳道应按 `domainOrder`（无配置时按稳定扫描顺序）在业务流的交叉轴上放置容器：LR 流使用上下堆叠的水平泳道，TB 流使用左右堆叠的垂直泳道；跨域反馈边只参与后续正交路由，不参与顶层域排名。
5. **切换事务** — 布局计算、域容器恢复和最终连线路由必须作为一个有界事务提交；硬质量门禁失败时保留旧画布，并且状态栏只能显示实际成功提交的策略。

## 行业依据

- yFiles `OrthogonalEdgeRouter`：端口候选、路径长度、弯折、交叉成本和 monotonic restriction 共同参与候选选择；端口不是渲染后的附属属性。<https://docs.yworks.com/yfiles/doc/api/y/layout/router/OrthogonalEdgeRouter.html>
- yFiles `RouteCorrectionPolicy.LOCAL_ORTHOGONAL`：端口移动后在局部区域正交修正，区域外路径保持不变，适合性能敏感的端点侧切换。<https://docs.yworks.com/yfiles-html/api/RouteCorrectionPolicy/>
- ELK Port Constraints：区分 `FREE`、`FIXED_SIDE`、`FIXED_ORDER`、`FIXED_RATIO`、`FIXED_POS`，可用于映射 free/weak/strong/fixed 端口策略。<https://eclipse.dev/elk/reference/options/org-eclipse-elk-portConstraints.html>
- yFiles `EdgeRouter` / Label Placement：支持 source/target edge grouping、bus backbone、标签感知路由和独立/集成标签布局，说明主干与标签都应是路由系统中的一级对象。<https://docs.yworks.com/yfiles-html/api/EdgeRouter/> <https://docs.yworks.com/yfiles-html/dguide/label_placement/>
- yFiles `BridgeManager` 与 GoJS `JumpOver` / `JumpGap`：成熟图形组件会给不可避免交叉提供桥接语法，而不是直接叠画两条实线。<https://docs.yworks.com/yfiles-html/api/BridgeManager.html> <https://gojs.net/latest/api/symbols/Curve.html>
- WCAG 2.2 `1.4.11 Non-text Contrast`：理解图形所必需的线条属于 graphical objects，目标对比度至少为 `3:1`；连线应按最终相邻背景和状态分别测试。<https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast>

## 检查输出建议

检查器输出建议分为三类，避免把视觉问题混进硬错误里导致误修：

1. `error` — 违反硬约束：非正交、端点非正交进出或逐角色 attached/anchored 退化、真实节点穿越、普通严格交叉、反向/无关/未解释 overlap、`<24px` tiny interior dogleg、hairpin、共享主干被破坏。
2. `warning` — 视觉软约束风险：容器视觉穿越、节点近距、边间距不足、绕远异常、方向单调性破坏、标签冲突、默认态对比度不足、标签归属不明、LOD 密度过高、主干重复叠画或缺少交叉桥接。
3. `info` — 合法但需解释：允许的 O2M/M2O 主干重叠、为避障而走外侧通道、为消除交叉而增加长度。

每条结果至少包含：

- `edgeId`
- `rule`
- `severity`
- `reason`
- `measuredValue`（如距离、长度比、穿越容器长度）
- `relatedNodeIds` / `relatedEdgeIds`
- `isHardConstraint`
- `qualityLayer`（`geometry` / `perceptual` / `interaction` / `multi-scale`）
- `blockingFor`（可阻断的质量层数组；空数组必须同时提供 `nonBlockingReason`）
- `nonBlockingReason`（仅解释性 warning 使用，不能替代 blocker 修复）
- `viewport` / `zoom` / `theme` / `visualState`
- `expectedVisualStyle` / `actualVisualStyle` / `fallbackReason`
