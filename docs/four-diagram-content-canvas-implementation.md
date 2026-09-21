# 四类图内容自适应画布：交付与验收

状态：**实现和 AC-1 至 AC-6 验收完成，随本次本地提交交付；没有推送。**

## 范围与版本

- 授权合同：[Goal](codex-goal-four-diagram-adaptive-canvas.md)；行、阶段、列限制不变。
- 分支：`labs/adaptive-workflow-canvas-pilot`；本轮基线：`476729736775b308b50cbe404bc1b84c8f674516`。
- 开工只读核查：PR #478 open/unmerged，head 与基线一致；远端 dev 为 `5769206e556e3a74a382b826ad84391080280ccc`。遵照用户指令继续既有分支，未 merge/rebase dev。
- 没有推送、更新远端 PR、发布、改版本或安装 live Skill。既有未跟踪 `artifacts/` 不纳入提交。
- 环境：macOS arm64、Node 22.23.1、真实 Chrome。交付 revision 为包含本报告的本地提交；[证据索引](evidence/four-diagram-content-canvas/verification.json)绑定源文件和产物哈希。

## 交付能力

| 类型 | 本轮交付 | 保持不变 |
| --- | --- | --- |
| Architecture | 补齐旧 auto 遗漏路径；content 测量节点、边界标题、标签、描边、箭头和图例 | 显式坐标、尺寸、路由、grid 列限制 |
| Dataflow | 内容决定画布，再生成 stage 背景底部 | row 0–4、最多 5 stages、stage/row/yOffset |
| Sequence | 完整时间轴、segment/activation、图例；spread 有界收敛 | fixed 列距、作者时间、参与者顺序；不增加路由语法 |
| Lifecycle | 状态、圆角通道、带标题、轨道、label/note、图例 | main 0–4、event/terminal 0–2、既有三带模型 |
| Workflow v1/v2 | 共享 Viewer 回归，不迁移其编译器 | 原 schema、几何和回执 |

四类 schema-v1 新增可选 `meta.canvas_fit: "content"`：省略 viewBox 时计算有限完整画布，提供 viewBox 时尊重固定容量。旧输入不自动启用。新图 authoring 指引选择 content，修改旧输入则保留原意图。

五类均支持 `validate --layout-json`。content 成功回执含完整范围、贡献者和 canonical frame；早期失败保留非零 JSON。尺寸修复建议经过隐式求解和显式确认，不用加尺寸掩盖独立碰撞。

权威规则：[content canvas](../archify/references/content-canvas.md)。共享 Module 只处理有限范围、图例容量和诊断；各 renderer 保有拓扑、布局和路由，没有第二套 Scene、通用编译器或 solver 插件层。

## 使用与示例

新图设置 `meta.canvas_fit: "content"`；没有固定尺寸要求就不写 viewBox。它不解除槽位限制、不修复节点重叠、不自动重排。

| 类型 | 可编辑源 | 可打开示例 |
| --- | --- | --- |
| Architecture | [24 节点源](../archify/examples/content-services.architecture.json) | [HTML](../examples/content-services.architecture.html) |
| Dataflow | [25 节点源](../archify/examples/content-pipelines.dataflow.json) | [HTML](../examples/content-pipelines.dataflow.html) |
| Sequence | [12 参与者源](../archify/examples/content-release.sequence.json) | [HTML](../examples/content-release.sequence.html) |
| Lifecycle | [11 状态源](../archify/examples/content-recovery.lifecycle.json) | [HTML](../examples/content-recovery.lifecycle.html) |

画布是完整 SVG 世界，屏幕只是其一部分。大图入口聚焦可读内容，离屏节点仍可导航，导出仍包含全图。Lifecycle 示例在测试桌面尺寸下为 small；它验证扩容和全部导航，不声称强制进入 large。

## 验收台账

