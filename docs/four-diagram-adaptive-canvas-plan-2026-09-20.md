# 其余四类图的内容自适应画布实施方案

日期：2026-09-20。状态：待确认的设计方案，未实施、未创建执行 Goal、未提交或推送。

2026-09-21 更新：本文件保留为历史调研与复现记录；完整四类交付范围、后续设计修订和验收以 [四类自适应画布 Goal](./codex-goal-four-diagram-adaptive-canvas.md) 为准。两份文档均未授权或启动实施。

## 结论与范围

建议先补齐四类图的「完整内容 → 有限画布」能力，再按实际需求解除布局槽位限制；不要复制四份 Workflow 约束编译器。

本轮依据为 `labs/adaptive-workflow-canvas-pilot` 的 `476729736775b308b50cbe404bc1b84c8f674516`，不是对最新远端 dev 的结论。实际实施前重新核对目标基线及相同最小样例，避免重复实现已经合入的能力。

目标分开验收：

- A：合法、已经排好的内容不会仅因隐式画布太小而要求 Agent 修改坐标或删除内容。
- B：更多行、阶段、参与者、状态槽位有可扩展的布局规则。A 不自动完成 B。
- C：完整内容可浏览、可定位、可导出。复用共享 Viewer，但必须增加四类大图实测。
- D：真实任务的校验返工耗时下降。独立测量，不能由 A/C 的通过推导。

历史 [Workflow 试点报告](./adaptive-canvas-workflow-compiler-pilot-report-2026-09-18.md) 的机器 A/B 仅约 0.6% 差异，未支持显著提速，也没有真实 Agent 配对实验。本方案重开的是有复现依据的正确性与大图容量设计，不撤销该报告的性能结论。

## 1. 现状核对

| 类型 | 当前真实能力 | 首期缺口 | 更大规模的独立障碍 |
| --- | --- | --- | --- |
| Architecture | 未写 `meta.viewBox` 时，已有组件、边界、关系标签和图例驱动的自动尺寸 | 自动尺寸未完整覆盖外绕路径；需统一实际绘制范围、线宽和箭头范围 | grid 的列数上限为 12；行可增加，也可用显式 `pos`；不是自动排版 |
| Dataflow | 默认 `940×720`；节点按 stage、row、yOffset 定位 | 内容、路由、标签、图例与 stage 背景框的尺寸决策解耦 | stages schema 最多 5 个；renderer 只接受 row 0..4（schema 的 row 本身无最大值） |
| Sequence | 默认 `920×760`；fixed 列距；spread 按画布分配列宽 | 从参与者和时间轴内容推导宽高；处理 spread 对宽度的反向依赖 | 消息必须写像素 y；扩高不自动解决消息间距或自动排时序 |
| Lifecycle | 默认 `980×660`；固定三条带，状态可用 yOffset | 状态、转移、标题、主轨道和图例的完整范围 | main 只有 5 列；event/terminal 各 3 列；所有其他 lane 共用 event 带；lanes 最多 4 个 |

主节点集合没有 `maxItems` 不代表已有无限布局容量。Lifecycle 当前是 phase map，不是具有任意嵌套状态的通用状态机；本方案不假设它已经支持嵌套状态。

源代码入口：

- [Architecture 自动尺寸](../archify/renderers/architecture/render-architecture.mjs)：`autoViewBoxFor()`、`buildLayoutReport()`。
- [Dataflow](../archify/renderers/dataflow/render-dataflow.mjs)：`viewBox`、`rowYs`、`stageFrame()`、`pathFor()`。
- [Sequence](../archify/renderers/sequence/render-sequence.mjs)：`columnFit`、`messageLabelBox()`、`segmentLabelBox()`。
- [Lifecycle](../archify/renderers/lifecycle/render-lifecycle.mjs)：`bandFor()`、`measureState()`、`lifecycleAreaBottom()`。
- [共享图例](../archify/renderers/shared/legend.mjs)：已有 `legendFootprint()`、`measureLegend()`，不要另写图例尺寸公式。
- [CLI](../archify/bin/archify.mjs)：当前 `validate --layout-json` 只接受 Architecture / Workflow。
- [Viewer](../viewer/reader-layout.js)、[导出](../viewer/export.js)：已有共享大图判断、相机和栅格预算预检，不另建四套。

