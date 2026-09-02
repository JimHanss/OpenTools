# 主题编辑与画布交互优化技术计划

## 方案摘要

本功能只调整 Web 编辑器的主题测量、直接编辑和 pointer 交互，不改变 `MindMapDocument`、Command 语义、文件 schema 或存储适配器。

实现分为四条相互约束的数据流：

1. 将自动宽度主题的测量规则调整为“内容自然宽度 → 最大宽度封顶 → 超限换行”，并让 layout 与 SVG scene 共用一致的换行参数。
2. 用当前编辑 draft 构造仅用于展示和测量的临时节点，使 textarea、主题背景和 scene geometry 使用同一组尺寸与样式；draft 仍不写入 document，提交时才执行 `updateNodeText` Command。
3. 重排现有 pointer 状态机：空白左键为 `pan`，`Alt + 空白左键` 为 `marquee`，主题左键仍为 `drag`；将“拖动已经开始”与“当前存在有效 drop target”分离。
4. 在选中主题外侧渲染不参与 layout bounds 的快捷控件和拖动浮层，所有持久化创建、折叠和移动继续调用既有 Command/action 路径。

## 当前实现基线

- `packages/mindmap-layout/src/layout.ts` 中的 `estimateMindMapNodeSize` 已支持 `fixedWidth` 和 `maxNodeWidth=350`，但自动宽度至少使用 `nodeWidth=176`，因此短文本无法完全按内容自然收缩。
- `packages/mindmap-renderer-svg/src/scene.ts` 独立重复字符宽度与换行计算，必须继续和 layout 保持一致，否则会出现主题高度、文本行数和编辑区域不一致。
- `apps/web/src/components/mind-map-canvas.tsx` 使用 document 节点估算 `nodeSizes`；编辑 draft 只进入 textarea，不参与 layout/scene 测量。
- `.node-text-editor` 已无 border，但 padding、圆角和背景策略是固定 CSS，未完整消费当前主题 shape/style，也没有显式执行 `select()`。
- 空白区域主键目前进入 `marquee`，鼠标右键或非鼠标指针进入 `pan`。
- `dragPreview` 只在鼠标位于合法 drop target 上时存在；因此当前 `.is-dragging` 半透明状态不能覆盖拖过空白区域的完整过程。
- 折叠控件对所有具有 children 的可见主题持续渲染，未以选择状态为条件。
- 同级和子级创建已经由 `createSiblingNodeCommand`、`createChildNodeCommand`、统一 action dispatcher、history 和 autosave 支持，可以直接复用。

## 受影响的文件和模块

### 布局与文本测量

- `packages/mindmap-layout/src/layout.ts`
  - 调整自动宽度的最小值策略。
  - 抽取可复用的主题文字测量/换行参数 helper，统一自然宽度、最大宽度、每行字符数和 line height 的计算。
- `packages/mindmap-layout/src/types.ts`
  - 仅在共享 helper 需要公开结构化结果时增加只读类型；不新增持久化字段。
- `packages/mindmap-layout/src/index.ts`
  - 导出 renderer 和 Web 层需要复用的纯函数或常量。
- `packages/mindmap-layout/src/index.test.ts`
  - 覆盖短文本自然宽度、最大宽度封顶、中英文/长单词/emoji/显式换行和 `fixedWidth` 回归。

### SVG scene 与渲染契约

- `packages/mindmap-renderer-svg/src/scene.ts`
  - 复用 layout 的换行/文本几何规则，移除两套规则漂移。
  - 保持 `SvgSceneNode` 的持久化无关属性不变；如编辑器需要精确文本内容框，则只增加派生的只读 padding/text bounds 元数据。
- `packages/mindmap-renderer-svg/src/scene.test.ts`
  - 验证自然宽度节点的 text lines 与 layout 高度一致，最大宽度后才换行，导出结果不裁切。

### Web 编辑器状态与交互

- `apps/web/src/components/mind-map-canvas.tsx`
  - 将 active draft 注入临时测量节点。
  - 为 textarea 建立 ref，在每次进入新的编辑 session 后 focus 并 `select()`。
  - 根据 scene node 与 computed style 设置编辑器位置、padding、背景、圆角、字体、line-height 和 box sizing。
  - 重排 pointer down 分流，增加 `Alt` marquee 判定。
  - 增加独立的 topic drag visual state，记录拖动 roots、起点、当前 client point 和是否越过阈值。
  - 仅在单选合法主题且不处于 editing/dragging 时渲染右侧/下方快捷创建控件。
  - 折叠控件只在对应主题被选中时渲染。
  - 渲染不参与 document/layout 的拖动浮层，并保证 `pointer-events: none`。
