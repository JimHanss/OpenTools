# OpenTools V2 Code Map

本文件用于快速定位“一个功能应该改哪里”。更完整的职责和依赖说明见 `docs/PROJECT_STRUCTURE.md`。

## 应用入口

| 路径                                           | 责任                                                   |
| ---------------------------------------------- | ------------------------------------------------------ |
| `apps/web/src/main.tsx`                        | React 启动入口                                         |
| `apps/web/src/App.tsx`                         | 顶层应用、i18n 与 library/editor 视图                  |
| `apps/web/src/app/use-mind-map-application.ts` | 组合 repository、library、session、autosave 与错误状态 |
| `apps/web/src/components/map-library-view.tsx` | 导图库 UI                                              |
| `apps/web/src/components/editor-shell.tsx`     | 编辑器编排、Action handler、inspector、导入导出        |
| `apps/web/src/components/mind-map-canvas.tsx`  | 画布显示、选择、编辑、拖动、viewport 与快捷键          |
| `apps/web/src/styles.css`                      | Web UI 与 SVG 场景样式                                 |

## 编辑工具栏与 Action

| 路径                                                | 责任                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `apps/web/src/editor/action-registry.ts`            | Action ID、分组、快捷键、active/enabled/disabled reason 与 dispatcher |
| `apps/web/src/components/editor-action-toolbar.tsx` | 桌面工具栏、960px 文件操作 overflow、键盘导航、焦点恢复               |
| `apps/web/src/editor/actions.ts`                    | 可复用 UI intent → core Command 构造                                  |
| `apps/web/src/editor/keyboard.ts`                   | 全局快捷键映射、输入框/IME guard                                      |

Action 分为七组：

- `History`：undo、redo。
- `Topic`：创建、编辑、删除、剪贴板、插入父主题、仅删除当前主题、重排、层级、Floating Topic 转换、focus。
- `Structure`：tidy 与五种 structure。
- `Insert`：Floating Topic、Marker、label、Callout、关系线、边界、概要、notes、link、图片、公式。
- `Style`：copy/paste/reset/open style 与四套 theme。
- `View`：zoom、fit、center。
- `File`：JSON/SVG/PNG 导入导出。

任何新工具栏入口应先加入 registry，再在 shell/canvas 注册 handler，并为“无选择、root、Floating Topic、多选、增强对象、busy/pending”补状态测试。

## Editor session 与 UI 状态

| 路径                                     | 公共职责                                                        |
| ---------------------------------------- | --------------------------------------------------------------- |
| `apps/web/src/editor/session.ts`         | `EditorSession`、Command dispatch、history、revision、undo/redo |
| `apps/web/src/editor/autosave.ts`        | `createRevisionAwareAutosave`，只确认最新成功 revision          |
| `apps/web/src/editor/store.ts`           | viewport、selection、draft、drag preview、filter、branch focus  |
| `apps/web/src/editor/viewport.ts`        | pan/zoom 坐标转换、100% 上限 fit 与所选主题居中计算             |
| `apps/web/src/editor/selection.ts`       | typed selection 与 top-level 规范化                             |
| `apps/web/src/editor/focus.ts`           | branch focus、breadcrumb、目标消失后的 reconciliation           |
| `apps/web/src/editor/drop-placement.ts`  | 不同 layout 方向的 before/after/child drop 区域                 |
| `apps/web/src/editor/export-pipeline.ts` | `prepareMindMapExport`，完整资源等待/内联/layout/scene/SVG      |

`store.ts` 只拥有非持久化 UI 状态；可恢复业务状态必须进入 `MindMapDocument` 并通过 Command 修改。

## Web 组件

| 路径                                    | 责任                                             |
| --------------------------------------- | ------------------------------------------------ |
| `components/topic-inspector.tsx`        | topic text、Marker、notes、links、内容块基础属性 |
| `components/semantic-inspector.tsx`     | label catalog、批量 label、自动编号              |
| `components/filter-panel.tsx`           | 文本/label/priority/status/notes 与 AND/OR 筛选  |
| `components/enhancement-inspector.tsx`  | relationship、boundary、summary、Callout 属性    |
| `components/topic-style-inspector.tsx`  | 主题/文字/边框/分支样式、scope、mixed state      |
| `components/equation-editor-dialog.tsx` | LaTeX 预览、校验、提交与删除                     |
| `components/language-switcher.tsx`      | 中文/英文切换                                    |

## Web 平台 adapters

| 路径                            | 主要 API / 责任                                           |
| ------------------------------- | --------------------------------------------------------- |
| `platform/clipboard.ts`         | Clipboard API 与 session fallback                         |
| `platform/file-transfer.ts`     | JSON/SVG/PNG 文件选择与下载                               |
| `platform/asset-transfer.ts`    | 图片文件读取、asset transaction 与 bundle 组合            |
| `platform/image-decoder.ts`     | MIME、尺寸、安全 SVG、checksum 与 metadata                |
| `platform/equation-renderer.ts` | `EquationRenderer`、MathJax lazy load、cache、typed error |
| `platform/export-error.ts`      | `MindMapExportError`、`assertPngExportCapacity`           |
| `platform/external-link.ts`     | 安全打开外部链接                                          |
| `platform/ids.ts`               | 浏览器 ID 生成                                            |

