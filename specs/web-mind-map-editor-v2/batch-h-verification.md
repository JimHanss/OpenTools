# 批次 H 实施与验证记录

## 完成范围

- 新增四套内置 theme preset，并实现导图背景、默认字体、根主题、一级主题、子主题及显式 topic override 的级联规则。
- 主题样式覆盖五种 topic shape，以及字体、字号、字重、斜体、删除线、对齐、文字颜色、填充、边框、固定宽度和 branch line 的完整设置。
- 所有持久化修改均通过 `UpdateThemeCommand`、`UpdateNodeStyleCommand` 或原子 `BatchCommand` 执行；inverse 会恢复精确的 override 与兼容 materialized style。
- 样式剪贴板保存在 Web UI state 中，与主题内容剪贴板分离；支持当前选择、同级、全部后代和同一层级作用域，以及复制、粘贴、重置和 mixed state。
- `mindmap-layout`、Canvas、SVG 与 PNG 统一消费 `getComputedMindMapNodeStyle` 的结果，不再分别推导样式。

## 自动化验证

- `npm.cmd run typecheck`：通过。
- `npm.cmd run test`：39 个测试文件、180 项测试全部通过。
- `npm.cmd run lint`：通过。
- `npm.cmd run build`：通过；MathJax 仍按需拆分，现有大 chunk warning 不阻塞本批次。
- 新增 Core、format、layout、renderer 与 Web style action 测试，覆盖 theme 切换、显式覆盖、精确 inverse、五种形状、mixed state、作用域、复制/粘贴/重置和内容 metadata 不变。

## 浏览器验证

- 在真实 Chromium 中完成 theme、细粒度 topic style、固定宽度、branch line、样式复制/粘贴、重置、mixed state 与 undo/redo 流程。
- SVG 与 PNG 下载均成功；SVG 包含导图背景、字体、删除线和显式颜色，PNG 文件签名有效。
- console error、page error 与 request failure 均为 0。
- 临时截图位于 `output/playwright/batch-h-style-roundtrip.png`，将在 T066 按仓库卫生规则统一处理。