### 本次最小复现

均在上述 head、Node v22.23.1，经公开 `render` 命令执行；不是浏览器目检或交付验收。样例使用 standard、短标签、隐藏图例以隔离容量因素，正式验收必须补充图例与 showcase。

| 样例 | 当前结果 | 仅增加显式 viewBox 后 |
| --- | --- | --- |
| Architecture 两节点，bottom-to-bottom via 延伸至 y=1000 | render 成功，SVG 仅 `0 0 480 208`，但路径仍包含 y=1000，静态证据表明路径超出根画布 | `600×1200`，路径坐标完全相同且落入画布 |
| Dataflow 节点 row=4、yOffset=500 | readable area 越界，退出 1 | `1100×1300`，退出 0 |
| Lifecycle main col=4、yOffset=650 | lifecycle area 越界，退出 1 | `1200×1200`，退出 0；不表示这样的布局语义或观感理想 |
| Sequence 12 个参与者、消息 y=1500 | 参与者宽度和消息时间轴同时越界，退出 1 | `1800×1700`，退出 0 |
| Dataflow row=5 | 即使 `3000×3000` 也拒绝 | 仍是行索引问题 |
| Lifecycle main col=5 | 即使 `3000×3000` 也拒绝 | 仍是 schema 最大值问题 |

本机临时证据脚本：`/tmp/archify-four-canvas-plan.Q5Brmb/probe.mjs`。它不是长期验收资产；实施时将最小 JSON 收入正式 fixture，不能依赖临时路径或手工摘要。

## 2. 首期合同：只负责装得下，不负责重新排版

### 兼容与启用

推荐新增一个明确的 opt-in：`meta.canvas_fit: "content"`（拟议字段，当前不可使用）。

- 三个固定默认画布的 renderer 不写此字段时保持现状，含省略 viewBox 的历史输入。
- Architecture 继续保留已有 implicit auto 行为；补全外绕路径覆盖作为独立缺陷修复，固定 viewBox 仍不扩大。严格的全内容测量/诊断合同可由相同 opt-in 启用。
- 内容模式下省略 `meta.viewBox`：从内容推导尺寸；三个固定默认类型以当前默认尺寸为下限，只扩大、不主动缩小。
- 内容模式下显式 `meta.viewBox`：它仍是固定容量，不能静默覆盖；不足时输出 measured requiredViewBox 和具体越界贡献者。只有右/下容量问题才能建议增大尺寸。
- 原点仍为 `0,0`。负向越界不能靠加大宽高修复，不擅自平移显式坐标；给出精确元素与坐标诊断。
- 保留全部节点、关系、标签、顺序、分组归属、pos/y/yOffset、via/channel/labelAt 等作者意图。由画布派生的生命线、背景框、图例可以随尺寸延伸或移动。
- 第一阶段不新增全套 schema-v2，不改四类布局语言。该可选字段及 Architecture 默认修复的允许变化仍需按 CONTRIBUTING 的合同变更流程确认。
- Workflow v1/v2 的字段和默认行为不随此设计修改；不要为表面一致而迁移已稳定的编译器。

不是按「普通图/大图」选择不同内容正确性：内容模式下所有大小统一测量。Viewer 是否进入大图浏览，仍由现有屏幕适配与可读性判断独立决定。

### 最小共享 Module

在第二个实际 caller 出现时抽取内部纯计算 Module；只有 Architecture 使用时先局部修复。候选位置 `renderers/shared/canvas-frame.mjs`，不暴露成新公共编译器。

Interface 输入为各 renderer 已算好的几何范围、拟采用的最小尺寸、padding 和可选 authored frame；输出为测量范围、所需尺寸、最终尺寸及贡献者。拓扑语义、路由和类型专属 reserve 仍由各 renderer 负责。

共享计算不得重新解析 SVG、猜测标签大小或建立第二份可编辑 Scene。图形绘制和测量必须使用同一组内部数据；矩形、圆角路径、描边、箭头和标签 mask 都要覆盖。HTML 卡片与 Viewer 控件不属于 SVG paint bounds，不能混入编译画布。

