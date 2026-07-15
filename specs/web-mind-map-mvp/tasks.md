# Web Mind Map MVP 任务清单

## 任务规则

- 状态以复选框记录；仅在代码、测试或文档实际完成并通过对应检查后勾选。
- 任务按依赖顺序执行。除标记为“增强”的任务外，所有任务均属于 MVP P0 发布范围。
- 每个实现批次完成后，执行与变更范围对应的单元测试；最终验证阶段运行完整命令集。
- `T040`–`T042` 不得阻塞 P0 验收或发布。

## 0. 基础与测试支持

- [x] **T001 — 添加可复用的 document fixture**
  - 在相关 package 测试目录中创建仅 root、深树、宽树、折叠、带样式、无效导入、v1 legacy 和 500 节点 fixture。
  - Fixture 必须平台无关且结果确定，不能依赖浏览器 API。
  - 覆盖：AC-01 至 AC-15 的测试输入。

- [x] **T002 — 只添加必需的浏览器和存储测试工具**
  - 评估 `fake-indexeddb` 和 `@playwright/test`；只有现有依赖无法覆盖 Dexie 或浏览器验收测试时才添加。
  - 添加浏览器依赖时，同时添加 `test:e2e` script、Playwright 配置和对应忽略规则，并通过仓库 package manager 更新 `package-lock.json`。
  - 依赖：T001。

- [x] **T003 — 建立 v2 core model 和创建默认值**
  - 将 core model 从当前单一入口拆分为职责集中的模块，同时保持简洁的公开 export surface。
  - 引入 schema v2 类型、兼容 preset 的丰富节点样式字段，以及结构化 priority/status/icon marker。
  - Document 创建必须保持确定性和平台无关。
  - 依赖：T001。

- [x] **T004 — 添加 document tree invariant 和 traversal helper**
  - 验证唯一 root、parent/child 一致性、顺序、cycle、断开 record 和 root 限制。
  - 添加 ancestors、descendants、规范化顶层选择和文本匹配 collection 的纯 helper。
  - 提供 typed domain error，且不能修改输入数据。
  - 依赖：T003。

- [x] **T005 — 定义 Command envelope 和 inverse history 契约**
  - 使用 discriminated Command、execution context、result/inverse type 和 revision-safe history API 替换通用 history-only 接口。
  - ID 和 clock 生成保留在 core package 外部，并定义 Batch Command 语义和新编辑后清空 redo 的行为。
  - 依赖：T003、T004。

## 1. 核心编辑 Command

- [x] **T006 — 实现文本、导图标题和折叠 Command**
  - 为导图重命名、节点文本更新和折叠/展开实现 Command 执行与 inverse 生成。
  - 只包含 whitespace 的已提交标题规范化为约定的安全 fallback。
  - 依赖：T005。覆盖：AC-01、AC-02、AC-07。

- [x] **T007 — 实现节点创建和插入 Command**
  - 添加同级和子级插入 Command，使用确定性的插入 index 并保护 root。
  - 返回新节点 ID，使 Web UI 能立即进入文本编辑。
  - 依赖：T005。覆盖：AC-02、AC-03。

- [x] **T008 — 实现移动和重排 Command**
  - 在不同 parent 之间或同级节点内移动节点/子树，并完整保留子树。
  - 拒绝自身、descendant 和 no-op target；inverse Command 保留原 parent/index。
  - 依赖：T004、T005。覆盖：AC-02、AC-04。

- [x] **T009 — 实现删除和子树恢复 Command**
  - 删除规范化后的顶层选中子树，并拒绝删除 root。
  - 捕获完整子树 record 和原同级位置，以便 undo 精确恢复。
  - 依赖：T004、T005。覆盖：AC-02、AC-05。

- [x] **T010 — 实现 copy、cut、paste、duplicate 和 Batch Command**
  - 定义可序列化的内部子树 clipboard payload，以及由调用方提供的 duplicate ID 策略。
  - 为多选删除、移动和样式更新实现原子 batch 行为。
  - 依赖：T005、T007、T009。覆盖：AC-02、AC-03、AC-05。