- `apps/web/src/editor/store.ts`
  - 继续保留 `EditorDragPreview` 只描述 drop target。
  - 优先把 pointer position 和 drag ghost 保持为 Canvas 局部瞬态状态；只有其他组件确实需要消费时才扩展 store，避免高频 pointer move 造成全局 Zustand 更新。
- `apps/web/src/editor/actions.ts`
  - 原则上不改 Command builder；补测试或增加“是否允许创建同级/子级”的纯 eligibility helper 时，保持 root/Floating Topic 规则明确。
- `apps/web/src/editor/selection.test.ts`、`apps/web/src/editor/actions.test.ts`
  - 补充 Alt marquee 的选择合并规则或快捷创建 eligibility 测试（取决于 helper 最终归属）。

### 样式与本地化

- `apps/web/src/styles.css`
  - 将画布默认 cursor 从框选语义调整为可平移语义。
  - hover/selected/editing 样式只使用不参与几何计算的 `filter`、outline 或外绘 stroke 策略。
  - 统一 textarea 的 `box-sizing`、padding、border、outline、overflow 和 shape 修饰，禁止浏览器默认控件样式造成尺寸差异。
  - 增加快捷创建按钮、拖动来源和 drag ghost 样式。
- `apps/web/src/i18n/resources/zh-CN.ts`
- `apps/web/src/i18n/resources/en.ts`
- `apps/web/src/i18n/messages.ts`
- `apps/web/src/i18n/scene.ts`
  - 增加“创建子主题”“创建下一个同级主题”等 accessible name；如果现有 i18n 类型由资源自动推导，则只更新必要文件。
- `apps/web/src/i18n/*.test.ts`
  - 保持中英文资源键一致。

### 浏览器验收与文档

- `apps/web/e2e/mind-map-mvp.spec.ts`
  - 更新原“左键框选、右键平移”场景为“左键平移、Alt+左键框选”。
  - 扩展主题编辑/拖动场景，覆盖全选、无 border、无 entry jump、hover geometry 稳定、来源半透明和 ghost 跟随。
  - 增加快捷创建和折叠控件可见性、可访问性、history/autosave 回归。
- `docs/USER_GUIDE.md`
  - 更新画布平移、框选、主题快捷创建、折叠按钮显示和拖动反馈说明。
- `docs/CURRENT_FEATURES.md`
  - 更新鼠标操作与主题创建功能摘要。
- `PROJECT_PROGRESS.md` 与 `specs/topic-editing-canvas-interactions/verify.md`
  - 实施完成后记录验收状态、命令和浏览器证据；本计划阶段不提前标记完成。

## 架构与数据流

### 1. 自动宽度与场景文本

```text
MindMapNode + computed style + layout config
  -> shared topic text metrics
     -> estimated node size
        -> layout node bounds
           -> SVG scene text lines
           -> Web textarea geometry
```

自动宽度计算顺序：

1. 根据字体大小和统一字符宽度估算每个显式行的自然文字宽度。
2. 加上水平 padding、编号占用和内容块最小需要宽度。
3. 自动宽度使用内容宽度与最小可交互宽度的较大值，不再强制使用默认 `nodeWidth=176`。
4. 达到 `maxNodeWidth` 后固定宽度并重新计算换行数和高度。
5. `fixedWidth` 继续优先，并限制在现有安全范围内。

layout 与 renderer 必须调用同一个纯 helper 或共享相同的返回结果，不允许继续分别推导 `charactersPerLine`。

### 2. 编辑 draft 与临时展示节点

```text
document node
  + active TextDraft（仅当前 node 替换 text）
  -> presentation node
  -> nodeSizes/layout/scene
  -> textarea overlay

commit
  -> updateNodeText Command
  -> history/autosave/document
```

- draft 不写入 `MindMapDocument`，因此取消编辑不会产生 Command 或 autosave revision。
- 第一次进入编辑时 draft 文本等于 document 文本，presentation node 的测量结果必须与原 scene 相同，保证进入编辑零跳动。
- 输入导致内容长度真实变化时允许主题按内容增长或换行；这是内容驱动的布局变化，不属于控件样式跳动。
- textarea 使用 `box-sizing: border-box`，其 outer box 精确等于 `SvgSceneNode` bounds；内部 padding 与 scene 文字 padding一致。
- 对 `underline`、`borderless`、`pill` 等 shape，不给 textarea 增加独立边框；背景仍由下层 SVG 主题块提供，textarea 本身保持透明。
- 用 layout effect 或等价的进入编辑 hook 对 textarea 执行一次 `focus()` 与 `select()`；draft 更新时不得反复重选。

