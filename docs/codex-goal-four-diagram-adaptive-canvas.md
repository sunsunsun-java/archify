# Goal：完整交付四类图的内容自适应画布

状态：**用户于 2026-09-21 授权执行，四类实现与 AC-1 至 AC-6 验收完成**。编写日期：2026-09-21。交付与证据见[实现台账](four-diagram-content-canvas-implementation.md)。

用户已明确要求执行本 Goal，并确认行数、阶段数、列数限制均保持不变。执行仍遵守下文的本地提交、不推送边界。审核阶段记录保留其原始时点含义。

## 目标与完成定义

在 Archify 的 Architecture、Dataflow、Sequence、Lifecycle 四类图中，完整交付内容自适应画布：合法内容按本类型规则布局后，由实际绘制范围确定有限画布，减少仅因画布容量不足造成的源码返工，并保证共享 Viewer 可浏览、完整导出。

**四类全部是必交付项。** 可以按 Architecture → Dataflow → Sequence → Lifecycle 顺序实现和提交，但不能完成前两类后以「后续再接入」结束本 Goal。最终需要四类各自的静态、浏览器、导出和兼容证据；Workflow v1/v2 是必须保留的回归对象。

此处「完整」指四类型覆盖、失败处理和交付链完整，不指任意节点数量、自动重排或无限资源。

## 1. 审核结论与改进

以本 Goal 的合同和验收为准。[2026-09-20 方案](./four-diagram-adaptive-canvas-plan-2026-09-20.md) 仅保留为历史分析与复现证据，不再决定交付范围。

| 原方案需要收紧之处 | 本 Goal 的决定 |
| --- | --- |
| 建议先完成①②再判断③④ | 四类列为同一 Goal 的必交付项，分步只用于控制回归风险 |
| 默认尺寸与显式容量容易混淆 | 默认尺寸下限只用于 implicit 内容模式；显式画布按实际内容和既有语义约束判定，不因小于默认尺寸而拒绝 |
| 「所有坐标不变」过于笼统 | 作者给定坐标不可动；Sequence spread 的派生横坐标可随画布宽度变化，需保序并单独验证 |
| 阶段框、生命线、图例可能循环撑大画布 | 先确定语义内容与图例占用，再生成随画布延伸的装饰/结构；确有反馈时使用有界求解 |
| 仅按节点/label 包围盒会漏掉路径及箭头 | 同源测量实际路径、描边、marker、文本和 frame；增加独立浏览器证据，不能仅信任编译器自己的 receipt |
| 「所有元素可达」容易由抽样结果推断 | 验收专用中型图全部遍历；规模压力图明确标记静态全量检查与动态抽样，不能混为全量浏览证明 |
| opt-in 功能可能不会被新图生成流程使用 | 旧 JSON 默认保留；四类型新图的 authoring 指引明确选择 content 模式，并测试文档/schema/示例一致 |
| 旧代码不认识新字段，机器 A/B 容易比较不公 | 冻结语义输入，记录 A/B 唯一的模式字段差异及各自 hash；成功控制组用相同原始输入比较额外开销 |

现有代码核查版本为 `labs/adaptive-workflow-canvas-pilot` 的 `476729736775b308b50cbe404bc1b84c8f674516`。实施前重新核对，不假定本地记录等于最新远端 dev。

## 2. 范围与权限

### 本次包含

- 四类完整绘制范围测量、内容画布决策及明确容量诊断。
- 最小共享内部 Module；四类各自保有布局和路由 Implementation。
- 四类 `validate --layout-json` 证据，保持现有 Architecture/Workflow 输出兼容。
- 新图 authoring 指引、schema、bundled validators、对应示例与受影响交付产物。
- 四类大图在现有 reader/camera/导航/导出上的验证；发现由本次接入触发的必要小修可纳入，并跑五类回归。

### 本次不包含

- Dataflow 开放 row>4 或 stage>5；Lifecycle 扩展主带/事件带/终态带列数、拆分 event lane；Architecture 扩展 grid 列上限。
- 自动拓扑排版、自动消息 y、节点合并/折叠、改变状态语义、通用嵌套状态机。
- 在线编辑、协作、白板 SDK、替换 SVG、新增虚拟化/LOD、无限栅格输出。
- Workflow 编译器迁移、发布版本、live Skill/插件安装、远端发布或合并 PR。