| 标准 | 结果 | 证据 |
| --- | --- | --- |
| AC-1 模式/兼容/几何 | pass | 73 项新增静态测试纳入最终 npm test；小固定画布双 profile、精确描边边界、实体/关系/文本/via 保留；[14 组 legacy SVG](evidence/four-diagram-content-canvas/legacy-svg-comparison.json)字节一致，含 Workflow v1/v2 |
| AC-2 正负矩阵 | pass | 16 个容量/补充样例、12 个合法控制；[旧版实测](evidence/four-diagram-content-canvas/baseline-paint.json)区分裁切/拒绝/already-contained；错误 row/stage/col、引用、重叠、负通道、极端线宽仍拒绝；真实 Chrome 独立测量含品牌控制 |
| AC-3 确定性/预算/修复 | pass | 每类 5 次独立 layout-json 一致；render/validate/deliver 一致；spread 32 次上限失败；[四类容量修复及精确边界](evidence/four-diagram-content-canvas/repair-boundary.tap) 5/5 |
| AC-4 浏览/导出 | pass | [最终 32 组桌面](evidence/four-diagram-content-canvas/desktop.json)、[专项 3/3](evidence/four-diagram-content-canvas/content-browser.tap)、[移动端和真实栅格导出](evidence/four-diagram-content-canvas/mobile-export.json)，视觉目检单列如下 |
| AC-5 收益/开销 | pass | 12/12 已复现容量失败解决；[最终串行性能](evidence/four-diagram-content-canvas/performance-final.json) 24/24 组达标，门槛未改；Agent 总耗时未测 |
| AC-6 交付/维护 | pass | [npm test](evidence/four-diagram-content-canvas/npm-test.log)：2082 pass / 0 fail / 74 条件 skip；[browser gate](evidence/four-diagram-content-canvas/browser-gate.log)：239 pass / 0 skip；[WebM](evidence/four-diagram-content-canvas/webm-gate.log)；[ZIP 可复现](evidence/four-diagram-content-canvas/zip-repro.tap)、[解包烟测](evidence/four-diagram-content-canvas/package-smoke.log)、[四类解包命令](evidence/four-diagram-content-canvas/extracted-four-types.json) |

全量 browser gate 后仅整理 Lifecycle 验收示例、补充证据记录；最终四类专项 3/3 和移动端记录专项 1/1 已重跑。运行时没有后续变化。最终 npm test 包含新增的精确边界与四类型容量修复测试。

### 自动浏览与视觉目检分别记录

桌面每类 4 viewport × light/dark，检查页面边界、节点阅读门槛、Dock 避让、全部节点/关系可达与 canonical SVG 导出稳定性。每组全量导航：

- Architecture：24/24 节点、23/23 关系。
- Dataflow：25/25、20/20。
- Sequence：12/12、11/11。
- Lifecycle：11/11、10/10。

390×844、844×390 每类搜索首尾节点，核验选中 ID、Finder 关闭、Passport 在屏内且关闭按钮可点击；保留手机普通纵向滚动，不宣称触屏硬件测试。记录中包含 preset、camera 和选中状态。

每类实际输出并解码 PNG/JPEG/WebP，核验尺寸、非空内容和 16M 像素预算。受控超预算输入在分配 canvas 前拒绝并给 SVG 退路；WebM 静态门禁及超预算预检保留。独立 WebM 真解码观测为 100257 bytes、9 sampled frames、9 unique；站点语言测试 7/7。

目检四类各 light/dark 共 8 张最终截图：标题、主节点和连接清楚，页面无横纵溢出，Dock 无遮挡。大图入口右/下方离屏属于视口裁切，非 canonical 内容丢失；完整导出由独立检查证明。全图概览不要求所有细节文字同时可读。

Lifecycle 示例原恢复状态位于终态标题下方，目检后修正示例 offset，并为终态关系补语义标签及合法 labelAt；未改编译器位置规则。原截图没有充当最终通过证据。

最终截图：[Architecture light](evidence/four-diagram-content-canvas/architecture-light.png) / [dark](evidence/four-diagram-content-canvas/architecture-dark.png)，[Dataflow light](evidence/four-diagram-content-canvas/dataflow-light.png) / [dark](evidence/four-diagram-content-canvas/dataflow-dark.png)，[Sequence light](evidence/four-diagram-content-canvas/sequence-light.png) / [dark](evidence/four-diagram-content-canvas/sequence-dark.png)，[Lifecycle light](evidence/four-diagram-content-canvas/lifecycle-light.png) / [dark](evidence/four-diagram-content-canvas/lifecycle-dark.png)。预设 Classic，入口 zoom/profile 见 desktop.json。

### 收益、性能和失败记录