### 3. Pointer 意图状态机

```text
pointerdown
  ├─ editable/control target -> 控件自身处理
  ├─ primary + topic -> topic drag candidate
  ├─ primary + blank + Alt -> marquee candidate
  ├─ primary + blank -> pan candidate
  ├─ secondary + blank -> optional compatibility pan
  └─ other -> ignore

move >= 4px
  -> 激活对应 preview

pointerup / cancel / Escape / blur
  -> commit（若适用）
  -> release capture
  -> 清理全部 preview
```

- `Alt` 只在 pointerdown 起点为空白画布且不处于文本编辑时决定 marquee 意图，避免拖动中 modifier 抖动改变模式。
- `Ctrl/Cmd/Shift` 继续只决定 marquee 完成后的追加选择语义；`Alt` 不替代这些多选合并规则。
- 空白左键 pan 不修改 selection；未超过阈值的空白 click 继续执行现有清空选择逻辑。
- 主题拖动的 active visual state 在超过阈值后立即创建，与 `getDropPreview()` 是否返回目标无关。

### 4. 快捷创建控件

```text
selection + document + editing/dragging state
  -> quick-create eligibility
  -> selected scene node geometry
  -> right child button / bottom sibling button
  -> existing create command
  -> select new node + begin editing
```

- 仅 `selection.kind === 'topic'` 且恰好一个主题时计算。
- 中央主题不显示两个按钮。
- 右侧按钮对普通非 root 主题和 Floating Topic root 可用，用于创建 child。
- 下方按钮仅在节点存在合法 parent 时可用；Floating Topic root 不显示同级按钮。
- 按钮位置从 `SvgSceneNode` 派生，不进入 `nodeSizes`、layout bounds 或 connector geometry。
- `pointerdown` 必须停止向画布状态机传播；点击后复用创建 Command、选择与 `beginNewNodeEditing`。
- SVG/DOM 控件实现必须支持 `Enter`/`Space` 激活、明确 `aria-label` 和可见 focus ring。

### 5. 折叠控件与拖动视觉

- 折叠控件的渲染条件改为：source node 有 children 且该 node 为当前 topic selection 成员；多选时仅选中的各自主题显示，编辑/拖动时可隐藏以减少冲突。
- 控件本身位于已有 scene group 内，不改变 `SvgSceneNode` bounds。
- topic drag active 后：
  - 来源主题 group 增加 `.is-dragging`，在任何 drop target 状态下保持半透明。
  - ghost 使用独立 overlay，位置来自当前 client point 转换到 stage 或编辑器容器坐标。
  - ghost 复制被拖 root 的文字、shape、fill、stroke 和基础字体，不复制完整 subtree、图片、公式或增强对象。
  - ghost 使用 `pointer-events: none`，不得参与 `getSceneNodeAtPoint`。
  - drop、取消、pointer cancel、窗口 blur 和 `Escape` 统一经过 `clearPointerInteraction()` 清理。

## 数据模型变更

无持久化数据模型变更：

- 不修改 `MindMapDocumentV3`。
- 不修改 `MindMapNode`、`MindMapNodeStyle` 或 `fixedWidth` 的序列化语义。
- 不修改 JSON/bundle schema、migration 或 IndexedDB 表结构。
- Text draft、marquee、pan、drag active point 和 ghost 都是 Web 层瞬态状态。

可能新增的类型均为派生 UI/测量类型，例如：

- `MindMapTopicTextMetrics`：自然宽度、可用文字宽度、每行字符数、行数和 line height。
- `TopicDragVisualState`：拖动 node IDs、来源 node ID、当前 client point 和 active 标记。
- `TopicQuickCreateAction` 或纯 eligibility 结果：是否允许 child/sibling。

这些类型不得进入 core document 或 format package。

## API 或接口变更

### `mindmap-layout`

计划增加一个平台无关的纯函数，用于 layout 与 renderer 共享主题文字测量参数。建议接口形态：