- [x] **T011 — 实现 presentation 和 metadata Command**
  - 为节点 style、结构化 marker、notes 和 links 添加可逆 Command。
  - 每个节点最多一个 priority marker 和一个 status marker，同时允许多个 icon。
  - 依赖：T003、T005。覆盖：AC-08。

- [x] **T012 — 添加完整的 Core Command 测试**
  - 测试每个 Command、inverse operation、redo 清空、root 保护、无效移动、选择规范化和混合 Command 序列。
  - 包含 500 节点 Command fixture 序列，确认树结构不受损。
  - 依赖：T006–T011。覆盖：AC-02、AC-04、AC-05、AC-07、AC-08、AC-14。

## 2. 格式、迁移与持久化

- [x] **T013 — 定义 JSON schema v2 和用户安全的格式错误**
  - 将格式解析拆分为 schema、migration 和 validation 模块。
  - 验证 v2 数据，并暴露适合导入 UI 的稳定 `FormatError` code/message。
  - 依赖：T003、T004。

- [x] **T014 — 实现 v1-to-v2 migration**
  - 迁移初始化 v1 document，应用确定性默认值，并转换可识别的旧版 string marker。
  - 保留 document/node ID；未知 legacy marker 必须保留，不能丢弃数据。
  - 依赖：T013。

- [x] **T015 — 实现已验证的 JSON 序列化和 round-trip 测试**
  - 拒绝无效 root reference、重复 child、cycle、缺失 record、未来版本和无效字段。
  - 测试 v1 migration、有效 v2 parse/serialize round trip 和全部导入错误场景。
  - 依赖：T013、T014。覆盖：AC-11、AC-12。

- [x] **T016 — 完善 storage repository 契约和 Dexie adapter**
  - 将 repository 接口、Dexie 实现和错误转换拆分为职责集中的模块。
  - 返回 document 的防御性副本，并保证导图列表按 `updatedAt` 降序排列。
  - 将 IndexedDB failure 转换为可恢复的 repository error，且不删除现有数据。
  - 依赖：T003。

- [x] **T017 — 添加 memory repository 和持久化测试**
  - 实现用于快速单元测试的 in-memory repository；如果 T002 添加所需 adapter，则增加 Dexie 兼容测试。
  - 测试 get/list/save/delete、数据隔离、排序和保存失败。
  - 依赖：T016。覆盖：AC-01、AC-15。

- [x] **T018 — 实现 revision-aware autosave controller**
  - 添加 Web 层 controller，对写入防抖、串行化进行中的保存、暴露 saving/saved/error 状态，并能 flush 最新 revision。
  - 测试重叠编辑、过期成功状态防护、保存失败和显式 flush。
  - 依赖：T016、T017。覆盖：AC-10。

## 3. Layout 与 SVG scene

- [x] **T019 — 为 layout input 添加感知文本的节点测量**
  - 使用 document、可选的外部节点尺寸和安全默认值替换仅支持固定尺寸的 layout input。
  - 除定位后的节点和 edge 外，还返回完整 content bounds；DOM 测量必须保留在 package 外。
  - 依赖：T003、T004。

- [x] **T020 — 添加 layout regression 测试**
  - 测试从左到右定位、可变尺寸、长标签、折叠分支、完整 bounds 和无效树 failure。
  - 包含宽/深 500 节点 fixture。
  - 依赖：T019。覆盖：AC-06、AC-07、AC-14。

- [x] **T021 — 创建纯 SVG scene builder**
  - 根据 document 和 layout output 构建节点、connector path、marker presentation 和带 padding 的 export bounds。
  - Renderer package 不得引入 React、DOM、Canvas 或浏览器文件 API。
  - 依赖：T019。

- [x] **T022 — 测试 SVG scene 和 connector output**
  - 验证稳定 path、bounds、长文本处理，以及折叠节点的 descendant 不进入可视 scene output。
  - 依赖：T021。

