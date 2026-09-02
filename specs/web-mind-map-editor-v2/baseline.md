# Web Mind Map Editor V2 实施基线

## 记录目的

本文件记录 T001 开始时 `main` 分支（`8178d24`）的 MVP 自动化状态，用于区分 V2 实施前已有行为、既有不稳定项与后续引入的回归。记录只代表 2026-07-15 的升级前基线，不代表 V2 最终验证结果。

## 升级前命令结果

| 命令                                                                | 结果     | 证据摘要                                                                                                    |
| ------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `npm.cmd test`                                                      | 通过     | 19 个 test files、63 个 tests 全部通过                                                                      |
| `npm.cmd run build`                                                 | 通过     | `tsc -b` 与 Vite production build 通过；已有主 bundle 超过 500 kB 的 warning                                |
| `npm.cmd run test:e2e`                                              | 部分通过 | 4 个 Chromium tests 中 3 个通过；invalid JSON 用例等待导图库按钮时达到 30 秒 timeout                        |
| `npm.cmd run test:e2e -- --grep "rejects invalid JSON" --workers=1` | 通过     | 该既有失败用例单独运行时 1/1 通过，初步判定为并行运行或启动时序不稳定，而不是 invalid JSON 行为稳定复现失败 |

## 已锁定的 MVP 回归面

- 导图库创建、打开、重命名、复制、删除和本地 repository 行为。
- 主题创建、文本编辑、移动、删除、复制/粘贴、批量操作与 undo/redo。
- Autosave revision、搜索、viewport、keyboard、clipboard 和外部链接保护。
- Marker、notes、links、relationship、boundary、summary 与 tidy layout。
- schema v1/v2 解析、迁移、JSON round trip、SVG scene 与 PNG/SVG 文件流程。
- 50/500 节点 fixture、核心结构验证与已有性能测试。

## 基线注意事项

- V2 实施不得把 E2E 的既有时序不稳定误报为产品行为完成；最终 T064/T073 必须让完整 E2E 稳定通过。
- Vite bundle warning 是后续 MathJax 动态加载和 T063 性能审计的明确基准，不在 T001 中做无关优化。
- 本文件不替代 `specs/web-mind-map-editor-v2/verify.md`；最终验收证据只在 T073 生成。
