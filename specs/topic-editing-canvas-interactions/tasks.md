# 主题编辑与画布交互优化任务清单

## 任务规则

- 只有代码、测试或文档实际完成并通过对应检查后才能勾选任务。
- 实施前读取目标文件并保留工作区中与本功能无关的现有修改。
- 所有持久化编辑继续经过现有 Command、history 和 autosave；不得把 draft、pointer 或 drag ghost 写入 `MindMapDocument`。
- layout 和 renderer 保持平台无关，不得引入 DOM、Canvas 或浏览器 API。
- 每个批次完成后先运行针对性验证，全部任务完成后再运行全量门禁。

## 0. 基线与测试准备

- [x] **T001 — 锁定主题尺寸与编辑交互基线**
  - 在现有 layout、renderer 和 E2E 测试中记录短文本、长文本、`fixedWidth`、编辑器 bounding box、主题拖动、左键框选和右键平移的当前行为。
  - 确认当前失败只来自本规格预期改变的行为，不顺带修改无关功能。
  - 运行目标测试并记录基线结果。
  - 覆盖：AC-01、AC-02、AC-04、AC-05、AC-13。

- [x] **T002 — 添加确定性的文字与交互测试 fixtures**
  - 增加短中文、短英文、连续中文、无空格长英文、emoji、显式换行、不同字体样式和 `fixedWidth` 节点 fixtures。
  - 为普通主题、Floating Topic root、root、叶子主题、折叠主题和多选状态准备稳定测试数据。
  - Fixture 不得依赖 DOM 测量或随机 ID。
  - 依赖：T001。覆盖：AC-01、AC-03、AC-06 至 AC-14。

## 1. 统一主题文字测量

- [x] **T003 — 抽取共享主题文字 metrics**
  - 从 `packages/mindmap-layout/src/layout.ts` 抽取平台无关的纯文字测量 helper。
  - 统一自然文字宽度、可用内容宽度、`charactersPerLine`、line count 和 line height 的计算。
  - 在 `packages/mindmap-layout/src/types.ts` 和 `index.ts` 中仅暴露必要的只读类型与 API。
  - 不引入 DOM、Canvas 或持久化字段。
  - 依赖：T002。覆盖：AC-01、AC-13。

- [x] **T004 — 实现自动宽度自然撑开与最大宽度换行**
  - 调整 `estimateMindMapNodeSize`，移除自动宽度对默认 `nodeWidth=176` 的硬下限。
  - 保留安全最小点击宽度、内容块宽度、padding 和 `maxNodeWidth` 上限。
  - 达到最大宽度前保持单行自然增长，达到上限后换行并增加高度。
  - `fixedWidth` 继续优先且遵循现有限制。
  - 依赖：T003。覆盖：AC-01、AC-13。

- [x] **T005 — 让 SVG scene 复用共享换行规则**
  - 更新 `packages/mindmap-renderer-svg/src/scene.ts`，使用 T003 的共享 metrics 生成 `textLines`。
  - 删除或收敛 renderer 内重复的字符宽度、换行和 line-height 推导。
  - 确保编辑画布与 SVG/PNG 导出使用一致的行数、bounds 和文本位置。
  - 优先保持 `SvgSceneNode` 公共结构不变；确需增加字段时只增加派生只读元数据。
  - 依赖：T003、T004。覆盖：AC-01、AC-02、AC-12、AC-13。

- [x] **T006 — 完成 layout 与 renderer 文字测量测试**
  - 在 `packages/mindmap-layout/src/index.test.ts` 覆盖短文本自然宽度、最大宽度封顶、长单词、中文、emoji、显式换行、内容块和 `fixedWidth`。
  - 在 `packages/mindmap-renderer-svg/src/scene.test.ts` 验证 text lines、主题高度、连接线 bounds 和导出不裁切。
  - 运行 layout 与 renderer 针对性测试。
  - 依赖：T004、T005。覆盖：AC-01、AC-12、AC-13。

## 2. 无跳动的主题编辑

- [x] **T007 — 将 active draft 接入展示测量数据流**
  - 在 `apps/web/src/components/mind-map-canvas.tsx` 中为当前编辑节点构造仅用于 presentation 的临时节点文本。
  - 让该节点的 `nodeSizes`、layout、scene 和 textarea geometry 消费同一 draft。
  - draft 不进入 document、Command、history 或 autosave；取消编辑后恢复原 document 文本和测量。
  - 初次进入时 draft 与 document 相同，进入编辑前后几何必须一致。
  - 依赖：T006。覆盖：AC-01、AC-02、AC-13。

