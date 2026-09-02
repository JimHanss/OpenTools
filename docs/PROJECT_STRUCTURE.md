# 项目结构与模块职责

本文记录 Web 思维导图 MVP V2 的实际目录、依赖方向与所有权边界。目录发生职责变化时，应同步更新本文和根目录 `CODE_MAP.md`。

## 顶层目录

```text
OpenTools/
├─ apps/
│  └─ web/                         React Web 应用与浏览器平台适配
├─ packages/
│  ├─ mindmap-core/                平台无关领域模型、Command 与查询
│  ├─ mindmap-format/              schema v1/v2/v3、迁移与 bundle
│  ├─ mindmap-layout/              布局策略、子树布局与组合
│  ├─ mindmap-renderer-svg/         SVG 场景、连接线与公式 primitive
│  └─ mindmap-storage/              document/asset 存储 contract 与实现
├─ docs/                            项目结构、文件格式和用户指南
├─ specs/                           SPEC 需求、计划、任务和验证证据
├─ playwright.config.ts             Chromium E2E 配置
├─ playwright.browser-acceptance.config.ts
├─ CODE_MAP.md
└─ PROJECT_PROGRESS.md
```

## 依赖方向

```text
apps/web
  ├─ mindmap-core
  ├─ mindmap-format ── mindmap-core
  ├─ mindmap-layout ── mindmap-core
  ├─ mindmap-renderer-svg ── mindmap-core + mindmap-layout
  └─ mindmap-storage ── mindmap-core
```

核心 package 不依赖 React、DOM、IndexedDB、Clipboard、File System 或下载 API。Web 应用可以组合所有 package，但不能把 UI 状态写回领域模型充当临时缓存。

## `packages/mindmap-core`

`MindMapDocument` 是持久化事实来源，当前 schema 为 v3。主要文件：

- `model.ts`：document、node、Floating Topic placement、结构、labels、assets、theme、Callout、关系线、边界、概要和内容块类型。
- `document.ts`：创建、克隆与默认值构造。
- `commands.ts`：所有 Command union、payload、错误 code 与 Command type 常量。
- `command-executor.ts`：执行 Command、生成精确 inverse、保护 root/cycle/ownership 等不变量。
- `history.ts`：undo/redo 栈；undo 后新编辑会清空 redo。
- `validation.ts`：森林所有权、父子一致性、唯一可达性、资源引用和 enhancement 引用校验。
- `traversal.ts`、`query.ts`、`search.ts`：遍历、祖先/后代、root ownership、筛选和上下文路径。
- `structure-edit.ts`、`tidy.ts`：层级调整与整理预览。
- `labels.ts`、`numbering.ts`、`styles.ts`、`assets.ts`：语义、编号、样式和资源规则。
- `clipboard.ts`：与平台剪贴板无关的 subtree payload、ID 重建和引用修复。

所有持久化编辑都必须以 Command 表达，例如 `AddNode`、`InsertParent`、`DeleteNodeKeepChildren`、`MoveNode`、`ConvertToFloatingTopic`、`UpdateContentBlock` 和 `UpdateStyle`。UI 不应直接修改 document。

## `packages/mindmap-format`

- `schema.ts`：Zod schema v1、v2、v3 和安全上限。
- `migration.ts`：旧 document 逐级迁移为 v3 默认结构。
- `index.ts`：`parseMindMapDocument`、`parseMindMapDocumentJson`、`serializeMindMapDocument`。
- `bundle.ts`：带 Blob 资源的 `opentools-mindmap-bundle` JSON 编码、checksum 和解析。
- `errors.ts`：可本地化的 typed format error。

format 负责“外部输入是否可信”，core validator 负责“领域图是否成立”。导入到导图库时，Web 应用会创建独立副本并重映射 map、node、enhancement 与资源引用所需 ID，避免覆盖已有数据。

## `packages/mindmap-layout`

- `types.ts`：layout 输入输出、node bounds、端口、方向、connector metadata。
- `strategies.ts`：五种 structure registry：`logic-right`、`logic-left`、`mind-map-balanced`、`tree-top`、`org-top`。
- `layout.ts`：`layoutMindMap`、`layoutMindMapSubtree` 与 mixed structure 组合。
- `index.ts`：公共导出。

布局输入是 document，输出是节点位置、完整 bounds 与连接信息。布局不得修改 hierarchy、内容、样式或 Floating Topic 锚点。主树和所有 Floating Topic 子树在统一内容坐标系中组合；分支 override 只影响对应 subtree。

## `packages/mindmap-renderer-svg`

- `scene.ts`：把 layout、document 和已准备资源转换为可序列化 scene primitive，并计算完整导出 bounds。
- `connector.ts`：按 structure、端口和线型构造连接路径。
- `equation.ts`：公式 SVG primitive 类型与安全序列化。
- `index.ts`：`createMindMapSvgScene`、`serializeMindMapSvgScene` 等公共 API。