```ts
interface MindMapTopicTextMetrics {
  readonly naturalTextWidth: number
  readonly contentWidth: number
  readonly charactersPerLine: number
  readonly lineCount: number
  readonly lineHeight: number
}

function measureMindMapTopicText(
  node: MindMapNode,
  width: number,
  config?: MindMapLayoutConfig,
): MindMapTopicTextMetrics
```

最终签名可在任务阶段按避免重复计算的原则微调，但必须保持纯函数、无 DOM 依赖并由 `mindmap-layout/src/index.ts` 导出。

### `mindmap-renderer-svg`

- 优先不改变 `SvgSceneNode` 公共结构。
- 如果 textarea 无法仅由 `textLines` 和 layout config 精确定位，允许增加只读派生字段（例如 `textInset`），但不得影响序列化文件格式。

### Web Canvas

- `MindMapCanvas` 对外 props 不变。
- `EditorDragPreview` 继续仅表示 drop target；drag ghost 不借用该类型，避免“没有合法目标就没有拖动状态”的现有耦合。
- 快捷创建继续调用既有 `createChildNodeCommand` 和 `createSiblingNodeCommand`，不新增 core Command。

## 实施步骤

### 阶段 1：锁定回归基线

1. 为现有短文本宽度、长文本换行、编辑器 box 与主题 box、空白左键框选、右键平移和主题拖动建立当前行为断言。
2. 记录现有失败预期，确保后续测试修改只对应本规格行为变化。
3. 先运行 layout、renderer、selection、viewport 和目标 E2E，避免在交互重写后难以区分既有问题。

### 阶段 2：统一主题文字测量

1. 从 `estimateMindMapNodeSize` 抽取共享文字 metrics。
2. 移除自动宽度对默认 176px 宽度的硬下限，保留安全最小点击宽度、内容块宽度和最大 350px 限制。
3. 让 renderer 的 `createTextLines` 复用同一 metrics/换行结果。
4. 增加 layout 与 renderer 单元测试，确认固定宽度与导出行为无回归。

### 阶段 3：编辑态尺寸与全选

1. 将 active draft 文本用于当前节点的 presentation measurement。
2. 使用 textarea ref 与一次性 editing session effect 实现默认全选。
3. 对齐 textarea outer box、padding、line-height、字体和对齐；保持透明、无 border、无 box-shadow。
4. 验证进入编辑前后的 bounding box、主题背景和 connector geometry 不变；验证输入增长达到最大宽度后才换行。

### 阶段 4：重排画布 pointer 状态机

1. 将空白主键 pointerdown 改为 `pan`。
2. 仅在 pointerdown 时检测 `Alt` 并进入 `marquee`。
3. 保留主题主键拖动和可选的右键兼容 pan。
4. 统一 pointerup、pointercancel、`Escape` 与 blur 清理，验证未越过阈值的 click 语义。
5. 更新 cursor 与 E2E 断言。

### 阶段 5：快捷创建与折叠控件

1. 从 selection 和 document 计算 child/sibling eligibility。
2. 在选中 scene node 外侧渲染右侧和下方按钮，连接已有 create callbacks。
3. 新主题创建后沿用 `beginNewNodeEditing`，进入编辑即全选默认文字。
4. 折叠控件增加 selected 条件，不改变 scene bounds。
5. 增加中英文 accessible name、键盘激活、pointer propagation 和窄窗口测试。

### 阶段 6：拖动来源与 ghost

1. 增加局部 `TopicDragVisualState`，在超过拖动阈值时激活。
2. 来源透明度改为依赖 active drag，而不是 `dragPreview`。
3. 创建跟随 client point 的浮层，复制主题主要视觉并禁用 pointer events。
4. 确认空白、合法目标、非法目标、Floating Topic 和取消路径都能正确显示与清理。

### 阶段 7：hover 稳定性与综合验收

1. 审核 `.mind-map-node:hover`、focus、selected、editing、collapsed 和 search result 的优先级。
2. 将可能改变可视 box 的动态 stroke width 改为不参与布局/测量的外绘方案，或确保 SVG geometry 与 DOM bounding box 断言稳定。
3. 增加反复 hover 前后的 node bounds、connector endpoints、stage scroll size 和邻居位置断言。
4. 跑全量门禁、浏览器验收并更新用户文档与验证报告。

## 风险

### 文本测量仍是字符宽度估算

