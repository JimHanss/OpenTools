# Web 思维导图编辑器 V2 验证报告

验证日期：2026-07-16（Asia/Shanghai）

验证范围：`web-mind-map-editor-v2` 的 AC-01 至 AC-23、T001–T079、仓库卫生与当前 Web 交付物。

## 验证结论

通过。AC-01 至 AC-23 均有实现和自动化/浏览器证据，未发现阻塞交付的未通过项。V2 仍严格限定为本地优先的 Web 单人思维导图编辑器；云同步、协作、AI、Xmind/OPML、小程序、PWA 与原生客户端不在本阶段范围。

## 完整质量门禁

| 命令                                                                   | 最终结果 | 证据摘要                                                                                               |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `npm.cmd run format:check`                                             | 通过     | 所有匹配文件符合 Prettier；初次检查发现 42 个历史/本次文件格式不一致，执行 `npm run format` 后复查通过 |
| `npm.cmd run lint`                                                     | 通过     | oxlint 对 `apps`、`packages` 无错误                                                                    |
| `npm.cmd run typecheck`                                                | 通过     | `tsc -b` 无错误                                                                                        |
| `npm.cmd test`                                                         | 通过     | 42 个 test file、202 个 test 全部通过                                                                  |
| `npm.cmd run build`                                                    | 通过     | Vite 8.1.4，438 modules transformed，生产构建成功                                                      |
| `npm.cmd run test:e2e`                                                 | 通过     | Playwright Chromium 11/11 通过                                                                         |
| `npx playwright test --config playwright.browser-acceptance.config.ts` | 通过     | Chrome 11/11 + Edge 11/11，共 22/22 通过                                                               |
| `git diff --check`                                                     | 通过     | 无 whitespace error                                                                                    |

构建存在非阻塞提示：MathJax 与主应用的部分 chunk 超过 Vite 默认 500 kB 警告线。公式已按需加载，但后续仍可继续评估更细粒度 code splitting；该提示不影响当前功能、类型或浏览器验收。

## 验证中发现并修复的问题

- `format:check` 初次报告 42 个文件不符合统一格式；已用仓库 Prettier 配置进行纯机械格式化，并复跑通过。
- 新增“转为自由主题”Action 后，第一次全量 E2E 发现 descriptor 和 Canvas handler 已存在，但 `editor-action-toolbar.tsx` 的显式 `topicActions` 列表遗漏该入口；已补入 Topic 菜单，并在 Chromium、Chrome、Edge 中验证 subtree 转换与 JSON round trip。
- `git diff --check` 初次发现 `PROJECT_PROGRESS.md` 两处 Markdown 行尾空格；已改为普通段落间隔并复查通过。
- 旧编辑器样式使用固定 `68px` 扣减工作区高度，在顶栏换行时造成纵向溢出；改为 `100dvh` Grid 后按顶栏实际高度分配剩余空间。
- 首轮浏览器几何测试只检查 `body.scrollHeight`，Playwright CLI 截图仍发现 Inspector 深层内容把 `documentElement` 撑高；加入 layout/paint containment，并将两种根滚动尺寸都纳入 E2E。
- 全量 Vitest 的 500 节点布局计时曾在并行负载下达到 5041–5261ms；同文件独立运行五布局为约 4862ms 且通过。标准 `npm.cmd test` 已调整为先并行运行普通单测、再隔离运行 `performance.test.ts`，仍覆盖 42 个文件和 202 项测试，且未修改 5000ms 性能门限。

## AC-01 至 AC-23 映射

