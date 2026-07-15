# Web Mind Map MVP 验证记录

在完成 T001–T053 后，于 2026-07-15 完成验证。

## 自动化检查

| 检查项                     | 结果 | 证据                                               |
| -------------------------- | ---- | -------------------------------------------------- |
| `npm.cmd run format:check` | 通过 | Prettier 报告所有匹配文件均使用已配置的代码风格。  |
| `npm.cmd run lint`         | 通过 | `oxlint apps packages` 完成，无 warning 或 error。 |
| `npm.cmd run typecheck`    | 通过 | `tsc -b` 成功完成。                                |
| `npm.cmd test`             | 通过 | 19 个 Vitest 文件、63 项测试全部通过。             |
| `npm.cmd run build`        | 通过 | workspace typecheck 和 Vite 生产构建完成。         |
| `npm.cmd run test:e2e`     | 通过 | 4 项 Chromium Playwright 验收测试全部通过。        |

没有跳过任何必需的自动化检查。最终格式检查最初发现 `packages/mindmap-format/src/migration.ts` 不符合要求；完成格式化后，已重新成功运行上表中的全部检查。

## 人工浏览器检查

针对 Vite 应用执行了真实浏览器 smoke test，验证 enhancement UI：

- 通过键盘编辑创建一个子主题和一个同级主题，随后多选同级主题。
- 从 inspector 添加带标签的关系线、边界和概要，三个标签均显示在 SVG 画布中。
- 重命名一个同级主题，使整理预览报告一个发生变化的分支。
- 执行 **Tidy all**，观察到同级主题顺序重新排列，且界面明确提示 Undo 可以恢复先前顺序。
- 检查完成后已关闭浏览器自动化会话。

最终交互式 smoke test 使用 Playwright 的 Chromium 浏览器，自动化测试套件同样使用 Chromium。本轮最终检查没有记录新的 Edge 人工操作轨迹；当前桌面版 Edge 仍是发布候选版本的目标兼容性检查项。

## 验收标准状态

| 验收标准                               | 状态 | 覆盖情况                                              |
| -------------------------------------- | ---- | ----------------------------------------------------- |
| AC-01、AC-15 导图生命周期/隔离         | 通过 | Library/service 测试和浏览器验收流程。                |
| AC-02 至 AC-05 主题编辑、拖放、history | 通过 | Core Command 测试，以及 keyboard/drag 浏览器测试。    |
| AC-06、AC-07 导航/折叠                 | 通过 | Layout、viewport、浏览器折叠/搜索覆盖。               |
| AC-08 metadata 和样式                  | 通过 | Core/editor 测试和 inspector 浏览器流程。             |
| AC-09 搜索                             | 通过 | 搜索/ancestor 展开和浏览器流程。                      |
| AC-10 持久化                           | 通过 | Autosave 测试和浏览器刷新持久化流程。                 |
| AC-11、AC-12 JSON round trip/错误安全  | 通过 | Format、导入、library 和浏览器测试。                  |
| AC-13 图片导出                         | 通过 | SVG scene/file-transfer 测试和浏览器下载。            |
| AC-14 50/500 主题行为                  | 通过 | 500 主题性能/session fixture 及 Command/layout 测试。 |

## 已完成的增强项检查

- Relationship record 会验证引用的主题，支持可撤销的创建、编辑和删除类 collection 更新，可在导入时重新映射，可渲染到 SVG scene，并能序列化到完整导图导出中。
- Boundary 和 summary 可以正确执行验证、撤销、导入和导出；仅在分组主题可见时渲染，并提供 inspector 控件。
- Tidy order 是可预览、可撤销的同级顺序 Command，且不会破坏 document hierarchy。
- 简体中文/英文界面会按浏览器语言初始化，支持手动切换并持久化偏好；语言切换不会改写用户导图内容。

## 变更区域

- Core model、validation、Command executor、tidy preview、format schema 和导入 ID 重映射。
- 用于 enhancement record 的 SVG scene，以及 Web canvas/inspector/editor 控件。
- Browser/format/core/SVG/library 测试、E2E 覆盖、用户/架构/代码文档和仓库忽略规则。

## 已知风险与后续事项

1. 导图属于浏览器本地数据；用户应导出 JSON 备份，因为清除站点数据或存储故障可能删除本地导图。
2. MVP 只提供一种从左到右布局和内部 JSON 格式；XMind 与 OPML 互操作性按计划不在本次范围内。
3. 在公开发布候选版本前，应使用当前版本 Edge 执行一次简短人工 smoke test；本文档没有保存最终的 Edge 专项操作轨迹。