未来小程序/移动端应替换这一层，不应复制或修改 core 业务规则。

当前 Web MVP 没有服务器 API route；导图库、autosave、资源和导入导出服务均通过浏览器 adapter 与 IndexedDB 工作。

## `@opentools/mindmap-core`

`packages/mindmap-core/src/index.ts` 汇总导出以下模块：

| 模块                        | 主要公共能力                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `model.ts`                  | `MindMapDocument`、`MindMapNode`、structure、style、asset、content block、enhancement 类型 |
| `document.ts`               | `createMindMapDocument`、`createMindMapNode` 与各种 enhancement factory                    |
| `commands.ts`               | `MindMapCommand` union、`mindMapCommandTypes`、typed command error                         |
| `command-executor.ts`       | `executeMindMapCommand`，返回新 document 与 inverse                                        |
| `history.ts`                | `MindMapHistory` 与 undo/redo                                                              |
| `validation.ts`             | `assertMindMapDocument`、`validateMindMapDocument`                                         |
| `traversal.ts`              | root/ancestor/descendant/ownership 遍历                                                    |
| `clipboard.ts`              | subtree clipboard、复制 ID 映射与引用修复                                                  |
| `structure-edit.ts`         | promote/demote/reorder Command 构造                                                        |
| `tidy.ts`                   | tidy preview 与 apply                                                                      |
| `query.ts`、`search.ts`     | 筛选、匹配与上下文路径                                                                     |
| `labels.ts`、`numbering.ts` | label 校验/排序与显示编号派生                                                              |
| `styles.ts`                 | theme 解析、style override、mixed/batch scope                                              |
| `assets.ts`                 | 图片 MIME、asset ID、引用统计                                                              |

Command 与 inverse 是 undo/redo、autosave 和未来同步的唯一编辑协议。新增持久化行为时不要在 Web handler 中直接 clone/mutate document。

## `@opentools/mindmap-format`

| 文件               | 公共 API                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| `src/index.ts`     | `parseMindMapDocument`、`parseMindMapDocumentJson`、`serializeMindMapDocument` |
| `src/schema.ts`    | v1/v2/v3 Zod schema 与 union                                                   |
| `src/migration.ts` | `migrateV1Document`、`migrateV2Document`、`normalizeV3Document`                |
| `src/bundle.ts`    | `serializeMindMapBundle`、`parseMindMapBundleJson`、`isMindMapBundle`          |
| `src/errors.ts`    | `MindMapFormatError` 与 error code                                             |

入口保证外部 v1/v2/v3 最终成为经过 core validator 的 v3；bundle version 当前为 1。

## `@opentools/mindmap-layout`

| 文件                | 公共 API / 责任                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`      | layout node、bounds、ports、connector metadata、只读主题文字 metrics                                                   |
| `src/strategies.ts` | structure registry 与五种 strategy                                                                                     |
| `src/layout.ts`     | `layoutMindMap`、`layoutMindMapSubtree`、`measureMindMapTopicText`、`wrapMindMapTopicText`、mixed/floating composition |
| `src/index.ts`      | package 公共导出                                                                                                       |

输入只有领域数据与测量，输出只有派生几何。共享文字 metrics 统一自然宽度、最大宽度换行、行高和 `fixedWidth` 规则；Floating Topic anchor 和 hierarchy 不由 layout 修改。

## `@opentools/mindmap-renderer-svg`

| 文件               | 公共 API / 责任                                                  |
| ------------------ | ---------------------------------------------------------------- |
| `src/scene.ts`     | `createMindMapSvgScene`、`serializeMindMapSvgScene`、完整 bounds |
| `src/connector.ts` | connector path 与端口逻辑                                        |
| `src/equation.ts`  | `RenderableMindMapEquation` 与公式 scene primitive               |
| `src/index.ts`     | package 公共导出                                                 |

renderer 不访问 storage 或 DOM，不拥有 document，只消费 layout、资源 data URL 和公式 SVG。`scene.ts` 复用 layout 的文字 metrics 生成 `textLines`，确保编辑画布与 SVG/PNG 导出采用同一套换行规则。

## 主题编辑与画布交互

| 文件                                            | 责任                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/mind-map-canvas.tsx`   | 用 active draft 构造只读 presentation document，驱动尺寸、scene 与 textarea geometry；在新编辑会话中执行一次全选；按 pointerdown 意图分流主题拖动、左键平移及 `Alt + 左键` 框选；渲染快捷创建控件和独立 drag visual state |
| `apps/web/src/styles.css`                       | 无边框主题编辑器、稳定 hover、grab/grabbing cursor、快捷加号和不参与 hit test 的 drag ghost                                                                                                                               |
| `apps/web/src/i18n/resources/en.ts`、`zh-CN.ts` | “Create child topic / 创建子主题”和“Create next sibling topic / 创建下一个同级主题” accessible name                                                                                                                       |