## 4. 导图库与 editor session

- [x] **T023 — 创建 application shell 和导图库 route/state**
  - 使用 repository hydration 和 library/editor application state 替换固定欢迎导图启动方式。
  - 仅当不存在有效已保存导图时创建 starter map；`App.tsx` 只负责组合。
  - 依赖：T015、T017。

- [x] **T024 — 实现导图库生命周期控件**
  - 添加创建、打开、重命名、复制和确认后删除控件。
  - 删除只影响选中的导图，且不能误导用户认为该操作可 undo。
  - 依赖：T023。覆盖：AC-01、AC-15。

- [x] **T025 — 引入由 Command 支持的 editor session**
  - 在专用 Web session/controller 中管理当前 document、Command history 和单调递增 revision。
  - 所有 document 编辑通过 Core Command，且接入 T018 的 autosave status。
  - 依赖：T012、T018、T023。

- [x] **T026 — 扩展仅属于 UI 的 editor state**
  - 扩展 Zustand state，支持选中节点 ID、活动文本 editor、viewport、drag preview、search state、dialog 和 save status。
  - Document 数据和 Command history 必须位于 UI-only state mutation path 之外。
  - 依赖：T025。

## 5. 核心画布编辑与键盘流程

- [x] **T027 — 渲染由 Command 支持的 SVG canvas**
  - 使用 scene 驱动的节点和 connector 渲染替换 bootstrap canvas。
  - 为活动节点文本添加 absolute HTML editor overlay，不能把临时 input 嵌入导出 SVG。
  - 使用稳定 key、accessible label 和可见选择状态。
  - 依赖：T021、T025、T026。

- [x] **T028 — 实现节点选择和直接文本编辑**
  - 添加单选、modifier-key 多选，以及文本编辑的提交/取消行为。
  - 正确处理空文本、仅 whitespace、换行和长标题。
  - 依赖：T026、T027。覆盖：AC-02、AC-08。

- [x] **T029 — 实现 keyboard-first 结构编辑**
  - 将 `Enter`、`Tab`、`Delete` 和 `Backspace` 接入 Command，同时保持正常文本输入行为。
  - 添加平台感知的 undo、redo、copy、cut、paste、duplicate 和全选快捷键。
  - IME composition 和可编辑字段交互期间禁用全局 Command。
  - 依赖：T010、T025、T028。覆盖：AC-03、AC-05。

- [x] **T030 — 添加 undo/redo 控件和 history 反馈**
  - 根据实际 history state 启用/禁用 toolbar 和键盘行为。
  - 验证 Command error 不会修改 document 或 history。
  - 依赖：T025、T029。覆盖：AC-05。

- [x] **T031 — 集成内部 clipboard 和多选操作**
  - 将浏览器 clipboard adapter 接入内部子树 payload，并在不支持 clipboard 时提供明确反馈。
  - 使用规范化顶层选择支持 batch 删除、移动和样式操作。
  - 依赖：T010、T026、T029。覆盖：AC-02、AC-03。

## 6. 画布导航与结构操作

- [x] **T032 — 实现 viewport transform 和 pointer coordinate adapter**
  - 添加 canvas 平移、有边界缩放、可见缩放比例，以及选择和 drag/drop 共用的坐标转换。
  - Viewport 计算应独立于 React 和 pointer event 进行单元测试。
  - 依赖：T019、T026、T027。覆盖：AC-06。

- [x] **T033 — 添加适应内容和居中选中项导航**
  - 使用完整 layout bounds 计算 transform，并在 toolbar 和键盘可访问控件中提供适应/居中操作。
  - 确认适应画布时不会裁切完整节点或 connector。
  - 依赖：T032。覆盖：AC-06。

- [x] **T034 — 实现折叠和展开交互**
  - 通过 Core Command 为 canvas 和 inspector 添加分支折叠/展开控件。
  - 通过 autosave 保持状态，并触发可视 layout 重新计算。
  - 依赖：T006、T027、T032。覆盖：AC-07。