## 独立重新验证 — 2026-07-15 08:59 +08:00

**状态：通过。** 已重新阅读规格、计划和全部 T001–T053 任务条目。所有任务仍为已勾选状态，未发现验收标准 blocker，working tree patch 也没有 whitespace error。

### 本次重新验证运行的命令

| 命令                       | 结果 | 输出摘要                                                |
| -------------------------- | ---- | ------------------------------------------------------- |
| `npm.cmd run format:check` | 通过 | Prettier 报告所有匹配文件均已正确格式化。               |
| `npm.cmd run lint`         | 通过 | `oxlint apps packages` 完成，无 diagnostics。           |
| `npm.cmd run typecheck`    | 通过 | `tsc -b` 成功完成。                                     |
| `npm.cmd test`             | 通过 | 19 个 Vitest 文件、63 项测试全部通过。                  |
| `npm.cmd run build`        | 通过 | typecheck 和 Vite 生产构建完成，共转换 213 个 modules。 |
| `npm.cmd run test:e2e`     | 通过 | 4 项 Chromium Playwright 测试在 12.4 秒内通过。         |
| `git diff --check`         | 通过 | 没有 whitespace error；Git 仅输出 LF-to-CRLF 提示信息。 |

### 逐项检查验收标准

| AC    | 结果 | 证据                                                                         |
| ----- | ---- | ---------------------------------------------------------------------------- |
| AC-01 | 通过 | 导图库生命周期/service 测试和浏览器打开/重新加载流程。                       |
| AC-02 | 通过 | Core Command、editor action 和浏览器主题编辑测试。                           |
| AC-03 | 通过 | 浏览器 `Enter`/`Tab`/文本流程和 keyboard helper 测试。                       |
| AC-04 | 通过 | Drag/drop Command 测试和浏览器拒绝 descendant drop 的测试。                  |
| AC-05 | 通过 | Command history 测试和浏览器 undo/redo 流程。                                |
| AC-06 | 通过 | Layout 和 viewport 测试覆盖平移、缩放、适应画布和居中。                      |
| AC-07 | 通过 | Collapse Command 测试和浏览器折叠/展开流程。                                 |
| AC-08 | 通过 | Presentation/metadata Command、inspector 控件和链接安全测试。                |
| AC-09 | 通过 | 文本搜索/ancestor 展开测试和浏览器搜索导航。                                 |
| AC-10 | 通过 | Autosave controller 测试和浏览器重新加载持久化流程。                         |
| AC-11 | 通过 | Format round trip、导入隔离和浏览器 JSON 导出覆盖。                          |
| AC-12 | 通过 | Malformed-format 测试和浏览器无效 JSON 数据保护测试。                        |
| AC-13 | 通过 | 纯 SVG/file-transfer 测试、浏览器 JSON/SVG 导出流程和此前的 PNG smoke test。 |
| AC-14 | 通过 | 专用 500 主题性能 fixture、layout、Command 和 session 测试。                 |
| AC-15 | 通过 | Repository/library 创建、复制、删除和导入隔离测试。                          |

### 人工检查

本次重新验证没有执行额外人工交互，因为自上一轮记录关系线、边界、概要和整理顺序的浏览器 smoke test 后，working tree 未再改变。当前 Chromium 浏览器测试套件已再次成功运行；此前的人工结果和上文记录的 Edge 注意事项仍然适用。

### 本功能涉及的文件

- Web 应用和浏览器测试：`apps/web/src/app/`、`components/`、`editor/`、`library/`、`platform/` 和 `apps/web/e2e/`。
- 可复用 packages：`packages/mindmap-core/src/`、`mindmap-format/src/`、`mindmap-layout/src/`、`mindmap-renderer-svg/src/` 和 `mindmap-storage/src/`。
- 交付产物：`specs/web-mind-map-mvp/`、`README.md`、`docs/PROJECT_STRUCTURE.md`、`docs/USER_GUIDE.md`、`docs/FILE_FORMAT.md`、`CODE_MAP.md`、`PROJECT_PROGRESS.md`、`.gitignore` 和测试配置。

### 后续任务

Web MVP 没有阻塞性的后续任务。公开发布前需完成已记录的当前 Edge 人工 smoke test。PWA/移动端适配、更多布局和外部格式互操作性仍按计划不在本次范围内。
