# 批次 J 验证记录（T060–T065）

验证日期：2026-07-15

## 完成范围

- T060：新增统一的完整导图导出 pipeline。图片会在导出前转换为内联 data URI，公式会等待 `EquationRenderer` 返回可内联 SVG fragment；SVG 与 PNG 共用同一份完整 scene，不读取 viewport、focus 或 filter 状态。
- T060：新增 `MindMapExportError`，区分资源不可用、边界无效、内存不足、PNG 像素超限、Canvas 不可用及编码失败。PNG 失败时直接复用已准备的 SVG，不重复加载图片或重新渲染公式。
- T061：验证 revision-aware autosave 在旧写入进行时接收布局、图片引用、公式、Floating Topic、undo/redo 与 theme 变更，只把最新 revision 标记为成功。repository、quota 与 asset transaction 失败不会回滚当前编辑文档或破坏历史。
- T062：新增跨 Action、结构、Floating Topic、labels、numbering、Callout、图片、公式、样式与 theme 的长序列 undo/redo 测试；逐步验证 document、layout、scene、selection guard 与 Blob 可用性，并验证 undo 后新编辑清空 redo。
- T063：补充 50 主题连续创建/移动与 500 主题多布局、scene、query/focus、viewport、toolbar state、autosave 性能基线。现有 `useMemo`、资源键与公式 cache 已覆盖已确认的重算边界，本批次没有引入缺少证据的 Worker 或 Canvas 重构。
- T064：扩展为 8 条隔离 IndexedDB 的浏览器 E2E，覆盖旧 V2 map 迁移、五种结构、Floating Topic、高级结构、labels/numbering、Callout、图片、MathJax 公式、theme、JSON/SVG/PNG、键盘工具栏、disabled reason、overflow、focus restore、IME、拖放保护与错误恢复。
- T065：使用系统安装的 Chrome 与 Edge 对上述八场景执行双浏览器验收，并为每个场景保留完成截图。

## 导出与可靠性证据

- `apps/web/src/editor/export-pipeline.test.ts`：4 项通过，覆盖资源等待与内联、资源缺失 typed error、超远 Floating Topic 完整 SVG bounds 与 PNG 上限、公式失败。
- `apps/web/src/editor/autosave.test.ts`：5 项通过，包含重叠 revision 与保存失败恢复。
- `apps/web/src/editor/image-actions.test.ts`：3 项通过，包含 quota 下不执行 document command。
- `apps/web/src/editor/v2-history.test.ts`：1 条长序列通过。
- `apps/web/e2e/mind-map-mvp.spec.ts`：8/8 通过；运行命令为 `npm run test:e2e`。

## 性能基线

本机 Node/Vitest 采样结果：

| 场景                           |        结果 |
| ------------------------------ | ----------: |
| 50 主题连续 Command 创建与移动 |    约 65 ms |
| 50 主题 layout + scene         |    约 44 ms |
| 500 主题初始 layout            |   约 791 ms |
| 500 主题 scene                 |   约 824 ms |
| 500 主题五种结构依次布局       | 约 4,065 ms |
| 500 主题 query + branch focus  |    约 36 ms |
| 1,000 次 pan/zoom 纯计算       |   约 0.8 ms |
| 100 轮全 toolbar state 解析    |    约 11 ms |
| 500 主题本地 autosave          |   约 1.2 ms |

这些数字用于本仓库回归比较，不作为不同硬件之间的绝对 SLA。单次 500 主题布局与 scene 仍是主要热点，但本轮真实浏览器编辑未出现输入丢失，因此保留当前 SVG/React 架构。

## Chrome 与 Edge 八场景验收

浏览器版本：

- Google Chrome：150.0.7871.115
- Microsoft Edge：119.0.2151.72

| `plan.md` 场景                       | 自动化辅助操作与结果                                                    | Chrome | Edge |
| ------------------------------------ | ----------------------------------------------------------------------- | ------ | ---- |
| 1. 旧 map 升级、编辑、刷新与历史     | 导入 V2 fixture，编辑并刷新重开                                         | 通过   | 通过 |
| 2. toolbar 与 shortcut 等价入口      | 创建、结构、theme、focus、导出与快捷键                                  | 通过   | 通过 |
| 3. Floating Topic                    | 创建、命名、保存并刷新重开                                              | 通过   | 通过 |
| 4. 五种结构及高级结构完整导出        | 五种结构依次切换，Relationship、Boundary、Summary 未裁切                | 通过   | 通过 |
| 5. 图片、公式与导出 round trip       | PNG、MathJax、JSON bundle、SVG 与 PNG/fallback                          | 通过   | 通过 |
| 6. 中文 IME 与文本编辑保护           | composition 期间 Enter 不触发全局 Action，中文内容保留                  | 通过   | 通过 |
| 7. 窄窗口 overflow 与焦点            | 680/520 px、菜单键盘导航、Escape focus restore                          | 通过   | 通过 |
| 8. quota、clipboard denied、损坏导入 | 模拟 IndexedDB `QuotaExceededError`、剪贴板拒绝与损坏 JSON，原 map 保留 | 通过   | 通过 |

执行命令：

```text
npx playwright test --config playwright.browser-acceptance.config.ts
```

结果：16/16 通过。截图生成在 `output/playwright/browser-acceptance/`；它们属于本地验证产物，将由 T066 的仓库卫生规则忽略，不作为产品 source 提交。

## 验收中发现并修复的问题

- toolbar 创建 Floating Topic 后，外部 `editingNodeId` 未转为 Canvas 本地 draft；已增加同步 effect。
- overflow 菜单用 Enter 打开后，浏览器默认焦点覆盖首个 menuitem；已改为下一帧聚焦，并让会主动移动焦点的 Action 保留目标焦点。
- quota 错误在图片入口被降级成通用错误；已通过 `toLocalizedError` 保留 typed、可恢复的本地存储提示。
- Chrome 高并发验收中读取 map title 存在挂载时序竞争；E2E 已等待稳定值再建立“导入失败不覆盖原 map”的基准。
