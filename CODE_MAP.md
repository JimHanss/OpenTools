# 代码地图

本文档记录 OpenTools Web MVP 已实现的代码。Web 应用负责浏览器交互；可复用 workspace 负责文档、Command、布局、格式、渲染 scene 和持久化契约。

## 页面与界面

| 界面           | 入口模块                                                    | 职责                                                                    |
| -------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| 应用加载       | `apps/web/src/App.tsx`                                      | 应用 hydration 尚未完成时，提示正在启动本地导图。                       |
| 导图库         | `components/map-library-view.tsx`、`library/map-library.ts` | 列出导图，并提供创建、打开、重命名、复制和确认后删除功能。              |
| 思维导图编辑器 | `components/editor-shell.tsx`                               | 组合导图标题、保存状态、历史/文件/整理工具、画布和 inspector。          |
| 交互画布       | `components/mind-map-canvas.tsx`                            | 渲染 SVG scene，并管理临时的键盘、pointer、选择、搜索和 viewport 交互。 |

这个本地优先的 MVP 不包含服务端页面或 API route。

## Web 应用服务与组件

| 模块                               | 重要函数或组件          | 实际职责                                                                                   |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `app/use-mind-map-application.ts`  | `useMindMapApplication` | 对 Dexie 存储执行 hydration，在导图库/编辑器状态间切换，并把导入和历史操作分发到当前会话。 |
| `library/map-library.ts`           | `MindMapLibraryService` | 执行由 repository 支持的生命周期操作，并重新映射导入 ID，使导图成为独立的本地副本。        |
| `editor/session.ts`                | `EditorSession`         | 执行可撤销 Command，跟踪 revision/history，并安排自动保存。                                |
| `editor/autosave.ts`               | `AutosaveController`    | 对写入进行防抖、串行化进行中的保存，并暴露 saving/saved/error 状态。                       |
| `components/map-library-view.tsx`  | `MapLibraryView`        | 展示导图卡片，并通过明确确认保护删除操作。                                                 |
| `components/editor-shell.tsx`      | `EditorShell`           | 提供标题编辑、导入/导出、历史控制和整理预览反馈。                                          |
| `components/mind-map-canvas.tsx`   | `MindMapCanvas`         | 将 document/layout/scene 数据转换为可访问的 SVG 交互和 HTML 文本编辑 overlay。             |
| `components/topic-inspector.tsx`   | `TopicInspector`        | 通过 Command 修改样式、metadata、链接、关系线、边界和概要。                                |
| `components/language-switcher.tsx` | `LanguageSwitcher`      | 切换简体中文/英文界面，并持久化用户选择。                                                  |
| `editor/store.ts`                  | `useEditorUiStore`      | 只存储临时的选择、viewport、拖放预览、搜索、dialog 和保存状态。                            |

## 浏览器工具

| 模块                        | 重要函数                                                  | 实际职责                                                                  |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `editor/actions.ts`         | `createChildNodeCommand` / `createSiblingNodeCommand`     | 为画布快捷键构造插入位置正确的创建节点 Command。                          |
| `editor/actions.ts`         | `createBatchMoveCommand` / `createBatchStyleCommand`      | 构造规范化的多选 Command，且不直接修改 document。                         |
| `editor/keyboard.ts`        | `getEditorKeyboardShortcut`                               | 将浏览器键盘事件映射为编辑器 Command，同时排除文本输入场景。              |
| `editor/viewport.ts`        | `fitViewportToRect` / `centerViewportOnRect`              | 根据 scene 几何信息计算有边界限制的 viewport transform。                  |
| `platform/clipboard.ts`     | `createBrowserMindMapClipboardAdapter`                    | 将浏览器剪贴板文本适配为内部子树 clipboard payload。                      |
| `platform/file-transfer.ts` | `downloadBrowserFile` / `renderSvgAsPng`                  | 下载经过验证的导出数据，并将 SVG 栅格化，同时处理尺寸限制失败。           |
| `platform/external-link.ts` | `openSafeExternalLink`                                    | 只使用安全 window flags 打开经过验证的 `http`、`https` 或 `mailto` 链接。 |
| `platform/ids.ts`           | `createPlatformId`                                        | 在浏览器侧为主题和 document-level record 创建 ID。                        |
| `i18n/index.ts`             | `initializeI18n` / `setLocale` / `resolveSupportedLocale` | 初始化 i18next、解析支持的 locale、切换语言并同步页面 metadata。          |
| `i18n/messages.ts`          | `localizedMessage` / `translateMessage`                   | 用 typed translation key 表达可延迟翻译的应用消息。                       |
| `i18n/scene.ts`             | `localizeMindMapSvgScene`                                 | 本地化 SVG scene 中 marker 的可见标签和 accessible label。                |

