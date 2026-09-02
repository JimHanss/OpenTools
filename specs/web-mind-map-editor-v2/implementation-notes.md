# Web Mind Map Editor V2 实施记录

## T041–T045：数学公式（2026-07-15）

### MathJax 集成结论

- 按仓库要求通过 Context7 核对 MathJax v4 当前文档，并用 Vite 最小 spike 验证 TeX 到 SVG、异步字体重试和 production build。
- 正式依赖锁定为 `@mathjax/src@^4.1.3` 与 `@mathjax/mathjax-newcm-font@^4.1.3`。
- 未采用包含完整辅助功能模块的 combined browser bundle：最小验证发现它会额外尝试启动 SRE worker。Web adapter 改用 `mathjax`、`TeX`、`SVG`、`liteAdaptor` 和 NewCM font 的低层 API，并通过动态 `import()` 首次按需加载。
- TeX package 首版只启用 `base`、`ams` 与 `newcommand`；不包含化学结构、所见即所得公式编辑或其他 MathJax 扩展 package。无效或不支持的命令返回稳定错误，不写入 document。
- SVG 使用 `fontCache: 'local'`，每个结果内联所需 path；adapter 会拒绝 script、`foreignObject`、外部 URL、event handler 和无效尺寸，并为内部 ID 添加稳定前缀。

### 体积与首次加载

- T040 后、公式接入前的主 chunk 约为 629 kB；T045 production build 的主 chunk 为 647.06 kB（gzip 191.26 kB），主路径增量约 18 kB，仍保留既有超过 500 kB 的 warning。
- MathJax 最大异步 chunk 为 987.33 kB（gzip 370.93 kB），SVG output adapter 另有 136.03 kB（gzip 40.34 kB），其余 TeX/AMS/Newcommand 支持代码拆分为更小的异步 chunk。
- 无公式导图不会请求 MathJax 模块；真实 Chromium 验证确认第一次打开公式编辑器时才加载 MathJax 资源，且没有 console error、page error 或失败请求。

### 功能与验证结果

- `EquationRenderer` contract 位于平台无关 renderer package；Web adapter 按 source、display mode、font size 和 renderer version 缓存。LaTeX source 始终保存在 document 中，缓存仅保存可重建的派生 SVG。
- 创建、编辑、删除、undo/redo、主题复制粘贴、自动保存、刷新重开、复制整图、JSON round trip、Canvas、SVG 与 PNG 使用同一公式数据和渲染结果。
- 无效草稿保留在 dialog 中，Canvas 和 document 继续显示最后一次有效公式；加载失败和无效输入均使用稳定占位，不中断布局或导出。
- 针对性检查：26 个 core/format/layout/renderer/Web 测试通过，`npm.cmd run typecheck` 通过，Vite production build 通过。
- 真实 Chromium 流程通过：有效公式创建、无效编辑保护、再次有效编辑、undo/redo、自动保存刷新、SVG 下载和 PNG 下载；截图保存在 `output/playwright/batch-g-equation-roundtrip.png`，该路径属于临时验证产物，将在 T066 清理策略中处理。