保守路径包围盒可以使用已知线段/曲线控制点的凸包，再按实际描边/marker 参数扩张；最终用真实 SVG 几何检查避免低估，也检查无必要的大面积空白。不要把固定 `+2px` 当成任意线宽和箭头的通用公式。

内部保持 layout、geometry、paint 的概念区分。首期回执只增加修复真正需要的 `requiredViewBox`、`paintBounds`、`canonicalFrame`、`contributors`，不强迫四类完整复制 Workflow 的所有内部字段或 digest。

### 计算顺序

1. schema、引用、有限坐标检查；在错误输入上停止，不过滤掉非法图形继续成功。
2. 算出语义内容的节点/状态/参与者、路由、标签几何；缓存并复用于绘制。
3. 求主体所需宽高，包含类型专属合法内容区和最小尺寸。
4. 用已有图例测量求实际行数与高度；只在确有需要时增宽，图例放到主体之后。
5. 根据最终尺寸生成画布附属框、生命线和轨道；它们不能反过来无限推高自身所依赖的画布。
6. 校验最终全部绘制范围及原有碰撞规则，输出 SVG 和回执。

对有反馈依赖的类型使用有界、确定性收敛；无反馈的直接公式计算。不引入任意次数的「放大后重跑整套 render」。现有 Architecture 的边界标题可读性收敛必须保留并检查，不能只改最后一行 viewBox 而漏掉字体/标题依赖。

## 3. 按类型实施

### Architecture：先补全已有 auto，而非重写

- 把所有 connection 实际路径（包括无 label 的 via）、stroke/marker 和边界标题纳入已有自动尺寸。
- 保留 grid/free 坐标、boundary wraps、显式 pos 与 route。
- 保留标题可读性收敛；新增范围引起标题扩张时要有界停止并给出诊断。
- 在既有 layout report 中增加必要范围证据，不另开旁路文件格式。
- 小图无越界者无几何漂移；以前被裁切的 implicit 画布变大是明确的允许变化。

### Dataflow：第二个接入点，建立真正共享计算

- 从现有 stage/row/yOffset、节点尺寸、flow 路径、label+classification 测主体。
- 节点保留坐标；stage header 文本也纳入宽度，不只量节点。
- 先确定内容高度和图例区，再延长 stage 背景框；避免 `frame.height = canvas.height - ...` 参与自我扩容。
- 固定列距内的节点重叠、长标签装不进节点仍报原错误，画布扩容不是这些错误的修复。
- row>4、stage>5 属于后续容量合同，首期不偷改。

### Sequence：单独处理横向分布和纵向时间

- fixed：参与者箱宽与列距不变，由最后一个参与者和实际标签决定最小宽度。
- 高度由消息 y、segment.to、activation.to 等的最大需求推导，同时保留时间轴上下留白与图例区。
- 消息顺序、y、activation/segment 范围不变；生命线延长，图例下移。
- spread：保留显式 viewBox 的原有行为；隐式内容模式从旧默认宽度开始求满足内容的宽度。它本来就是随宽度分配坐标的派生布局，不能宣称参与者 x 永远不变，但顺序和作者时间坐标必须不变。
- 对 spread 与标签居中引起的双向依赖，优先解约束而非逐像素扩大；最终保留有界停止。无法满足的固定箱宽/标签问题清楚报出。
- 不自动增加消息间距，不把 y 改为顺序索引，不新增自调用或嵌套片段语法。

### Lifecycle：先覆盖画布，再讨论扩大 phase map

- 主体范围包括状态、transition（圆角、via、channel）、label+note、三条带标题和主轨道。
- 保留 main / event / terminal 对应关系、下带列偏移、显式 yOffset，以及现有 outcome/legend reserve 的语义。
- 不用画布扩容把跨带冲突解释为有效的自动布局；重叠和穿节点仍失败。
- 不把非 main/terminal 的 lane 自动拆为独立行；该行为会改变旧合同，属于下一阶段。

## 4. 实施顺序和交付边界

建议拆为独立可审查的四个切片，而不是把所有修改叠进现有 Viewer 修复 PR：