容量扩展已重新审核，仍是独立合同：画布变大不能解除布局槽位限制。若用户在审核时选择把容量扩展纳入，本文件应先补齐版本/迁移、坐标映射和对应验收，再授权实施；不得在执行中临时扩大范围。

### 开始实施后的 Git 边界

先核实当前分支、工作区及相关 dev 差异，记录比较基线。默认延续用户指定的 `labs/adaptive-workflow-canvas-pilot`；若该分支已合并、被替换，或对齐 dev 需要历史改写/冲突处理，报告状态并请求必要决定，不自行创建或切换分支。

完成后可在确认的本地分支提交本 Goal 的变更；未获得针对本轮的明确指令前不推送、不更新远端 PR、不合并。保留已有 `artifacts/` 等用户数据，禁止全量 stage 未知文件。审核阶段仅编辑方案文档；本轮已获产品实现授权。

## 3. 产品合同

### 3.1 启用与兼容矩阵

已授权字段：四类 schema-v1 接受可选 `meta.canvas_fit: "content"`。首期不新增第二种字段值或四套 schema-v2；不向 Workflow 添加该字段。实现与验收状态以执行报告为准，不以此目标描述代替测试证据。

| 类型/配置 | 行为 |
| --- | --- |
| Dataflow / Sequence / Lifecycle 未设置 canvas_fit | 完全沿用旧默认画布、位置、图例兼容和校验行为，包含未写 viewBox 的旧输入 |
| Architecture 未设置 canvas_fit、未写 viewBox | 保留已有 auto；补齐原来遗漏的右/下路径绘制范围。原来合格的场景保持几何；因补漏引起 frame、图例位置和已有边界标题派生变化需逐例解释 |
| Architecture 未设置 canvas_fit、写了 viewBox | 保持旧固定容量及质量 profile 行为；不把新的严格 paint 校验追溯到整个 legacy 集合 |
| 四类设置 content、未写 viewBox | 从实际内容和确定性留白求 frame；三个原固定类型以原默认尺寸为隐式下限；Architecture 保留其原 auto 最小尺寸规则并满足 schema |
| 四类设置 content、写了 viewBox | 尊重固定容量，仅在实际绘制范围或既有内容区约束装不下时失败；不为追求 implicit 默认宽高/美观留白而拒绝一个实际装得下的显式画布 |
| Workflow v1/v2 | 保持现有模式、默认值、receipt 和编译结果；只作为共享行为回归对象 |

开启 content 后，无论 standard/showcase 都应满足完整内容落入 frame；其他校验仍遵循各自 profile。legacy 的宽容和 content 的完整性是明确的 opt-in 差别。

默认新图 authoring 指引在这四类中写入 content，并省略没有用户固定尺寸要求的 viewBox。修改既有文档不能自动添加模式或删除显式尺寸；legacy 示例仍承担兼容测试，另新增 content 示例。

### 3.2 几何权威

- 保留所有实体、关系端点、文本、语义类型、成员归属和作者给出的 pos、size、y、yOffset、via、channel、labelAt 等控制。
- Sequence fixed 的参与者坐标不变；spread 根据最终宽度派生参与者 x 和允许范围内的箱宽，保留参与者顺序、消息 y、activation/segment 的时间范围。
- 随画布派生的 stage frame、生命线、轨道长度、图例位置可以变化；这不授权移动其语义内容。
- 原点保持 `[0,0]`。content 模式下实际 paint 进入负坐标时报告具体来源；不擅自整体平移、不建议只增加右/下容量来修复左/上越界。
- 图例按作者配置解析。content 模式中的默认 auto 图例装不下就扩容或报容量错误，不能沿用 legacy 的「隐式图例装不下就隐藏」作为成功路径。

### 3.3 画布与屏幕分离

canvas frame 表示当前完整 SVG 世界；浏览器 viewport 表示当前能看到的一部分。HTML 卡片、标题栏、Passport、Radar 等不并入 SVG paint bounds。保留共享 Viewer 的普通/大图判定，不以「一屏显示全部文字」作为大图验收。

本次不改变画布为非零 origin，也不单独创建 exportFrame；全图导出使用 canonical frame，相机状态不改变它。

## 4. Implementation 设计

### 4.1 共享 Module 和 Interface

先修复 Architecture 的实际缺口，再用 Dataflow 的第二个真实 caller 确认可共享的计算，之后接入 Sequence/Lifecycle。文件位置可选择已有 shared 目录中的合适位置，不把指定文件名作为验收。