renderer 不持有业务状态，也不读取 IndexedDB。它只消费明确输入；屏幕显示和文件导出复用同一场景语义。

## `packages/mindmap-storage`

- `repository.ts`：导图的 list/load/save/delete contract。
- `asset-repository.ts`：Blob put/get/delete/list contract 和配额常量。
- `database.ts`：Dexie 数据库与表定义。
- `dexie-repository.ts`、`dexie-asset-repository.ts`：Web IndexedDB 实现。
- `memory-repository.ts`：单元测试与非浏览器环境实现。
- `asset-lifecycle.ts`：引用计数、事务提交、孤立资源回收。
- `errors.ts`：quota、transaction 和存储失败 typed error。

document 与 Blob 分开保存，但应用层以事务语义协调：资源失败不得把 document 留在部分写入状态，也不能破坏当前 history。

## `apps/web/src`

### 应用组合

- `App.tsx`：语言初始化与顶层视图切换。
- `app/use-mind-map-application.ts`：repository、导图库、editor session 与 autosave 的组合入口。
- `library/`：创建、复制、删除、导入、导出和资源 round trip。

### UI 组件

- `editor-shell.tsx`：编辑器整体编排、Action handler、导入导出和 inspector 状态。
- `editor-action-toolbar.tsx`：按 History/Topic/Structure/Insert/Style/View/File 分组的基础编辑工具栏、overflow 和键盘菜单。
- `mind-map-canvas.tsx`：SVG 显示、文本编辑、选择、拖动、平移缩放、分支聚焦和画布快捷键。
- `topic-inspector.tsx`、`semantic-inspector.tsx`、`enhancement-inspector.tsx`、`topic-style-inspector.tsx`：属性编辑面板。
- `filter-panel.tsx`：文本、label、marker、状态与 notes 筛选。
- `equation-editor-dialog.tsx`：LaTeX 输入、预览、校验和提交。

### 编辑器应用层

- `editor/action-registry.ts`：Action descriptor、分组、active/enabled/disabled reason 和统一 dispatcher。
- `editor/actions.ts`：把 UI 意图转换为 core Command。
- `editor/session.ts`：document、history、revision 和 selection reconciliation。
- `editor/autosave.ts`：revision-aware debounce 保存，旧写入不能覆盖新 revision。
- `editor/store.ts`：仅保存 viewport、selection、draft、filter、focus 等 UI 状态。
- `editor/focus.ts`、`selection.ts`、`drop-placement.ts`、`keyboard.ts`：纯应用规则。
- `editor/export-pipeline.ts`：等待资源、内联图片/公式、生成完整 layout 与可复用 SVG。
- `editor/use-renderable-assets.ts`、`use-renderable-equations.ts`：异步资源准备与缓存。

### Web 平台适配

- `platform/clipboard.ts`：系统剪贴板与会话 fallback。
- `platform/file-transfer.ts`、`asset-transfer.ts`：文件选择、下载和资源 bundle。
- `platform/image-decoder.ts`：可信图片类型、尺寸与安全 SVG 解码。
- `platform/equation-renderer.ts`：`EquationRenderer`，按需加载 MathJax 并缓存 SVG。
- `platform/export-error.ts`：PNG bounds、像素、内存和资源错误。
- `platform/external-link.ts`、`ids.ts`：浏览器链接和 ID adapter。

这些文件可以使用浏览器 API；对应能力未来应由小程序或原生 adapter 替换。

## 状态所有权

| 状态                                      | 所有者                 | 是否持久化                       |
| ----------------------------------------- | ---------------------- | -------------------------------- |
| hierarchy、内容、样式、结构、增强对象     | `MindMapDocument`      | 是                               |
| undo/redo 与 revision                     | editor session         | 当前会话；最新 document 自动保存 |
| viewport、selection、focus、filter、draft | Web UI store           | 否                               |
| layout positions 与 scene                 | layout/renderer 派生值 | 否                               |
| 图片 Blob                                 | asset repository       | 是                               |
| 公式 SVG cache                            | `EquationRenderer`     | 否，可由 LaTeX 重建              |

## 测试布局

- package 内 `*.test.ts`：领域、格式、布局、渲染和存储单元测试。
- `apps/web/src/**/*.test.ts(x)`：Action、session、autosave、资源、导图库和性能测试。
- `apps/web/e2e/mind-map-mvp.spec.ts`：完整浏览器流程。
- `playwright.browser-acceptance.config.ts`：Chrome/Edge 发布前验收。

新增能力时，优先在最靠近所有者的 package 写纯测试，再补应用组合测试和关键用户路径 E2E。