当前 layout 不依赖 DOM，中文、emoji 和不同字体的真实 glyph 宽度可能与估算值不同。方案必须保持平台中立，因此本阶段继续使用确定性估算，并通过保守宽度、长单词换行和浏览器视觉测试降低溢出风险；不把 Canvas/DOM 测量引入 core/layout。

### 编辑 draft 触发布局频繁更新

每次输入都可能重新计算 node sizes、layout 和 scene。50/500 节点导图中可能产生输入延迟。实施时应只替换当前节点的 presentation text，保持 memo dependency 最小，并在必要时对 draft measurement 使用轻量调度，但不得牺牲输入即时反馈。

### 快捷按钮位于 scene bounds 外

SVG `overflow: visible`、缩放容器和滚动裁切组合可能导致边缘控件不可点击或扩大页面 overflow。控件不得加入导出 scene 或布局 bounds；需要在 100%、缩放、平移、viewport 边缘和窄屏中验证命中区域。若 SVG overflow 命中不稳定，应改用 stage 内的绝对定位 HTML overlay。

### Alt 键与浏览器/系统菜单冲突

Windows 上单按 `Alt` 可能激活浏览器菜单。必须只依赖收到的 pointer event `altKey`，不做全局阻止默认行为；在 Chrome/Edge 实测 `Alt + drag`。无法收到 pointer 事件时保留工具栏/键盘多选路径，不增加系统级监听。

### 拖动 ghost 与高频 render

把每个 pointer move 写入 Zustand 会放大全组件渲染成本。计划优先使用局部 state/ref，或通过 requestAnimationFrame 合并视觉更新；drop target 计算仍使用 scene 坐标，不从 ghost DOM 反推。

### 样式状态优先级

hover、selected、editing、dragging、collapsed 和 search result 可能同时存在。CSS 必须明确优先级并以测试锁定，避免为了消除 hover 跳动而削弱选中、搜索或键盘 focus 的可见性。

### 现有大量未提交工作树改动

仓库已有大范围未提交修改。本功能实施必须只修改计划列出的相关文件，编辑前逐个读取，保留其他用户改动，并用 `git diff --check` 检查新增差异。

## 验证命令

### 针对性验证

```bash
npm test -- packages/mindmap-layout/src/index.test.ts
npm test -- packages/mindmap-renderer-svg/src/scene.test.ts
npm test -- apps/web/src/editor/selection.test.ts apps/web/src/editor/actions.test.ts
npx playwright test apps/web/e2e/mind-map-mvp.spec.ts --grep "topic|text|drag|marquee|panning|collapse"
```

### 全量门禁

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
git diff --check
```

### 浏览器与视觉验收

```bash
npx playwright test --config playwright.browser-acceptance.config.ts
```

人工/浏览器检查至少覆盖：

- 1440×900 桌面窗口和宽度不超过 960px 的窄窗口。
- Chrome 与 Edge。
- 短中文、短英文、长中文、无空格长英文、emoji、显式换行和 fixed width。
- 100%、放大、缩小、平移后的编辑框与快捷按钮位置。
- 左键 pan、`Alt + 左键` marquee、主题 drag、Floating Topic drag。
- 进入编辑默认全选，hover/编辑/拖动前后主题 bounds 无非内容驱动跳动。
- 快捷创建、折叠、undo/redo、autosave 与刷新恢复。

## 所需文档更新

- `docs/USER_GUIDE.md`
  - 将“拖动画布空白处平移”明确为左键拖动。
  - 将框选说明改为 `Alt + 左键拖动`。
  - 增加选中主题右侧/下方快捷创建入口。
  - 说明折叠控件仅在选中主题时出现。
  - 说明拖动来源半透明和跟随浮层。
- `docs/CURRENT_FEATURES.md`
  - 同步鼠标操作与快捷创建能力。
- `PROJECT_PROGRESS.md`
  - 实施并通过验证后追加本 feature 的状态和门禁结果。
- `specs/topic-editing-canvas-interactions/verify.md`
  - 映射 AC-01 至 AC-14 到单元、E2E、Chrome/Edge 和截图证据。

## 需要确认的事项

无。规格中的以下决策已足够明确，可直接进入任务拆分：

- 右侧加号创建 child，下方加号创建下一个 sibling。
- 中央主题不显示快捷加号；Floating Topic root 只显示 child 加号。
- 空白左键为默认 pan，右键 pan 可作为兼容入口保留。
- drag ghost 只复制被拖 root 的主要视觉，不复制完整 subtree。
- `fixedWidth` 继续优先于自动宽度规则。