1. **Architecture 完整 auto bounds 修复**：先把已复现的外绕路径纳入画布，建立路径/marker/标签/图例的 red-green 证据。
2. **Dataflow opt-in 内容画布**：引入经过确认的字段；在两个真实 caller 上抽取共享测量，补 Dataflow 的 layout receipt。
3. **Sequence 内容画布**：处理 fixed/spread、长时间轴、activation/segment、时间坐标兼容。
4. **Lifecycle 内容画布**：处理三带、圆角回路、标题与图例；完成四类型共享浏览和导出验收。

每片通过后再继续；共同预算/诊断失败不靠跳过校验交付。无需立即替换 SVG、引入白板 SDK、通用 solver/router 插件、在线拖拽编辑器或虚拟化。

新类型接入 `validate --layout-json` 时扩展既有 CLI；成功、失败都通过既有机器回执与 diagnostics 表达。不要给每类新增一套 `--canvas-report` 命令。

## 5. 更多节点：后续单独的容量阶段

| 类型 | 建议下一步 | 不应混入的改动 |
| --- | --- | --- |
| Architecture | 先使用现有无上限 grid 行、合理的多分组/大图导航；只在固定输入证明 gap 不足时设计按行列内容推导间距 | 通用拓扑自动排版、自动合并真实模块 |
| Dataflow | 新合同下用 `128 + row × 114` 起步，保留旧 0..4 对应坐标；允许更多 stage，仍按 stage 索引计算；随后按真实宽标签需求考虑可变列距 | 仅删校验而保留 rowYs 数组；不加预算就宣称无限规模 |
| Sequence | 先验证 12/30 个参与者和长消息流；如 Agent 手算 y 确有高返工，再单独设计消息索引→y，以及 activation/segment 的稳定消息引用 | 擅自重排交互、把像素 y 输入当可自由移动的节点 |
| Lifecycle | 若用户要更多状态，单独选择「可扩展 phase map」：增加主轨道列和明确的 event 行，同时保留终态归属与已有偏移规则 | 把当前类型无声改成任意嵌套状态机；用大量 yOffset 冒充完整大规模布局 |

容量阶段可能需要版本化或迁移规则；不在首期 field 上暗中附带新语义。实现前固定大图用例和旧坐标输入，任何有限资源预算失败必须明确报告，不得删除实体、截断行列、合并节点或降低语义校验。

## 6. 原始验收标准

以下是实施验收要求，不是本轮已经实现的结果。

### A1 内容完整性

- 四类各有宽图、高图、仅外绕路径撑大画布、长关系标签、中文/英文长图例、显式大画布样例；覆盖 standard/showcase。
- 无显式 frame 且开启内容模式的合法样例，一次编译完成，主体及要求显示的图例均落入 canonical frame；不靠隐藏图例、删除标签通过。
- 覆盖空可选集合、最大线宽/marker、圆角、品牌标记、边界标题。浮点容差仅用于测量，不掩盖整段路径或文字越界。
- Architecture 的 y=1000 外绕路径样例必须不再输出高度 208 的完整画布。

### A2 作者意图与旧行为

- 节点/边 ID、连接端点、文本、语义类型、分组成员及显式几何保持一致。
- 内容模式不改 pos/y/yOffset/via/channel/labelAt。Sequence spread 的派生 x 变化单独记录，不计为用户坐标漂移。
- 固定 viewBox 不被静默覆盖；不足时有精确容量诊断。左/上越界不得给出仅增大宽高的无效建议。
- 未开启内容模式的固定默认三类、Workflow v1/v2 均维持兼容；Architecture implicit 只允许经确认的补全边界变化。
- 节点重叠、穿节点、标签碰撞、无效引用、原有质量 profile 约束继续生效；不用改 golden 掩盖未知变化。

### A3 确定性和停止条件

- 相同输入和版本，多次输出相同 canonical geometry、frame 与必要 receipt 字段。
- 共享测量对既有几何做线性归并；不额外引入全图成对碰撞扫描。原 renderer 自身已有的复杂度不能由此承诺消失。
- 有反馈的布局报告迭代计数和上限；不收敛、非有限范围、资源预算失败均非零退出并有结构化 diagnostic。

### A4 浏览与导出