- [x] **T035 — 实现节点/子树 drag and drop**
  - 拖动期间使用 pointer capture 和仅预览的 UI state。
  - 显示 before/after/child drop indicator，拒绝无效 target，并在有效 drop 时提交单个 move/reorder Command。
  - 安全处理 `Esc`、取消 pointer capture 和失去焦点。
  - 依赖：T008、T026、T032。覆盖：AC-04。

## 7. Presentation、搜索与文件操作

- [x] **T036 — 实现 style 和 marker inspector 控件**
  - 为单选和多选添加固定 MVP style preset、颜色、priority、status 和 icon 控件。
  - 在 CSS/SVG 中明确区分 selected、hovered、editing、dragging 和 collapsed 状态。
  - 依赖：T011、T031。覆盖：AC-08。

- [x] **T037 — 实现 note 和外部链接控件**
  - 在 inspector 中支持 notes/links 的创建、编辑、查看和删除。
  - 验证安全 link protocol，并只在用户明确操作时使用 `noopener,noreferrer` 打开链接。
  - 依赖：T011、T027。覆盖：AC-08。

- [x] **T038 — 实现搜索和结果导航**
  - 添加不区分大小写的文本搜索、匹配数量、上一项/下一项控件和空结果反馈。
  - 通过 Command 展开必要 ancestor，选中匹配项并在 viewport 中居中。
  - 依赖：T004、T006、T026、T033。覆盖：AC-09。

- [x] **T039 — 实现安全 JSON 导入**
  - 接入浏览器文件选择、parser 和 migration。
  - 默认导入为新导图；替换当前导图或解决 ID 冲突前必须确认并先 flush autosave。
  - Parse、validation 或用户取消失败时，必须保留现有导图库数据。
  - 依赖：T015、T018、T024。覆盖：AC-11、AC-12、AC-15。

- [x] **T040 — 实现 JSON 导出**
  - 使用浏览器 download adapter 和安全 filename，仅导出通过验证的当前 document JSON。
  - 验证重新导入的导出结果仍可编辑且等价。
  - 依赖：T015、T025。覆盖：AC-11。

- [x] **T041 — 实现完整导图 SVG 导出**
  - 使用完整 layout bounds 和 padding 序列化纯 SVG scene，而不是当前 viewport transform。
  - 验证节点文本、style、marker 和 connector 均被保留。
  - 依赖：T021、T025。覆盖：AC-13。

- [x] **T042 — 实现带安全失败处理的 PNG 导出**
  - 通过浏览器 Canvas adapter 转换完整 SVG，并设置有文档说明的尺寸限制。
  - Canvas 转换失败时提供明确错误和 SVG fallback。
  - 依赖：T041。覆盖：AC-13。

## 8. 质量、可访问性与 P0 发布验证

- [x] **T043 — 强化可访问性和浏览器能力失败处理**
  - 验证焦点顺序、accessible name、节点选择语义、纯键盘编辑和保存状态 announcement。
  - 安全处理 IndexedDB 不可用、存储失败、clipboard 拒绝、取消 file picker 和 malformed file data，不能静默丢失数据。
  - 依赖：T024–T042。覆盖：AC-03、AC-10、AC-12。

- [x] **T044 — 验证并调优 50 节点和 500 节点行为**
  - 运行 50 节点键盘流程，以及 500 节点打开/平移/缩放/搜索/折叠/autosave fixture。
  - Memoize 由 document 派生的 layout 和 scene 计算；引入 virtualization 或 Canvas renderer 前先 profile。
  - 未达到目标时记录剩余的设备特定限制。
  - 依赖：T020、T038、T043。覆盖：AC-14。

- [x] **T045 — 添加端到端 P0 验收覆盖**
  - 添加浏览器测试，覆盖导图生命周期、键盘编辑、undo/redo、drag/drop 拒绝、刷新持久化、折叠搜索、JSON 错误安全和完整导图导出。
  - 在 bundled Chromium 中运行，并在当前桌面版 Chrome 和 Edge 中执行指定人工 smoke test。
  - 依赖：T002、T024–T044。覆盖：AC-01 至 AC-15。