Interface 接收已测量的有限几何范围、明确的尺寸政策和可选 authored frame，返回 frame 决策及贡献者。主体布局、label 几何、路由、reserve 与图例布局属于各 renderer；公共层做范围归并和固定容量判定，不分派四类拓扑。

测量和 SVG 绘制使用同一份内部几何，复用现有 text-fit、geometry 和 legendFootprint/measureLegend。不要创建第二份持久 Scene、通用 compileDiagram 或新的公共 solver/router 插件接口。

实际 paint 必须覆盖：节点/状态轮廓、边界/阶段/带标题、路径及圆角、描边线帽/连接、marker 朝向与缩放、label mask、文本、图例和品牌标记。测量 renderer 可生成的有限 SVG 子集，无需实现通用 SVG 引擎。

使用保守解析边界时说明误差来源；浮点 epsilon 采用既有规则或给出新增理由。描边、marker 扩张按实际参数算，不统一假定 +2px；关系线宽没有有限 schema 最大值，测试代表性粗线与极端数值失败，不虚构「最大线宽」。

### 4.2 计算顺序与收敛

1. schema、引用、坐标有限性检查，错误输入及时产生机器可读失败。
2. 根据现有布局和作者控制测量主体与关系，用同一组计算结果绘制。
3. 确定主体占用与类型专属最小内容区。
4. 用最终可用宽度测量图例行数，安排真实下方空间；单个条目太宽可要求更宽 implicit 画布。
5. 最后生成随 frame 延长的 stage 背景、生命线、轨道；这些附属形状不能被当作独立外部内容再次撑大自身依赖的 frame。
6. 校验最终 paint、显式容量及既有几何规则，序列化 SVG/receipt。

能直接计算的尺寸使用公式。Architecture 保留现有标题可读性收敛及其上限；Sequence spread 等新增反馈每次只处理布局阶段，有可观察的迭代计数，上限不超过 32 次；到限非零失败，不重试整个 CLI、不放宽校验。正式 fixture 必须正常收敛，到限仅在失败测试中验收。

不得因为图例与 frame 循环扩大而隐藏图例、反复加高度或丢失保留区。针对中文长图例、多行图例必须有收敛回归。

### 4.3 四类专属责任

| 类型 | 主体内容与专属约束 | 必须覆盖的依赖 |
| --- | --- | --- |
| Architecture | components、boundary wraps/title、全部 connections（含无 label 的 via） | 新 frame 宽度与已有边界标题可读性求解；显式 pos/size/route 优先 |
| Dataflow | stage header、nodes、flow 路径、label/classification | 先测内容和图例，再确定 stage 框底部；保留 stage/row/yOffset 和可读区域规则 |
| Sequence | participant header、message label/note、消息线、segment 及标题、activation | fixed 不动列距；spread 按宽度重算；高度覆盖所有 message/segment/activation，生命线和图例最后生成 |
| Lifecycle | state、transition/圆角/label/note、band title、主轨道 | 保留 main/event/terminal 归属及下带列偏移；保留状态区域与图例保留区语义 |

Sequence 不制造 via 或圆角回路语法来套其他类型 fixture；Lifecycle 不把增加 yOffset 当成新增独立 event lane。图类型专属验收不能因为不适用而伪造输入。

### 4.4 诊断与回执

复用已有 diagnostics 格式及语义适用的 code。确需新 code 时统一为共享 canvas 类别，在实现前将命名及证据字段写入一处权威合同并测试，不为四类复制四套同义错误。

容量错误必须包含类型、精确 subject/输入路径、actual frame、paint bounds、越界方向、贡献者。`requiredViewBox` 表示已经验证足以容纳的候选尺寸，不宣称全局最小；几何不可测或尺寸不能解决时不填假的成功尺寸。

尤其对 spread 和 Architecture 标题反馈，改变 width 后需重新验证修复建议。只有验证有效的建议进入 supportedFixes；其余说明保留为证据/限制，不宣称改了就能过。该验证自身也要有界。

`validate --layout-json` 扩展到四类；成功输出 final frame、paint bounds、容量来源/模式和确定性贡献者，失败输出 diagnostics 并保留非零退出。已有 Architecture/Workflow 字段不删除、不改义，新字段只增量加入。所有布局数值必须与最终 SVG 对应；legacy 的取整字段可保留，但不能用于完整 paint 精度判定。