测试集未删除失败输入。旧版只移除其不认识的 canvas_fit，不把 schema 不认识字段当容量失败。Architecture 无标签外绕、粗箭头外绕、纯 marker 溢出共 3 个裁切；Dataflow 2 拒绝、1 裁切；Sequence 3 个时间轴/列宽拒绝；Lifecycle 1 拒绝、2 圆角通道裁切。候选全部一次编译并通过独立完整性：12/12。

另 4 个边界/中英文长图例样例在旧版已完整显示，保留为补充控制，不算修复收益。它们覆盖新模式的保守文字测量和图例布局。

性能使用 12 个双方成功的相同 legacy 输入，每例 render/validate、3 次预热、10 对串行 AB/BA；衡量兼容路径额外开销，不是 Agent 总耗时。median ≤ max(A×1.10,A+5ms)，P95 ≤ max(A×1.15,A+15ms)，最终 24/24 达标。机器、Node、每个输入 hash 和原始样本均在 performance-final.json。

初次 23/24 通过，event-stream validate 一次 P95 越线；[原始失败和 A/A](evidence/four-diagram-content-canvas/performance-initial.json)、[30 对复测](evidence/four-diagram-content-canvas/performance-initial-recheck.json)保留，后者 2/2 通过。中途 npm test 的 EPERM 来自沙箱禁止本地监听，另有同步中的生成物新鲜度和已失效的 Sequence layout-json 拒绝断言；已分别用获准环境、重建及更新兼容测试解决。最终冻结源码回归全绿，不把中途失败重标为通过。

### 实际消融

| 候选 | 操作与原验收 | 最终处理 |
| --- | --- | --- |
| 重复、未经验证的 candidateViewBox / 成功回执 requiredViewBox | 删除后[66/66 静态验收](evidence/four-diagram-content-canvas/ablation-duplicate-size-final.tap)通过；后续完整验收也通过 | 永久删除，仅失败诊断提供经过验证的足够尺寸 |
| marker 三角形范围 | 暂时移除，公开 render 把越过原点的箭头错误判为成功，[负例变红](evidence/four-diagram-content-canvas/ablation-marker-removed.tap)；恢复后原测试及独立 Chrome 完整性通过 | 恢复，不能只测中心线或描边 |
| 近门槛 micro-zoom 行为修改 | 诊断时尝试，未解决实测入口问题；回退尝试，改为等待 Dock/Reader 稳定；最终 browser gate 239/239 | 不保留额外缩放策略变更 |

浏览器输入复用 authoritative JSON 示例，删掉重复图定义。没有新公开导航方法或第二套持久 Scene。

## 最终审查与限制

按 archify-review 的价值/成本/影响检查：值得保留，因为消除了已复现的纯容量失败并隔离 legacy 行为；代价是共享 paint 测量及四类专属范围维护。“只加节点 bbox”漏掉 marker/文字，无限白板 SDK 不解决编译器容量校验。本轮只修复接入触发的必要 Viewer 问题：wrapped-header 高度、消息阅读预算、过早初始化入口。

文字是有限 SVG 子集的保守解析测量，不是任意字体/SVG 引擎。槽位、碰撞、作者 pins、导出像素预算均未解除。Windows 原生主机和真实触控设备未在本机测试；portable/path 回归已包含在 npm test，不能写成 Windows CI 已绿。远端 CI 本轮未触发。

真实 Agent authoring→repair→handoff 总耗时改善 **未测**，不宣称任何百分比收益。

## 生成物与复现

重建 Viewer 模板、两处五类 legacy 与四类新示例、Checkout compare、11 个 Gallery artifact/manifest、README GIF/receipt、Node 22 ZIP。手写 web-app 只机械同步模板拥有的 style/script，保留 SVG。Guide/Start 重建后无差异，未制造无关变更。

```sh
npm --prefix archify test
ARCHIFY_CHROME="/path/to/chrome" npm --prefix archify run test:browser
ARCHIFY_CHROME="/path/to/chrome" npm --prefix archify run test:webm
node scripts/benchmark-content-canvas.mjs /path/to/baseline /tmp/performance.json
scripts/build-zip.sh /tmp/archify-rebuilt.zip
```

浏览器 A/B 可设 ARCHIFY_CONTENT_BASELINE_ROOT 指向基线 Git archive，ARCHIFY_CONTENT_EVIDENCE 指向新的空目录，再运行 `node --test archify/test/content-canvas-browser.test.mjs`。Chrome 按仓库要求在沙箱外启动。解包烟测从仓库外路径执行，不安装 live Skill。