| AC                         | 结果 | 自动化/人工证据                                                                                                                                                              |
| -------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 已有导图兼容         | 通过 | `packages/mindmap-format/src/index.test.ts`、`migration.ts`、`packages/mindmap-storage/src/index.test.ts`；E2E 导入 V2、编辑、导出、自动保存并刷新重开                       |
| AC-02 插入父主题           | 通过 | `packages/mindmap-core/src/advanced-commands.test.ts` 覆盖结构与 inverse；Action/toolbar E2E                                                                                 |
| AC-03 仅删除当前主题       | 通过 | `advanced-commands.test.ts` 覆盖 children 原序提升、root/Floating guard 与 undo；Action disabled reason                                                                      |
| AC-04 键盘重排与层级调整   | 通过 | `structure-edit.ts`、`keyboard.test.ts`、`advanced-commands.test.ts`；Alt+方向键、边界与 cycle E2E                                                                           |
| AC-05 Floating Topic       | 通过 | create/move/convert/attach/delete Command unit；layout/history；E2E 创建、编辑、普通 subtree 转自由主题、JSON 保存；拖入树由 Canvas drop handler 与 core attach inverse 覆盖 |
| AC-06 整图结构切换         | 通过 | `packages/mindmap-layout/src/strategies.test.ts`；五种 structure 依次切换和完整 SVG E2E                                                                                      |
| AC-07 Mixed Structure      | 通过 | `structureOverrides` Command 与 subtree composition unit；E2E branch structure 切换                                                                                          |
| AC-08 主题宽度与换行       | 通过 | layout/scene/style unit 覆盖 `fixedWidth`、文本测量、bounds；浏览器 inspector/导出场景通过                                                                                   |
| AC-09 标签与筛选           | 通过 | `semantic-editing.test.ts`、`query.ts`、`filter-panel.tsx`；E2E label 创建/应用/导出                                                                                         |
| AC-10 自动编号             | 通过 | `numbering.ts`、`semantic-editing.test.ts`；E2E hierarchical numbering 与 JSON round trip                                                                                    |
| AC-11 Callout              | 通过 | `enhancement-commands.test.ts`、renderer scene；E2E 创建、显示、导出、刷新重开                                                                                               |
| AC-12 图片内容             | 通过 | `image-commands.test.ts`、`asset-repository.test.ts`、`image-actions.test.ts`、image round trip；E2E JSON bundle/SVG/PNG                                                     |
| AC-13 数学公式             | 通过 | `equation-commands.test.ts`、`equation-renderer.test.ts`、equation round trip；E2E MathJax/JSON/SVG/PNG                                                                      |
| AC-14 精细样式             | 通过 | `styles.test.ts`、`style-actions.test.ts`、scene test；E2E theme/style 保存                                                                                                  |
| AC-15 样式复制与批量应用   | 通过 | `styles.test.ts`、`style-actions.test.ts` 覆盖独立 style clipboard、scope 与 partial patch                                                                                   |
| AC-16 增强对象样式         | 通过 | `enhancement-commands.test.ts`、`connector.test.ts`、`scene.test.ts` 与各 inspector handler                                                                                  |
| AC-17 分支聚焦             | 通过 | `focus.test.ts`、query/selection tests；E2E focus/exit、筛选上下文和完整导出不裁切                                                                                           |
| AC-18 Undo/redo 与自动保存 | 通过 | `v2-history.test.ts` 长混合序列；`autosave.test.ts` 重叠 revision、失败恢复、最新 revision；200/200 全量 unit                                                                |
| AC-19 JSON 与图片导出往返  | 通过 | format/bundle/export pipeline/asset/equation round trip tests；E2E JSON/SVG/PNG 与 typed fallback                                                                            |
| AC-20 规模与可访问性       | 通过 | `performance.test.ts` 50/500 节点基线；Action/keyboard/IME/overflow/focus E2E；Chrome/Edge 验收                                                                              |
| AC-21 工具栏完整性         | 通过 | `action-registry.test.ts` 七组 descriptor contract；E2E 必需 Action、Topic conversion、narrow overflow                                                                       |
| AC-22 工具栏状态与可访问性 | 通过 | Action unit 覆盖 none/root/normal/Floating/multi/enhancement/busy/pending；E2E disabled reason、键盘菜单、焦点恢复、IME                                                      |
| AC-23 编辑器视口与拖动体验 | 通过 | viewport unit 覆盖 100% fit/min zoom；E2E 覆盖 10 组尺寸、`body`/`documentElement` overflow、Inspector 下移、文件 overflow、初始居中与拖动禁选字；Chrome/Edge/CLI 验收       |

## 可靠性与性能证据

详细数据见 `batch-j-verification.md`。本机 Vitest 基线：

| 场景                           |    采样结果 |
| ------------------------------ | ----------: |
| 50 主题连续 Command 创建与移动 |    约 65 ms |
| 50 主题 layout + scene         |    约 44 ms |
| 500 主题初始 layout            |   约 791 ms |
| 500 主题 scene                 |   约 824 ms |
| 500 主题五种结构依次布局       | 约 4,065 ms |
| 500 主题 query + branch focus  |    约 36 ms |
| 1,000 次 pan/zoom 纯计算       |   约 0.8 ms |
| 100 轮完整 toolbar state 解析  |    约 11 ms |
| 500 主题本地 autosave          |   约 1.2 ms |

性能数据用于同一仓库的回归比较，不是跨设备 SLA。500 主题 layout/scene 仍是主要热点，但当前 Chrome/Edge 验收未出现输入丢失或编辑阻塞。

## Chrome 与 Edge 验收

- Google Chrome：150.0.7871.115
- Microsoft Edge：119.0.2151.72
- 配置：`playwright.browser-acceptance.config.ts`
- 结果：22/22 通过
- 本地截图：`output/playwright/browser-acceptance/`，由 `.gitignore` 忽略，不作为 source 提交

十一个场景覆盖：旧 map 迁移、toolbar/shortcut、Floating Topic、五种布局与高级结构、图片/公式与三种导出、中文 IME、错误恢复，以及桌面/窄窗口布局、初始与适配 viewport、拖动主题禁选文字。两种浏览器均通过；Playwright CLI 另在 1440×900 和 900×800 完成截图检查。

## 仓库卫生

- `.gitignore` 只忽略 dependency、build、coverage、Playwright、截图、浏览器 profile、cache、临时文件、日志和本地环境变量。
- `output/`、`dist/`、`node_modules/` 已确认被忽略。
- 未跟踪但未忽略的内容仅为本阶段新增 source、test、spec、配置与验证文档；没有未登记的临时导出、浏览器 profile 或二进制测试产物。
- lockfile、spec、test fixture、文档和浏览器验收配置均未被隐藏。

## 已知限制

- 数据仅保存在当前浏览器 IndexedDB；用户必须自行导出 JSON/bundle 备份。
- 自动化门禁以 Chromium 为主，发布前补充 Chrome/Edge；Firefox/Safari 尚未进入阻塞矩阵。
- 单图片 5 MiB、单导图图片总量 25 MiB；PNG 最大边长 16384、最大 1600 万像素，超限回退 SVG。
- MathJax 首次加载和大型公式存在额外开销；公式 cache 可由 LaTeX 重建，不持久化。
- V2 不支持云同步、多人协作、AI、完整 Xmind/OPML、PWA、小程序、移动/桌面原生客户端。

## 未通过项

无。