`--layout-json` 本身就应提供可解析 JSON，覆盖 schema/输入错误等早期失败，不要求使用者再碰运气添加 `--json`。dry-run 不写 HTML；render/validate/deliver 三条路径使用同一画布决策，不在 CLI 里二次修改 SVG。

## 5. 执行步骤与每步完成条件

开始后先读取仓库 AGENTS/CONTRIBUTING。涉及布局时读取 authoring contract、四类 schema 与 renderer 规则；涉及共享 Viewer 或导出时读取其 README、delivery contract 及对应测试。历史试点报告仅用于判断性能证据，不能作为本轮测试替代。

1. **冻结基线与 fixture。** 将历史临时复现改成正式可重跑输入，记录 base SHA、环境、输入 hash；固定下文正负例和测量命令。完成条件：每个新增修复至少一个基线 red/裁切证据，旧行为控制组可重跑。
2. **完成 Architecture。** 补全已有 auto 路径覆盖及 content 合同，验证显式容量和边界标题依赖。完成条件：本类型验收通过，基线变化可解释。
3. **完成 Dataflow。** 建立第二 caller 上的共享 Module、schema/诊断/receipt 链路，解决 frame/图例顺序。完成条件：本类型及 Architecture 回归通过。
4. **完成 Sequence。** 分别覆盖 fixed/spread、参与者宽度和完整时间轴。完成条件：本类型及前两类型回归通过。
5. **完成 Lifecycle。** 覆盖三带、圆角转移、标题和保留区。完成条件：四类型均满足静态验收，Workflow 不回归。
6. **完成集成。** authoring 指引、validators、四类示例、浏览/导出、性能控制和最终产物同步。完成条件：下文验收台账全部有证据，不允许用旧头 CI 代替新头必要验证。
7. **消融与交付。** 一次移除一个候选抽象/状态/配置，重跑其原验收与相关回归；通过则保留删除，失败则恢复。最终核对工作区、提交范围与报告，达到第 8 节全部完成条件才能结束 Goal。

分阶段提交用于定位问题，不减少最终范围。不得通过扩大测试超时、隐藏图例、删除实体或改变输入语义来让必交付 fixture 变绿。

## 6. 验收标准

### AC-1：模式、兼容和几何权威

- 四类逐格测试第 3.1 节矩阵，包含小于旧默认但足够容纳内容的显式画布、刚好可容纳与确实不足的临界值。
- 三类 legacy 原 SVG/几何 golden 不变；Architecture legacy auto 的允许变化逐例列出；固定 frame 保持原值。Workflow v1/v2 receipt 与几何兼容。
- 每个样例比较实体/关系 ID、多重关系计数、端点、语义类型、完整文本和作者几何；不能仅比较节点数量。无关系 ID 时使用可稳定追踪的原始索引和端点，不因此漏算重复边。
- Sequence spread 的派生 x 允许变化且要记录；输入 y、参与者顺序、activation/segment 范围及其他作者控制保持不变。
- 节点重叠、穿节点、label 碰撞、无效引用、错误 band/row/col 仍按原规则报错。

### AC-2：按类型的正负例矩阵

每类至少 3 个互异、已复现的容量/裁切正例和 3 个合法控制输入；另外覆盖下列负例。共用 fixture 可以交叉承担多项检查，但报告要标明，不能把一个样例重复命名充数。

| 类型 | 必含正例 | 必含负例/不适用项 |
| --- | --- | --- |
| Architecture | 两节点无标签 via 到 y=1000；右侧外绕粗线/marker；边界标题和多行图例扩容 | 左/上越界 pins；小固定 frame；必要路由/标题互撞；缺少 components 引用 |
| Dataflow | row=4 加合法正 yOffset 的高图；宽 stage header/远端 label；正向外绕 flow/classification 与长图例 | row=5 仍拒绝；stage 数超旧上限仍拒绝；固定 frame 不足；同位置 node 冲突 |
| Sequence | 12 参与者 fixed+长消息轴；30 参与者 spread；只有 segment/activation 延伸撑高且含可容纳的长标签 | 无效 activation 引用/反向范围；太密消息；固定 frame 不足；固定箱宽装不下的 participant label；不要求不存在的 via 语法 |
| Lifecycle | 合法正 yOffset 的高图；right/bottom channel 圆角与 label/note；长 band title+多行图例 | main col=5/event col=3 仍拒绝；共享 event 带状态重叠；固定 frame 不足；负向 channel |

