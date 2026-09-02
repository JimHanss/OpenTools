# OpenTools 项目进度

最后更新：2026-09-02

## 当前状态

当前阶段：`topic-editing-canvas-interactions` 已完成并通过验证，AC-01–AC-14 全部通过，无阻塞问题。

目标：完成 Web 本地优先思维导图编辑器 V2，不扩展到协作、AI、小程序或原生端。

## 已完成功能

- 主题文字按内容自然撑开，并在达到最大宽度后换行。
- 编辑器保持原主题视觉，进入编辑时默认全选文字。
- 画布空白区域使用鼠标左键平移，`Alt + 左键` 用于框选。
- 选中普通非根主题后，右侧可创建子主题，下方可创建下一个同级主题。
- 折叠/展开控件仅随选中主题显示，不改变主题或连接线几何。
- 主题拖动时保留半透明来源主题，并显示跟随鼠标的独立 drag ghost。
- hover 使用不影响布局的视觉反馈，不再引起主题或相邻内容跳动。

完整 AC 映射和命令证据见 `specs/topic-editing-canvas-interactions/verify.md`。

V2 的 schema v3、森林模型、高级 Command、五种布局、语义能力、内容块、细粒度样式、分支聚焦、基础编辑工具栏、资源导入导出、可靠性和浏览器验收均已实现。编辑器全高布局、960px 响应式、初始/适配 viewport 和拖动禁选文字回归也已完成。实现保持 `core → format/layout/renderer/storage contract → Web adapter` 的平台边界。

完整任务清单见 `specs/web-mind-map-editor-v2/tasks.md`，批次 J 的可靠性与浏览器证据见 `specs/web-mind-map-editor-v2/batch-j-verification.md`，最终验收映射见 `specs/web-mind-map-editor-v2/verify.md`。

## 进行中

当前没有进行中的 feature 或阻塞修复项。后续工作需由新的规格或用户指令启动。

## Acceptance Criteria 状态

| AC                         | 状态 | 实现与验证证据                                                                                                  |
| -------------------------- | ---- | --------------------------------------------------------------------------------------------------------------- |
| AC-01 已有导图兼容         | 完成 | `mindmap-format` v1/v2→v3 migration；format/storage unit；E2E 旧 V2 导图迁移、编辑、刷新重开                    |
| AC-02 插入父主题           | 完成 | `InsertParentCommand`、inverse；`advanced-commands.test.ts`；toolbar/E2E                                        |
| AC-03 仅删除当前主题       | 完成 | `DeleteNodeKeepChildrenCommand`、root/Floating guard；core unit；toolbar disabled reason                        |
| AC-04 键盘重排与层级调整   | 完成 | `structure-edit.ts`、Alt+方向键、cycle/boundary guard；keyboard/core/E2E                                        |
| AC-05 Floating Topic       | 完成 | create/move/convert/attach/delete Command；自由拖动、拖入树、工具栏转换；core/layout/history/E2E                |
| AC-06 整图结构切换         | 完成 | 五种 structure strategy、default structure Command；layout unit 与 E2E                                          |
| AC-07 Mixed Structure      | 完成 | `structureOverrides`、subtree composition；layout/core unit 与 E2E                                              |
| AC-08 主题宽度与换行       | 完成 | `fixedWidth`、测量/layout/scene/text editor 对齐；style/layout/E2E                                              |
| AC-09 标签与筛选           | 完成 | label catalog、批量引用、AND/OR query、上下文路径；semantic/query/performance/E2E                               |
| AC-10 自动编号             | 完成 | siblings/hierarchical、decimal/alpha/roman 派生编号；numbering/semantic/E2E                                     |
| AC-11 Callout              | 完成 | create/update/delete/move/style/inverse 与 owner 生命周期；enhancement/scene/E2E                                |
| AC-12 图片内容             | 完成 | Blob repository、checksum、配额事务、内容块、导入导出；image/asset/bundle/E2E                                   |
| AC-13 数学公式             | 完成 | LaTeX 内容块、MathJax lazy/cache、无效源保护、导出；equation unit/round trip/E2E                                |
| AC-14 精细样式             | 完成 | node/theme override、shape/text/border/branch、mixed state；styles/style-actions/E2E                            |
| AC-15 样式复制与批量应用   | 完成 | 独立 style clipboard、scope Command、partial patch；style unit/E2E                                              |
| AC-16 增强对象样式         | 完成 | relationship/boundary/summary/Callout 独立 inspector 与 Command；enhancement/renderer unit                      |
| AC-17 分支聚焦             | 完成 | focus state、breadcrumb、selection reconciliation、filter 边界；focus unit/E2E                                  |
| AC-18 Undo/redo 与自动保存 | 完成 | 统一 Command history、长混合序列、revision-aware autosave 与失败保护；`v2-history.test.ts`、`autosave.test.ts`  |
| AC-19 JSON 与图片导出往返  | 完成 | v3 JSON/bundle、checksum、完整 SVG/PNG、typed fallback；format/export/round trip/E2E                            |
| AC-20 规模与可访问性       | 完成 | 50/500 节点性能门限；语义按钮、菜单键盘导航、IME/focus；performance/action/E2E/Chrome/Edge                      |
| AC-21 工具栏完整性         | 完成 | 七组 Action registry、必要功能入口、overflow 保留；action registry unit 与 E2E                                  |
| AC-22 工具栏状态与可访问性 | 完成 | selection/root/Floating/multi/enhancement 状态、disabled reason、pending、焦点恢复；action/E2E/浏览器验收       |
| AC-23 编辑器视口与拖动体验 | 完成 | `100dvh` Grid、960px Inspector 下移、100% 初始/适配、拖动禁选字；viewport unit、11 项 E2E、Chrome/Edge/CLI 验收 |