- [x] **T008 — 对齐编辑器 overlay 与主题视觉**
  - 为 textarea 增加稳定 ref，并使用 scene bounds、computed node style 和共享 padding 设置位置与样式。
  - 使用 `box-sizing: border-box`，移除额外 border、outline、box-shadow 和浏览器默认 appearance。
  - 保持背景透明，由底层 SVG 主题继续展示 shape、fill、stroke 和圆角。
  - 对齐字体、字号、字重、字体样式、文字颜色、对齐和 line-height。
  - 依赖：T007。覆盖：AC-02、AC-12、AC-14。

- [x] **T009 — 实现进入编辑时一次性全选**
  - 在每次新的 editing session 开始后执行 textarea `focus()` 与 `select()`。
  - 双击、`F2` 和创建后自动编辑均使用同一路径。
  - draft 输入更新时不得重复全选；点击、方向键和拖选继续使用浏览器标准文本行为。
  - IME composition 与 `Ctrl/Cmd+Enter` 提交行为保持不变。
  - 依赖：T008。覆盖：AC-03、AC-13、AC-14。

- [x] **T010 — 增加主题编辑视觉与行为回归测试**
  - 验证进入编辑前后主题、textarea、相邻主题和 connector 的 bounding box 不发生非内容驱动变化。
  - 验证 textarea 无 border，字体和 padding 与主题一致。
  - 验证默认全选、直接替换、取消全选后局部编辑、取消与提交。
  - 验证输入增长到最大宽度后才换行，并覆盖非 100% zoom。
  - 依赖：T007 至 T009。覆盖：AC-01、AC-02、AC-03、AC-12、AC-13。

## 3. 画布平移与 Alt 框选

- [x] **T011 — 重排 pointerdown 意图分流**
  - 将空白区域鼠标左键设置为 `pan` candidate。
  - 将 `Alt + 空白区域鼠标左键` 设置为 `marquee` candidate。
  - 主题左键继续进入 topic drag candidate；控件和 editable target 继续自行处理。
  - 保留右键 pan 作为兼容入口，但不再作为主要交互。
  - 仅在 pointerdown 时锁定 `Alt` 意图，拖动中 modifier 变化不得切换模式。
  - 依赖：T001。覆盖：AC-04、AC-05、AC-13。

- [x] **T012 — 统一 pointer 取消与清理路径**
  - 确保 pointerup、pointercancel、`Escape`、窗口 blur 和 pointer capture 丢失都会清理 pan、marquee、drop preview 和 drag visual state。
  - 未达到 4px 阈值的空白点击保持现有选择清理语义。
  - 左键 pan 不修改 document 或 selection；Alt marquee 继续支持现有追加选择规则。
  - 更新画布 cursor，使默认状态表达可平移，pan 激活时显示 grabbing，Alt marquee 显示框选反馈。
  - 依赖：T011。覆盖：AC-04、AC-05、AC-13、AC-14。

- [x] **T013 — 更新平移与框选自动化测试**
  - 将原“左键框选、右键平移”E2E 更新为“左键平移、Alt+左键框选”。
  - 验证 pan 不生成 marquee，Alt marquee 不改变 viewport。
  - 覆盖 `Ctrl/Cmd/Shift` 追加选择、未越过阈值、`Escape`、pointercancel 和窗口失焦。
  - 验证文本编辑状态下 `Alt` 不拦截正常输入。
  - 依赖：T011、T012。覆盖：AC-04、AC-05、AC-13、AC-14。

## 4. 主题周边快捷创建与折叠控件

- [x] **T014 — 定义快捷创建 eligibility 与位置规则**
  - 为单选主题计算 child/sibling 快捷入口可用性。
  - 中央主题不显示快捷入口；普通非 root 主题显示 child 和 sibling；Floating Topic root 仅显示 child。
  - 多选、增强对象选择、editing 和 dragging 状态不显示快捷入口。
  - 从 `SvgSceneNode` 派生右侧和下方位置，不修改 layout bounds 或 connector geometry。
  - 依赖：T006。覆盖：AC-06、AC-07、AC-08、AC-14。

