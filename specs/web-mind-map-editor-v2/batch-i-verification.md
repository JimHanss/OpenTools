# 批次 I 实施与验证记录

## 统一 Action 架构

- 新增 `EditorActionRegistry`、`EditorActionDispatcher`、Action ID、group、kind、label key、shortcut、visible、enabled、active、pending 与 disabled reason contract。
- Action descriptor 不保存 document 副本；dispatcher 每次执行和解析状态时读取当前 runtime。
- Command、UI-only 与 platform side effect 使用不同 `kind`，并统一覆盖 History、Topic、Structure、Insert、Style、View 与 File 分组。
- Keyboard parser 只返回 Action ID；IME composition、输入框、文本编辑和浏览器保留快捷键 guard 继续生效。

## 工具栏与菜单

- Header 继续负责返回、标题、保存状态、语言、导入与导出；其下新增基本编辑工具栏。
- 高频按钮直接显示撤销、重做、新建同级、新建子级和删除；Topic、Insert、Structure、Style 与 View 使用共享 dispatcher。
- Structure 与 theme action 显示 active state；非法操作保持可见，并通过中文/英文 disabled reason 解释原因。
- 菜单支持方向键、`Home`、`End`、`Enter`、`Space`、`Esc` 与焦点恢复，并设置 `aria-expanded`、`aria-controls`、`aria-disabled`、menu role 和 tooltip。
- 响应式工具栏按实际宽度和当前语言切换分组；窄屏通过 More menu 保留插入、结构、样式、视图和文件操作。
- Canvas context menu、Inspector 折叠按钮、快捷键和工具栏共用 Action ID；样式 Inspector 与工具栏共用 Command builder。

## 自动化与浏览器验证

- 新增 Action registry、selection state、pending、active、live runtime 和 dispatcher disabled result 单元测试。
- 使用 toolbar、shortcut、context-menu 与 inspector 四种入口参数化验证相同 document、history revision 与 autosave revision。
- `npm.cmd run test`：40 个测试文件、190 项测试全部通过。
- `npm.cmd run lint`、`npm.cmd run typecheck` 与 `npm.cmd run build`：全部通过；仅保留已有的大 chunk 构建提示。
- 真实 Chromium 验证工具栏创建、undo/redo、快捷键、IME guard、结构 active、菜单键盘、Esc 焦点恢复、右键 duplicate、Inspector collapse、缩放、窄屏 overflow 和语言切换。
- console error、page error 与 request failure 均为 0；临时截图位于 `output/playwright/batch-i-toolbar-wide.png` 和 `output/playwright/batch-i-toolbar-narrow.png`，将在 T066 统一处理。