- 正例用 content 模式一次完成编译，除启用字段外不要求 Agent 改源码；所有应显示的内容落入 frame。
- 新模式 standard/showcase、中文/英文、品牌标记、空可选集合均覆盖；quality 规则不同的 fixture 分开记录，不能为过关降级 profile。
- 通过与失败采用与问题相称的 paint 容差；覆盖粗线、marker 方向、圆角和精确临界位置，不能把 geometry bbox 当完整 paint bbox。

### AC-3：确定性、预算和错误可修复性

- 固定环境下相同输入连续 5 次得到相同 final frame、canonical geometry 和测量证据；只排除明示的时间戳/路径环境字段，不排除未知差异。
- 共享范围归并对已解析几何是线性遍历；新增反馈有计数/上限。收敛 fixture 不触顶；人工构造不可满足输入有界失败，退出与 diagnostic 可重跑。
- 每项容量建议按公开 validate 路径实际验证；如果存在独立布局错误，报告它而不是保证增大尺寸能解决所有错误。
- JSON 回执覆盖 input/schema/layout/容量错误，解析失败、NaN/Infinity、负向越界不会变成 ok。dry-run 无输出 HTML 的副作用。

### AC-4：四类真实浏览和全图导出

- 每类至少一张非空关系、含图例、具有明确阅读路径的验收图；用合法现有语法使其实际超出常规视口，不用离谱空白或装饰物冒充多内容大图。Architecture/Dataflow 可用多模块图，Sequence 使用长时间轴，Lifecycle 保留三带可理解性。
- 每类在桌面四个 viewport：1440×900、1600×1000、1920×1080、2048×1320，分别 light/dark 执行浏览检查；每类另在 390×844 和 844×390 检查移动端导航、聚焦与弹层遮挡。记录 preset/zoom/选中状态，测试之间重置。
- 验收中型图控制在现有全量导航能力范围（节点和关系各不超过 50）；对所有语义实体和关系逐一导航，记录已达/总数。节点搜索能找到、聚焦可读；关系通过既有关系导航或定位能查看完整相关内容，不把「所有节点可搜」扩写为未实现的任意关系全文搜索。
- 更大规模输入可以另做压力测试，但准确标记「静态全量、动态抽样」；当前 shared visual-check 对 >50 的抽样不能宣称全量导航。
- 扩容后所有 drawable 处于 canonical frame；不仅检查节点，还包括路径、labels、marker、frame/title、activation、legend。依赖真实字体加载后的浏览器测量，marker/stroke 若不被 getBBox 包含须另验证，不以编译器 receipt 自证。
- camera 前后 frame、源几何不变；相同导出参数的 canonical SVG 字节稳定，实体/关系/文本全部保留，含离屏内容且无 camera transform/clip 污染。
- PNG/JPEG/WebP 分别验证成功输出与超预算失败；PNG 至少一类大图实际解码检查尺寸/非空内容。WebM 保留现有门禁和预检行为。超预算沿用安全尺度或明确错误/SVG 退路，不输出静默缺内容的文件。
- 对每类至少一张宽/高代表图的 light/dark 进行图像目检并留下结论；自动 browser pass 和视觉目检状态分别记录。移动端、打印、embed、present 保持其原布局合同，不强迫它们套用桌面大图入口。

### AC-5：收益与不退化

- 预先冻结的每类 3 个纯容量正例，候选版不修改语义/坐标就能成功编译并通过对应完整性检查，解决率 100%；失败样例不能在看到结果后从分母删除。
- A/B 使用相同语义源；A 不含新字段，B 仅增加 content 字段，分别记录 hash 和模式差异。Architecture 默认补漏另有完全同输入 A/B。不得把新字段导致旧版 schema 失败当作容量失败。
- 性能比较使用双方均成功的控制输入，同机器/Node、串行交错 AB/BA、每例 3 次预热和至少 10 对观测，记录 render/validate median 与 P95。目标是避免明显开销，不以优化收益作为未经测量的宣传。
- 拟定不退化门槛：每类控制组 median 不超过 `max(A×1.10, A+5ms)`，P95 不超过 `max(A×1.15, A+15ms)`；超标先做 A/A 噪声校验，确认后修复或报告未满足，不能默改阈值。机器条件不足时标记缺证据。
- 真实 Agent authoring→repair→visual→handoff 的耗时改善是单独的观察指标；无配对证据就明确「未测」，它不阻塞本次正确性功能交付，也不允许宣称降低总耗时 20–30%。