- [x] **T015 — 实现右侧子主题与下方同级主题按钮**
  - 在 Canvas 中渲染不参与导出 scene 的两个加号按钮。
  - 右侧按钮复用 `createChildNodeCommand`，下方按钮复用 `createSiblingNodeCommand`。
  - 创建成功后选择新主题并调用既有 `beginNewNodeEditing`。
  - 阻止按钮 pointer 事件冒泡到 pan、marquee 或 topic drag 状态机。
  - 增加中英文 accessible name、`Enter`/`Space` 激活、可见 focus 状态和足够点击区域。
  - 依赖：T009、T014。覆盖：AC-06、AC-07、AC-08、AC-13、AC-14。

- [x] **T016 — 让折叠控件仅随选择出现**
  - 将折叠/展开控件渲染条件改为“主题具有 children 且该主题当前被选中”。
  - 未选中、editing 或 dragging 时隐藏控件，不改变 node bounds、文字位置或 connector endpoint。
  - 折叠主题重新选中后显示展开入口，继续调用现有 collapse Command。
  - 保持 accessible name 和现有 undo/redo、autosave 行为。
  - 依赖：T014。覆盖：AC-09、AC-12、AC-13、AC-14。

- [x] **T017 — 完成快捷创建与折叠控件测试**
  - 覆盖普通主题、root、Floating Topic root、叶子主题、折叠主题、多选和增强对象选择。
  - 验证按钮位置在 100%、缩放和平移后正确，且窄窗口无页面横向溢出。
  - 验证 child/sibling 创建顺序、默认全选、undo/redo、autosave 和刷新恢复。
  - 验证折叠控件出现/消失前后主题及 connector geometry 不变。
  - 依赖：T015、T016。覆盖：AC-06 至 AC-09、AC-12 至 AC-14。

## 5. 主题拖动视觉与 hover 稳定性

- [x] **T018 — 建立独立的 topic drag visual state**
  - 在 Canvas 局部增加 `TopicDragVisualState`，记录拖动 roots、来源节点、当前 client point 和是否越过阈值。
  - 不把高频 pointer position 写入 `MindMapDocument`；优先不扩展全局 Zustand store。
  - `.is-dragging` 改为依赖 active drag，而不是是否存在合法 `dragPreview`。
  - 在空白、合法目标和非法目标上移动时，来源主题始终保持半透明。
  - 依赖：T012。覆盖：AC-10、AC-13。

- [x] **T019 — 实现跟随鼠标的拖动浮层**
  - 渲染独立 drag ghost，展示被拖 root 的文字、shape、fill、stroke 和基础字体。
  - ghost 位置跟随鼠标，不被 SVG scene 裁切，并设置 `pointer-events: none`。
  - 不复制完整 subtree、图片、公式或增强对象，不参与 drop hit test 或 scene bounds。
  - drop 成功、无效 drop、Floating Topic 移动、`Escape`、pointercancel 和 blur 后同时清理 ghost 与来源透明度。
  - 依赖：T018。覆盖：AC-10、AC-11、AC-13。

- [x] **T020 — 消除 hover 与状态切换造成的几何跳动**
  - 审核 `.mind-map-node` 的 hover、focus、selected、editing、collapsed、search result 和 dragging 样式优先级。
  - 将 hover 高亮实现为不影响布局测量和 DOM/SVG geometry 的 filter、outline 或等价外绘效果。
  - 确保 hover 不新增占位 border、padding 或控件，且选中和键盘 focus 仍清晰可见。
  - 依赖：T008、T016、T019。覆盖：AC-02、AC-09、AC-12、AC-14。

- [x] **T021 — 完成拖动与 hover 浏览器回归测试**
  - 验证拖动越过阈值后来源半透明，ghost 跟随鼠标，drop indicator 独立工作。
  - 覆盖拖过空白、合法/非法目标、普通主题、Floating Topic、取消和窗口失焦。
  - 反复 hover 前后比较主题 bounds、connector endpoint、邻居位置和 stage scroll size。
  - 验证从主题文字开始拖动不产生浏览器文字选择。
  - 依赖：T018 至 T020。覆盖：AC-10、AC-11、AC-12、AC-13。

## 6. 本地化、文档与仓库卫生

- [x] **T022 — 完成本地化资源与类型验证**
  - 更新 `zh-CN.ts` 与 `en.ts` 的快捷创建 accessible name 和必要提示文案。
  - 同步 `messages.ts`、`scene.ts` 或现有 i18n 类型入口。
  - 更新 i18n 测试，确保中英文键完整一致且语言切换不丢失导图内容。
  - 依赖：T015、T016。覆盖：AC-06、AC-07、AC-09、AC-14。