## 9. 非阻塞 MVP 增强项

- [x] **T046 — 添加关系线 model、Command 和 renderer 支持**
  - 仅在 P0 验证通过后引入 document-level relationship record。
  - 添加创建/编辑/删除 Command、format 覆盖和 SVG export 测试。
  - 依赖：T045。仅为增强项，不阻塞 P0 发布。

- [x] **T047 — 添加边界和概要**
  - 添加 layout-aware boundary/summary record、Command、inspector 控件和 export 覆盖。
  - 为分组分支保留选择和折叠语义。
  - 依赖：T045。仅为增强项，不阻塞 P0 发布。

- [x] **T048 — 添加 tidy-layout Command**
  - 提供明确 Command，在不破坏 document hierarchy 的情况下重新计算 presentation/order。
  - 向用户显示作用范围、预览和 undo 行为。
  - 依赖：T045。仅为增强项，不阻塞 P0 发布。

## 10. 文档、仓库卫生与交付记录

- [x] **T049 — 重新检查并更新 `.gitignore`**
  - 只添加本功能引入的生成测试报告、cache、本地 scratch/output 目录或环境噪声。
  - 使用分组注释，绝不忽略 source、test、spec、doc、lockfile 或必需配置。
  - 依赖：T002、T045。

- [x] **T050 — 更新仓库和用户文档**
  - 更新 `README.md` 和 `docs/PROJECT_STRUCTURE.md`，反映实际架构、命令和浏览器支持。
  - 创建 `docs/USER_GUIDE.md` 和 `docs/FILE_FORMAT.md`，覆盖快捷键、备份/导入/导出、JSON v2、迁移和浏览器存储限制。
  - 依赖：T045。

- [x] **T051 — 更新 `CODE_MAP.md`**
  - 记录实际页面、editor component、package、adapter、重要 export function 和职责边界。
  - 不描述未实现的计划模块。
  - 依赖：T045、T050。

- [x] **T052 — 运行最终验证并创建 `verify.md`**
  - 运行格式检查、lint、typecheck、单元测试、build 和浏览器测试；在 `specs/web-mind-map-mvp/verify.md` 中记录输出、人工检查、验收标准状态、变更文件、已知风险和后续事项。
  - 每个跳过的检查都必须记录具体原因。
  - 依赖：T045、T049–T051。

- [x] **T053 — 更新 `PROJECT_PROGRESS.md`**
  - 只在 T052 后记录已完成或进行中状态。
  - 链接 spec 和验证产物，列出已验证区域和未解决风险；只有 P0 标准通过或用户接受已记录差距时才能标记完成。
  - 依赖：T052。

## 建议执行批次

| 批次                | 任务                 | 结果                                                            |
| ------------------- | -------------------- | --------------------------------------------------------------- |
| A — Core 基础       | T001–T005            | 测试 fixture、v2 model、invariant 和 Command/history 契约。     |
| B — Core Command    | T006–T012            | 具备单元测试覆盖的完整可逆树结构与 metadata 编辑。              |
| C — 数据安全        | T013–T018            | JSON migration、repository 测试和可靠 autosave。                |
| D — Layout 与 scene | T019–T022            | 感知文本的 layout 和可复用完整 SVG scene。                      |
| E — 编辑器基础      | T023–T031            | 导图生命周期、由 Command 支持的 session、键盘编辑和 clipboard。 |
| F — Canvas 交互     | T032–T035            | 平移/缩放、适应画布、折叠和 drag/drop。                         |
| G — 用户功能        | T036–T042            | 样式、metadata、搜索和全部导入/导出路径。                       |
| H — P0 发布         | T043–T045、T049–T053 | 可访问性、规模、端到端测试、文档和验证记录。                    |
| I — 可选增强        | T046–T048            | 关系线、边界/概要和 tidy layout。                               |