编辑 draft、pointer 坐标和 drag ghost 都只存在于 Web presentation state；提交仍经由 Command/history/autosave，以上瞬时状态不会写入 `MindMapDocument`。快捷创建按钮复用既有 child/sibling Command，创建成功后进入同一全选编辑路径。

### 关键函数

| 函数                      | 位置与作用                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrapMindMapTopicText`    | `packages/mindmap-layout/src/layout.ts`；按共享字符宽度和每行容量将主题文字拆成确定性行。                                                         |
| `measureMindMapTopicText` | `packages/mindmap-layout/src/layout.ts`；计算自然宽度、内容宽度、行数、行高与最终文字区域尺寸。                                                   |
| `estimateMindMapNodeSize` | `packages/mindmap-layout/src/layout.ts`；结合文字 metrics、内容块、padding、最大宽度和 `fixedWidth` 派生主题 bounds。                             |
| `MindMapCanvas`           | `apps/web/src/components/mind-map-canvas.tsx`；组合 presentation document、layout、SVG scene、编辑 overlay、selection、viewport 和 pointer 交互。 |
| `createChildFor`          | `apps/web/src/components/mind-map-canvas.tsx`；通过 `createChildNodeCommand` 创建子主题并进入统一的新节点编辑路径。                               |
| `createSiblingFor`        | `apps/web/src/components/mind-map-canvas.tsx`；通过 `createSiblingNodeCommand` 创建下一同级主题并进入统一的新节点编辑路径。                       |
| `clearPointerInteraction` | `apps/web/src/components/mind-map-canvas.tsx`；统一清理 pan、marquee、drop preview、pointer capture 与 drag ghost 瞬时状态。                      |

## `@opentools/mindmap-storage`

| 文件                            | 公共能力                                            |
| ------------------------------- | --------------------------------------------------- |
| `src/repository.ts`             | `MindMapRepository` contract                        |
| `src/asset-repository.ts`       | `MindMapAssetRepository`、配额与 transaction helper |
| `src/database.ts`               | Dexie database/schema                               |
| `src/dexie-repository.ts`       | IndexedDB document repository                       |
| `src/dexie-asset-repository.ts` | IndexedDB Blob repository                           |
| `src/memory-repository.ts`      | 测试用内存实现                                      |
| `src/asset-lifecycle.ts`        | 引用回收与 copy/delete 生命周期                     |
| `src/errors.ts`                 | typed storage error                                 |

存储实现不得包含 UI 提示文字；应用层通过 i18n 把 typed error 转为用户信息。

## 主要数据流

```text
用户输入
  → ActionDispatcher 检查 enabled/pending
  → Web handler 构造 MindMapCommand
  → EditorSession / executeMindMapCommand
  → 新 MindMapDocument + inverse + revision
  ├─→ layoutMindMap → SVG scene → Canvas
  ├─→ selection/focus reconciliation
  └─→ revision-aware autosave → document repository / asset repository
```

导出数据流：

```text
MindMapDocument
  → 等待并校验 asset + MathJax equation
  → 完整 layout（忽略 viewport/focus/filter）
  → SVG scene + 内联资源
  ├─→ SVG 下载
  └─→ Canvas PNG；超限/内存/编码失败 → typed error → SVG fallback
```

## 测试定位

| 需求                                                                   | 主要测试                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| schema/迁移/bundle                                                     | `packages/mindmap-format/src/*.test.ts`                |
| Command、森林、结构、语义、内容、样式                                  | `packages/mindmap-core/src/*.test.ts`                  |
| 五布局/mixed/Floating/主题文字 metrics                                 | `packages/mindmap-layout/src/*.test.ts`                |
| connector/scene/公式/共享换行                                          | `packages/mindmap-renderer-svg/src/*.test.ts`          |
| repository/asset transaction                                           | `packages/mindmap-storage/src/*.test.ts`               |
| Action/selection/focus/session/autosave/export                         | `apps/web/src/editor/*.test.ts`                        |
| 图片/公式/导图库 round trip                                            | `apps/web/src/library/*.test.ts`、`platform/*.test.ts` |
| 50/500 节点质量目标                                                    | `apps/web/src/editor/performance.test.ts`              |
| 编辑全选、画布手势、快捷创建、拖动 ghost、hover 稳定性等关键浏览器流程 | `apps/web/e2e/mind-map-mvp.spec.ts`                    |

`mind-map-mvp.spec.ts` 还覆盖桌面全高、960px Inspector 下移、根页面 overflow、初始/适配 viewport、文件操作收纳和拖动主题禁选文字；布局回归必须同时检查 `body` 与 `documentElement`。

## 平台边界

可直接复用于后续小程序/移动端：model、Command/history、validation/query、format、layout、renderer scene contract、storage contract。

Web-only：React 组件、DOM/SVG 事件、Clipboard、IndexedDB/Dexie 实现、File/download、Canvas PNG、MathJax 浏览器加载与 CSS。后续平台必须通过 adapter 提供等价能力，不应让 core 引用这些 API。