- 在 `1440×900`、`1600×1000`、`1920×1080`、`2048×1320` 的 light/dark 实测四类扩容图；另覆盖移动端导航及弹层避让。
- 实体全部可搜索/聚焦到达；长时间轴和极宽图不因相机范围不足无法访问。局部聚焦可读，不要求全部文字同时在首屏可读。
- 相机操作前后 canonical geometry/frame 不变；导出 SVG 的节点/关系 ID 与完整输入一致，导航前后同一导出选项下 canonical SVG 字节稳定。
- PNG/JPEG/WebP 超预算沿用现有 preflight 明确拒绝或支持的安全尺寸，并保留 SVG 退路；不静默裁剪，不声称任意大小图片都可导出。
- 浏览器自动验收与人工目检分别报告；不能把静态 render 成功当作这项通过。

### A5 收益验证

- 每类型冻结至少 3 个已复现的纯容量失败/裁切样例和 3 个原本通过的控制样例；分清容量、布局冲突、语义、基础设施错误。
- 对属于范围的纯容量失败，内容模式无源码修复即可通过的比例要求 100%；合法控制样例不能引入新失败。该指标不代表所有校验问题 100% 消失。
- 同机器、同 runtime、同输入进行配对基准，报告次数、median/P95、输入/代码版本；小语料 P95 仅作探索，不能冒充稳定端到端指标。
- 若要宣称 Agent 返工耗时收益，另冻结 prompt、模型、推理档、工具、输出质量，记录真实 authoring→validation/repair→visual→handoff 全流程；未测不承诺 20–30% 提速。

### A6 回归与交付

- 每类增加 public render/validate 回归；统一回执经公开 CLI 测试，不只测内部 helper。
- 跑 v1 compatibility、base-input compatibility、layout-rules、legend、geometry、各类型专项测试；共享实现定稿后跑完整 `npm test` 和真实 `npm run test:browser`。
- 不可用的 Chrome 明确标 skipped，不算通过。macOS GUI 启动遵循仓库外沙箱审批要求。
- schema 变更重建 bundled validators；按最终输入重建受影响示例/Gallery/ZIP 等，Node 22 校验包可复现。

## 7. 设计消融

本轮仅做方案层消融与现有行为复核，不把概念检查描述成尚未实现的测试通过。

- 候选一：首期统一 `compileDiagram()`、新 Scene、四类一并迁入 solver。删除后逐项复核 A1–A6：现有 renderer 加完整测量即可承担责任，公开 CLI 仍是验收入口，无验收项必须依赖统一编译器。**从首期移除**。
- 候选二：画布功能同时升级四套 schema-v2。删除后，单一 opt-in 足以隔离旧默认行为，且首期不改变位置语言。**从首期移除**；容量/布局语义阶段再判断是否需要版本化。
- 候选三：删掉路径范围，只按节点、标签撑大。最小 Architecture 复现仍出现 y=1000 / 高度 208，违反 A1。**恢复完整路径/paint 范围测量要求**。
- 候选四：取消 opt-in，三类省略 viewBox 的历史输入一律改变尺寸。与 A2 的旧默认行为保护冲突。**保留 opt-in**；未来如要默认启用，必须另做明确的迁移与默认变更决策。
- 候选五：首期顺带解除所有槽位限制。删除后 A1–A6 的合法旧布局范围仍明确成立，且行/列负例证明扩容与槽位是两回事。**从首期移除，保留为独立容量阶段**。

现有基线复核：方案消融后重跑 `v1-compatibility`、`base-input-compatibility`、`legend-contract`、`sequence-column-fit`、`sequence-header-clearance` 共 36 项，35 通过、1 个需 Chrome 的测试跳过；layout-rules 中 canvas/viewBox 定向 14/14 通过。合计 49 通过、1 跳过、0 失败，仅支持当前合同理解，不能证明拟议能力已实现。文档的 9 个相对链接全部可解析。

## 待用户确认的决策

推荐确认首期「Architecture 缺陷补齐 + 其余三类 opt-in 内容画布 + 四类浏览/导出验收」。拟议字段、显式 frame 权威、旧默认不变共同构成一个合同决策。

若核心优先级是「远超当前槽位的详细图」，则在首期后优先推进 Dataflow 行/阶段扩展；Lifecycle 的可扩展 phase map 另作设计，不宣称四类内容画布完成就已经达到无限节点布局。