## 可复用 packages

| Package                           | 重要模块和函数                                                 | 实际职责                                                                                      |
| --------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@opentools/mindmap-core`         | `document.ts`: `createMindMapDocument`, `cloneMindMapDocument` | 创建并防御性克隆可编辑的 v2 document。                                                        |
|                                   | `validation.ts`: `assertMindMapDocument`                       | 拒绝无效 root、树引用、enhancement record、循环和断开的主题。                                 |
|                                   | `command-executor.ts`: `executeMindMapCommand`                 | 执行单个 Command 或 batch，并返回用于 history 的 inverse Command。                            |
|                                   | `history.ts`: `CommandHistory`                                 | 管理 undo/redo stack，并在新编辑后清空 redo。                                                 |
|                                   | `traversal.ts` / `search.ts`                                   | 查找 ancestors、descendants、规范化选择和不区分大小写的主题匹配项。                           |
|                                   | `clipboard.ts` / `tidy.ts`                                     | 序列化主题子树，并生成不修改数据的整理顺序预览。                                              |
| `@opentools/mindmap-format`       | `parseMindMapDocument` / `parseMindMapDocumentJson`            | 将 v1/v2 JSON 解析为经过验证的 v2 领域数据，并提供安全的格式错误。                            |
|                                   | `serializeMindMapDocument` / `migration.ts`                    | 验证导出数据，并将旧版 markers/styles 迁移到 v2。                                             |
| `@opentools/mindmap-layout`       | `layoutMindMap` / `estimateMindMapNodeSize`                    | 生成从左到右的主题位置、edges 和完整 content bounds。                                         |
| `@opentools/mindmap-renderer-svg` | `createMindMapSvgScene`                                        | 根据 document 和 layout 构建纯节点、connector、relationship、boundary 和 summary primitives。 |
|                                   | `serializeMindMapSvgScene` / `createCubicConnectorPath`        | 序列化完整导出 SVG，并生成确定性的 connector path。                                           |
| `@opentools/mindmap-storage`      | `MindMapRepository` / `DexieMindMapRepository`                 | 定义 document 持久化，并通过浏览器 IndexedDB 实现。                                           |
|                                   | `MemoryMindMapRepository`                                      | 为快速测试提供隔离的内存持久化。                                                              |

## 数据与变更流

```text
Browser gesture or toolbar
  -> component/action command
  -> EditorSession + CommandHistory
  -> executeMindMapCommand -> MindMapDocument
  -> AutosaveController -> MindMapRepository

MindMapDocument
  -> layoutMindMap
  -> createMindMapSvgScene
  -> interactive SVG canvas or complete SVG/PNG download
```

Command 是实时 document 的唯一修改路径。画布和 inspector 可以保存临时输入，但绝不直接修改 `MindMapDocument`。Layout 和 SVG scene 结果都是派生数据，可随时重新生成。

## 测试与职责边界

- `packages/*/src/*.test.ts` 验证平台无关的模型、Command、格式、存储、布局和 SVG scene 行为。
- `apps/web/src/**/*.test.ts` 在不启动真实浏览器的情况下验证 session、autosave、keyboard、action、viewport、library、adapter、i18n 和大导图行为。
- `apps/web/e2e/mind-map-mvp.spec.ts` 验证 Chromium 编辑器行为、持久化、导入安全、拖放拒绝、完整导图导出和语言偏好持久化。

浏览器 API 应保留在 `apps/web/src/platform/` 或组件代码中。不要把 React、DOM、IndexedDB、Canvas 或小程序 API 引入 `mindmap-core`。