### AC-6：交付链和维护成本

- public render/validate/deliver/layout-json 的画布一致，成功与失败均有回归；规则/helper 的单测仅作为补充。
- 各切片定向回归后，在最终合并源码上跑完整 npm test、真实 browser gate；受影响的 WebM/Windows 路径检查按 CONTRIBUTING 保留。Chrome 不可用算缺少浏览器验收，不能以 skip 声明本 Goal 完成。
- 更新新字段的 canonical contract、四类 authoring 入口、schema、bundled validators 和新增 content 示例；用真实渲染证明示例可用，保留 legacy fixture。
- 根据最终权威输入重建受影响 Viewer 模板、Gallery、展示资产与 ZIP；仅修改受影响生成物，使用 canonical Node 22 验证 ZIP 可复现；解包后验证四类入口，不安装到 live Skill。
- 远端发布不在范围内；本地最终证据必须充分。若后续获准推送，届时检查该 head 的真实 CI，不能把「未触发 CI」写为全绿。

## 7. 本次方案消融与执行期消融要求

审核阶段使用合同检查和代码证据做设计消融，不把它伪装成新功能运行测试。每个候选单独移除，重新检查 AC-1 至 AC-6：

| 候选 | 删除后的检查 | 处理 |
| --- | --- | --- |
| 独立通用 compileDiagram / 新 Scene | 四类 renderer 加同源测量即可承担验收，无一项要求新公共入口 | 从最终方案移除 |
| 四类全量升级 schema-v2 | 首期位置语言不变，单一可选字段可隔离新行为 | 从最终方案移除 |
| 给四类统一加持久 layoutDigest、独立 exportFrame | 验收可直接比较已有/新增 receipt 与 canonical SVG，第二 frame 增加歧义 | 不新增；Workflow 既有 digest 保留 |
| 强制新增几何缓存 | 同一次 render 的局部计算结果即可让测量与绘制同源，AC-1 至 AC-6 不要求额外缓存生命周期 | 删除强制缓存要求；有实测重复计算成本时再判断 |
| 删除 opt-in、全量替换三类默认 | 破坏 AC-1 的旧省略字段输入兼容 | 恢复模式隔离 |
| 删除完整路径/marker 测量 | 已有 y=1000 / 高度 208 复现违反 AC-2/4；普通 geometry bbox 也不足以覆盖 marker | 恢复完整 paint 责任 |
| 同时引入新布局槽位语义 | 移除后四类内容画布仍可完整验收，且避免把 schema 变更混为画布修复 | 从本次移除，独立审核 |

执行期必须实际操作消融：对新 helper、缓存、状态、配置逐项尝试删除并重跑原验收；保留有效删除，恢复导致回归的部分。最终报告写清候选、结果、对应测试与 revision。

## 8. 最终交付与停止条件

交付四类型能力矩阵（含 Workflow 回归）、模式使用示例、已提交代码、输入/输出/receipt/浏览器证据索引、性能控制结果、逐项验收台账、消融记录及已知限制。每条 AC 必须是 pass、fail 或 blocked，并链接证据；没有证据不能写 pass。

本 Goal 完成要求：Architecture、Dataflow、Sequence、Lifecycle 均交付；AC-1 至 AC-6 全部满足；最终相关测试运行且无未解决回归；产物新鲜；实际代码消融完成。真实 Agent 总耗时指标允许明确未测，不影响上述已定义完成条件。

需要新的布局语义、修改用户要求的 pins、扩大外部权限或变更 Git 目标时，暂停受影响工作并请求决定，不自行改写 Goal 或删掉失败验收项。

## 审核阶段记录

以下为授权之前的审核记录：当时仅写目标，未启动运行 Goal。参考历史证据是 2026-09-20 在上述 SHA 的本地基线：49 项相关回归通过、1 项浏览器测试跳过；并非本方案功能的验证。该审核轮只做合同/代码复核和文档检查。

设计消融后复核了六组验收覆盖和两文档的全部相对链接；未发现缺失路径、冲突标记或尾随空白。这是文档一致性检查，不是实现测试。

上述主要决定已由用户确认：本次完整覆盖四类内容画布；旧输入默认不变、新图显式选择 content；显式 frame 权威；槽位扩展独立；完成后仅本地提交。用户随后明确授权开始，并再次要求保持行、阶段、列限制。