- [x] **T023 — 更新用户功能文档**
  - 更新 `docs/USER_GUIDE.md`：左键平移、`Alt + 左键` 框选、快捷创建、按需折叠控件、默认全选和拖动 ghost。
  - 更新 `docs/CURRENT_FEATURES.md` 中的主题、画布、选择和拖动说明。
  - 文档必须与最终实现和中英文 accessible name 保持一致。
  - 依赖：T013、T017、T021、T022。

- [x] **T024 — 审核并更新 `.gitignore`**
  - 检查本功能新增的 Playwright 截图、trace、视频、浏览器 profile、临时导出和缓存路径是否已被忽略。
  - 只在现有规则未覆盖实际生成物时更新 `.gitignore`；不得忽略 source、spec、测试 fixture 或验证文档。
  - 用 `git status --short` 确认没有未登记的临时产物。
  - 依赖：T021。

- [x] **T025 — 更新 `CODE_MAP.md`**
  - 记录共享文字 metrics API、draft presentation measurement、pointer 意图状态机、快捷创建控件和 drag visual state 的代码入口。
  - 更新相关测试定位和数据流说明。
  - 不把计划中的候选路径描述成未实现的既定事实。
  - 依赖：T003 至 T022。

- [x] **T026 — 更新 `PROJECT_PROGRESS.md`**
  - 在实现和验证完成后记录本 feature 的完成状态、AC-01 至 AC-14 结论和实际测试数量。
  - 记录未解决风险或浏览器限制，不提前宣称未执行的浏览器验收通过。
  - 依赖：T023 至 T025、T028、T029。

## 7. 综合验证与验收

- [x] **T027 — 运行针对性验证**
  - 运行 layout、renderer、selection、actions、i18n 和目标 E2E 测试。
  - 修复本功能引入的失败，不通过放宽断言掩盖主题跳动、拖动状态或 selection 错误。
  - 记录命令、通过数量、耗时和非阻塞警告。
  - 依赖：T006、T010、T013、T017、T021、T022。

- [x] **T028 — 运行全量质量门禁**
  - 依次运行 `npm run format:check`、`npm run lint`、`npm run typecheck`、`npm test`、`npm run build` 和 `npm run test:e2e`。
  - 运行 `git diff --check`，确认没有 whitespace error。
  - 对任何失败定位根因并修复；无法运行时准确记录原因和未验证范围。
  - 依赖：T027。

- [x] **T029 — 完成 Chrome、Edge 与响应式视觉验收**
  - 使用 `playwright.browser-acceptance.config.ts` 在本机 Chrome 和 Edge 运行验收。
  - 在 1440×900 和宽度不超过 960px 的窗口检查编辑、平移、Alt 框选、快捷按钮、折叠、drag ghost 和 hover 稳定性。
  - 检查 100%、放大、缩小和平移后的控件位置与页面 overflow。
  - 保存可追踪但不提交二进制临时产物的验证证据。
  - 依赖：T028。

- [x] **T030 — 创建最终验证报告**
  - 创建 `specs/topic-editing-canvas-interactions/verify.md`。
  - 将 AC-01 至 AC-14 分别映射到实现文件、单元测试、E2E 和 Chrome/Edge 证据。
  - 汇总最终命令结果、已修复问题、剩余风险和 `.gitignore` 检查结论。
  - 确认 `PROJECT_PROGRESS.md` 与验证报告一致。
  - 依赖：T026、T029。

## 批次与依赖顺序

1. **批次 A：T001–T002** — 锁定基线与 fixtures。
2. **批次 B：T003–T006** — 统一文字测量和自动宽度。
3. **批次 C：T007–T010** — draft 测量、编辑器视觉和默认全选。
4. **批次 D：T011–T013** — 左键 pan 与 Alt marquee。
5. **批次 E：T014–T017** — 快捷创建和按需折叠控件。
6. **批次 F：T018–T021** — 来源半透明、drag ghost 和 hover 稳定性。
7. **批次 G：T022–T025** — 本地化、用户文档、`.gitignore` 和 `CODE_MAP.md`。
8. **批次 H：T027–T029 → T026 → T030** — 针对性/全量/跨浏览器验证、进度与验证报告收尾。

T003–T006 是后续编辑器尺寸稳定性的基础；T011–T013 可在批次 B 完成后与 T007–T010 并行实施，但合并前必须共同运行 Canvas E2E。T026 必须使用 T028–T029 的真实结果填写，不得提前完成。