## 质量门禁

2026-09-02 已重新完成以下门禁：

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `git diff --check`
- `npx playwright test --config playwright.browser-acceptance.config.ts`

最终结果：Prettier、oxlint、`tsc -b` 和生产构建通过；Vitest 41 个常规测试文件 204 个测试以及 1 个性能测试文件 3 个测试全部通过；Chromium E2E 15/15 通过；本机 Chrome/Edge 验收 30/30 通过；1440×900 与 900×800 的响应式场景包含在浏览器验收中；`git diff --check` 通过。完整命令、修复记录和 AC 映射见 `specs/topic-editing-canvas-interactions/verify.md`。

生产构建仍提示部分 MathJax/主应用 chunk 超过 Vite 默认 500 kB 警告线，这是非阻塞的后续优化项。

## 已知限制与风险

- 数据只保存在当前浏览器 IndexedDB，不是云备份；清理站点数据会造成丢失风险。
- 主要支持稳定版 Chromium；Firefox/Safari 尚未纳入自动化发布矩阵。
- MathJax 首次加载和大公式渲染会有额外开销；公式 SVG cache 不是持久化数据。
- 大量内联图片会增加 bundle 与导出内存；当前限制为单资源 5 MiB、单图 25 MiB。
- PNG 受浏览器 Canvas 限制，超大导图会回退 SVG。
- 当前不支持 Xmind/OPML 文件兼容，因此“参考 Xmind”只代表基础编辑能力目标，不代表格式或界面复制。

## 明确不在 V2 范围

- 云同步、账号、版本历史、多人协作、评论和权限。
- AI 生成、总结或内容扩写。
- 完整 Xmind/OPML 导入导出、全部 Xmind structure 与像素级界面复刻。
- 通用白板、流程图、手绘和演示模式。
- PWA 安装、小程序、移动原生或桌面原生打包。

## 后续方向

在不改变当前 V2 验收范围的前提下，下一阶段可以优先做响应式移动 Web/PWA 验证，再评估小程序 renderer 与 storage adapter。领域 model、Command、format、layout 和 storage contract 应保持兼容，平台差异只进入 adapter。
