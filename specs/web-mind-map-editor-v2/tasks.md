# Web Mind Map Editor V2 任务清单

## 任务规则

- 状态使用复选框记录；只有代码、测试或文档实际完成并通过对应检查后才能勾选。
- 任务按依赖顺序执行；同一批次内没有直接依赖的任务可以并行，但合并前必须运行该批次的针对性验证。
- 所有持久化编辑必须经过 `mindmap-core` Command 与现有 `EditorSession`，不得在 React component 中直接修改 document。
- Core、layout、format、renderer 和 storage contract 必须保持平台无关；DOM、File、Blob、Canvas、IndexedDB 和 i18n 只允许出现在 Web/platform adapter 或 storage implementation。
- 涉及新增或确认 library/API 用法的任务，实施前必须按照仓库要求使用 Context7 获取当前文档。
- 本清单全部属于 V2 交付范围；任何任务都不得扩展到 PWA、小程序、原生端、协作、AI、完整 Xmind 格式或通用白板。

## 0. 回归基线与 schema v3

- [x] **T001 — 锁定现有 MVP 回归基线**
  - 运行并记录当前 core、format、layout、renderer、storage、Web editor、build 和 E2E 基线。
  - 为现有导图 CRUD、主题编辑、undo/redo、autosave、搜索、增强对象与 JSON/SVG/PNG 导出补足缺失的回归断言，但不改变产品行为。
  - 产出可证明升级前行为的测试基线，发现既有失败时先记录，不在本任务中做无关重构。
  - 覆盖：AC-01、AC-18、AC-19、AC-20。

- [x] **T002 — 添加 V2 确定性 fixtures**
  - 在对应 package 测试目录中增加 schema v2 legacy、schema v3 完整导图、main root 加多个 Floating Topic、五种 structure、mixed structure、labels、numbering、Callout、图片 metadata、公式和详细样式 fixture。
  - 增加 cycle、多 parent、重复 ownership、未登记 null-parent、损坏 asset manifest、危险 SVG 和无效 LaTeX fixture。
  - Fixture 必须平台无关、ID 稳定，并包含 50 节点键盘场景与 500 节点性能场景。
  - 依赖：T001。

- [x] **T003 — 定义 schema v3 领域类型与默认 document**
  - 在 `packages/mindmap-core` 中加入 `MindMapDocumentV3`、`floatingTopics`、`defaultStructure`、`structureOverrides`、label catalog、asset metadata、theme、Callout 与 node `contentBlocks`。
  - 扩展 topic、branch、relationship、boundary、summary 和 Callout style 类型，同时保持旧字段的兼容默认视觉。
  - 默认 document 创建保持确定性，且不得引用 DOM、Browser File、Blob、Canvas 或 IndexedDB 类型。
  - 依赖：T002。覆盖：AC-01、AC-18、AC-19。

- [x] **T004 — 实现 schema v3 forest invariant 与 traversal helper**
  - 验证 main root、已登记 Floating Topic root、parent/child 一致性、恰好一次可达、cycle、多 parent、重复 child 和跨 root ownership。
  - 扩展 ancestors、descendants、root ownership、规范化多选和 subtree 查询，使其可用于普通树与 Floating Topic 子树。
  - 返回 typed domain error，不得部分修改输入 document。
  - 依赖：T003。覆盖：AC-01、AC-05、AC-18。

- [x] **T005 — 定义 format schema v3 与 v2-to-v3 migration**
  - 在 `packages/mindmap-format` 中定义 v3 Zod schema，为旧 document 补齐 structure、Floating Topic registry、labels、assets、theme 和新 enhancement style 默认值。
  - 保留 v1/v2 输入路径，确保 v1→v2→v3 与 v2→v3 保留 map/node/enhancement ID、`childIds` 顺序和已有内容。
  - 未来版本、未知结构和损坏 forest 采用已定义的安全失败策略，不覆盖原存储记录。
  - 依赖：T003、T004。覆盖：AC-01、AC-18、AC-19。

- [x] **T006 — 验证 v1/v2/v3 迁移与 document round trip**
  - 添加 migration、parse、serialize 和 invariant 测试，覆盖有效 legacy 数据及全部损坏 fixtures。
  - 验证旧导图迁移、保存、重新解析后内容、顺序、增强对象和基础视觉属性等价。
  - 运行 `mindmap-core` 与 `mindmap-format` 针对性测试，修复本批次引入的失败。
  - 依赖：T004、T005。覆盖：AC-01、AC-18、AC-19。

## 1. 高级结构编辑与 Floating Topic

- [x] **T007 — 实现插入父主题 Command**
  - 添加 `InsertParentNodeCommand`，让新主题占据目标在原 parent 中的位置，并让原主题成为其第一个 child。
  - 返回新主题 ID 供 Web 立即进入编辑；对 main root、无效目标和失效 selection 返回稳定错误或禁用原因。
  - 添加 execute、undo、redo、redo-history 清空和时间戳测试。
  - 依赖：T004、T006。覆盖：AC-02、AC-18。

- [x] **T008 — 实现仅删除当前主题 Command**
  - 添加 `DeleteNodeKeepChildrenCommand`，按原顺序把 children 提升到原 parent 的对应位置，并完整保留后代与增强引用。
  - 禁止 main root；对 Floating Topic root 使用计划中明确的禁用策略，不做隐式多 Floating Topic 转换。
  - 验证无 child、单 child、多 child、折叠分支和完整 undo/redo。
  - 依赖：T004、T006。覆盖：AC-03、AC-18。

- [x] **T009 — 完成同级重排与层级提升/降低 Command**
  - 在现有 move 能力上提供稳定的向前/向后、提升层级和降低层级 helper/Command builder。
  - 处理 root、首项、末项、无前置 sibling、无合法 grandparent、cycle 和 no-op 边界。
  - 更新键盘 action mapping 的领域入口，但本任务不创建工具栏 UI。
  - 依赖：T004、T006。覆盖：AC-04、AC-18。

- [x] **T010 — 实现主题固定宽度与自动宽度 Command**
  - 在 node style/model 中落实 fixed width 与 auto width 语义，并提供可逆更新 Command。
  - 规范允许范围和恢复默认行为；中文、英文长单词、换行、emoji 和特殊字符不得破坏 document。
  - 添加 Command 与序列化测试，实际测量和 Canvas 对齐在布局/渲染批次完成。
  - 依赖：T003、T006。覆盖：AC-08、AC-14。

- [x] **T011 — 实现 Floating Topic 生命周期 Command**
  - 实现创建、移动 placement、删除整棵子树、普通子树转 Floating Topic、Floating Topic 接入普通树及对应 inverse。
  - Floating Topic 坐标使用内容空间坐标；转换必须保留完整 subtree、内容、样式和增强对象。
  - 对无效 parent、cycle、main root 转换和重叠 selection 返回确定结果。
  - 依赖：T004、T006。覆盖：AC-05、AC-18。

- [x] **T012 — 扩展 clipboard、duplicate 与 Batch Command 支持 forest**
  - 复制/粘贴普通 subtree 与 Floating Topic subtree 时重建必要 ID，并正确保留 label、content block、Callout、relationship 和 asset reference。
  - 样式 clipboard 与内容 clipboard 继续分离；多选中 ancestor/descendant 重叠时只复制规范化顶层 roots。
  - 验证 duplicate map/topic、cut/paste、跨 root 移动和 undo/redo。
  - 依赖：T007–T011。覆盖：AC-05、AC-11、AC-12、AC-13、AC-18。

- [x] **T013 — 完成高级结构 Core 回归测试**
  - 对 T007–T012 的每个 Command、inverse、批量失败原子性、invalid target 和混合 Command 序列添加测试。
  - 使用 50/500 节点 fixtures 验证连续创建、移动、提升/降低、转换和撤销不会破坏 forest invariant。
  - 运行 `npm.cmd test -- packages/mindmap-core` 和 `npm.cmd run typecheck`。
  - 依赖：T007–T012。覆盖：AC-02、AC-03、AC-04、AC-05、AC-08、AC-18、AC-20。

## 2. 可组合布局与多结构

- [x] **T014 — 定义 LayoutStrategy 与组合契约**
  - 在 `packages/mindmap-layout` 中定义 `LayoutStrategy`、subtree request/result、logical side、connector ports、subtree bounds 和 strategy registry。
  - 把当前从左到右布局封装为兼容 strategy，并保留旧 public entry 的过渡 wrapper。
  - Layout 继续只接收 document 与外部 node sizes，不读取 DOM。
  - 依赖：T003、T004、T013。

- [x] **T015 — 实现左右 Logic Chart strategy**
  - 实现 `logic-right` 与 `logic-left`，确保 parent/child 顺序稳定、connector port 正确并支持折叠与可变节点尺寸。
  - 为两个方向添加镜像、长文本、深树、宽树和完整 bounds 测试。
  - 依赖：T014。覆盖：AC-06、AC-20。

- [x] **T016 — 实现双向平衡 Mind Map strategy**
  - 实现 `mind-map-balanced`，为一级主题保存或派生稳定 side assignment，重排后不得无故左右跳动。
  - 处理奇偶分支、折叠、固定宽度和不同 subtree 高度；输出正确 ports 与 content bounds。
  - 依赖：T014。覆盖：AC-06、AC-20。

- [x] **T017 — 实现 Tree 与 Org Chart strategy**
  - 实现 `tree-top` 与 `org-top` 的从上到下布局，并明确两者在连接线或层级间距上的差异。
  - 覆盖可变尺寸、宽/深树、折叠、connector 和 bounds 测试。
  - 依赖：T014。覆盖：AC-06、AC-20。

- [x] **T018 — 实现 mixed structure 与 Floating Topic layout composition**
  - 根据最近的 `structureOverrides[nodeId]` 递归组合子树 layout；取消 override 后恢复 document 默认结构。
  - 将 main root 与 Floating Topic roots 放入同一内容坐标系；普通整理不得改变 Floating Topic anchor。
  - 支持单独整理 Floating Topic，并确保所有 roots 都进入 fit/export bounds。
  - 依赖：T015–T017。覆盖：AC-05、AC-06、AC-07、AC-19。

- [x] **T019 — 接入多布局并完成 layout 回归与规模测试**
  - 让 Web editor 消费新的 positioned node/port/side metadata，修正 hit test、drag preview、selection box、text editor overlay 和 connector。
  - 切换结构只执行可逆结构配置 Command，不改写文本、hierarchy、sibling order 或 metadata。
  - 运行 layout、renderer、Web 针对性测试，并以 500 节点 fixture 验证切换、fit 和导出 bounds。
  - 依赖：T018。覆盖：AC-05、AC-06、AC-07、AC-08、AC-19、AC-20。

## 3. 标签、编号、筛选与分支聚焦

- [x] **T020 — 实现 label catalog 与节点标签 Command**
  - 支持 label 新建、重命名、删除、复用、颜色和排序；节点保存有序 `labelIds`。
  - 定义删除 catalog label 时清理 node references 的原子行为，并支持 undo/redo。
  - 规范空标签、重复标签、大小写、逗号和超长名称的验证规则。
  - 依赖：T003、T006。覆盖：AC-09、AC-18。

- [x] **T021 — 实现组合筛选纯查询能力**
  - 在 core 或 Web editor query 模块中实现主题文本、label、Marker、优先级、状态和 notes presence 的组合匹配。
  - 查询必须是纯函数，不改变折叠、选择、层级或 document；返回匹配 ID 与必要的上下文路径。
  - 覆盖空条件、AND/OR 约定、折叠分支、Floating Topic 和 500 节点测试。
  - 依赖：T020。覆盖：AC-09、AC-17、AC-20。

- [x] **T022 — 实现 numbering policy 与派生编号**
  - 定义阿拉伯数字、英文字母、罗马数字、同级编号、层级编号、起始值和重启规则。
  - Numbering policy 作为独立语义数据保存，显示文本根据当前 sibling order 派生，不写回 topic text。
  - 添加应用、移除、重启和批量操作 Command 及 inverse。
  - 依赖：T003、T006。覆盖：AC-10、AC-18。

- [x] **T023 — 验证编号在结构变化后的稳定性**
  - 覆盖插入、删除、同级重排、提升/降低、移动 parent、undo/redo、Floating Topic 转换和 JSON round trip。
  - 在 SVG scene 中预留独立 numbering primitive/文本段，确保取消编号后原 topic text 不变。
  - 依赖：T009、T011、T022。覆盖：AC-10、AC-18、AC-19。

- [x] **T024 — 实现标签、筛选与编号 Web UI**
  - 在 Inspector/Insert menu 中提供标签管理和编号设置；在筛选面板显示组合条件、匹配数、清除和标签点击突出。
  - 多选时说明批量作用范围；混合编号/标签状态不能显示为单一值。
  - 筛选只更新 UI state，清除后恢复正常可见性且不改写折叠或选择数据。
  - 依赖：T020–T023。覆盖：AC-09、AC-10、AC-14、AC-21、AC-22。

- [x] **T025 — 实现 branch focus 与编辑导航**
  - 在 Zustand store 中加入 focused root、面包屑、上一个 selection 和当前编辑主题导航，不持久化到 document。
  - 聚焦范围外搜索/筛选结果必须提示退出聚焦或切换分支；聚焦内编辑仍写回原 document。
  - 添加进入、返回 parent、退出、undo 后目标消失和 Floating Topic 边界测试。
  - 依赖：T019、T021。覆盖：AC-17、AC-20、AC-21、AC-22。

## 4. 对象选择、Callout 与增强对象样式

- [x] **T026 — 建立 typed selection contract**
  - 把 Web selection 扩展为 topic 单选/多选、relationship、boundary、summary 和 Callout target。
  - 迁移 Canvas、Inspector、keyboard 和 editor store，防止失效对象 ID 留在 selection 中。
  - 明确不同 target 的可用 action、混合状态和焦点行为。
  - 依赖：T013、T019。覆盖：AC-16、AC-21、AC-22。

- [x] **T027 — 实现 Callout 领域模型与 Command**
  - 实现创建、更新文本、placement/方向、样式、删除及 inverse；每个 topic 最多一个 Callout。
  - Callout 不进入主题层级，但跟随 owner 的移动、复制、粘贴和删除。
  - 覆盖普通主题、Floating Topic、空/长文本和 owner 被删除/恢复。
  - 依赖：T003、T012、T026。覆盖：AC-11、AC-18。

- [x] **T028 — 扩展 relationship 几何与样式 Command**
  - 增加线型、颜色、宽度、虚线、起终点、label style 和可持久化 control points。
  - 布局切换或节点移动后保留相对控制意图；无效几何回退到安全默认路径。
  - 为拖动控制点、undo/redo、保存重开和 mixed layout 添加测试。
  - 依赖：T019、T026。覆盖：AC-16、AC-18、AC-19。

- [x] **T029 — 扩展 boundary、summary 与 Callout 样式 Command**
  - 为 boundary 增加 shape/fill/opacity/border，为 summary 增加 bracket/connector/topic style，为 Callout 增加 shape/fill/border/text style。
  - 所有更新使用 typed Command，并只覆盖用户明确修改的属性。
  - 依赖：T027、T026。覆盖：AC-11、AC-14、AC-16、AC-18。

- [x] **T030 — 扩展 SVG scene 的 labels、numbering、Callout 与增强样式**
  - 增加可序列化 scene primitive，计算完整 bounds，并正确处理折叠、聚焦和 Floating Topic。
  - Relationship control point、boundary、summary 和 Callout 视觉必须与 selection hit area 对齐。
  - 添加 escaping、确定性序列化和导出不裁切测试。
  - 依赖：T023、T027–T029。覆盖：AC-10、AC-11、AC-16、AC-19。

- [x] **T031 — 完成增强对象 Canvas/Inspector 交互测试**
  - 支持对象独立选择、编辑、拖动、删除和样式设置，且 selection 状态清晰。
  - 验证对象与 topic 快速切换、多选禁用规则、undo/redo、autosave 和重新打开。
  - 运行 core、renderer 与 Web 针对性测试。
  - 依赖：T026–T030。覆盖：AC-11、AC-16、AC-18、AC-21、AC-22。

## 5. Asset storage 与图片

- [x] **T032 — 定义 asset metadata、资源限制与 repository contract**
  - 落实 `MindMapAssetRepository` 的 get/put/listByMap/delete/deleteByMap 契约、typed error 和防御性副本语义。
  - 将单图片 `5 MiB`、单 map `25 MiB` 设为 Web adapter 可配置默认值，不硬编码进 core schema。
  - 定义稳定 `assetId`、checksum、MIME、byte size、intrinsic size 和引用计数查询 helper。
  - 依赖：T003、T006。覆盖：AC-12、AC-18、AC-19。

- [x] **T033 — 升级 Dexie schema 并实现 Blob asset table**
  - 新增 asset table，不重建或清空现有 maps table；验证旧 IndexedDB 自动升级后仍可读取 v2 map。
  - 实现 put/get/list/delete 与 map 删除清理，转换 quota、transaction 和 IndexedDB unavailable 错误。
  - 依赖：T032。覆盖：AC-01、AC-12、AC-18。

- [x] **T034 — 实现 memory asset repository 与资源生命周期测试**
  - 为单元测试实现 memory adapter，并与 Dexie adapter 共享 contract suite。
  - 验证 Blob 先写后 Command、undo 不立即删除、redo 仍可读取、保存后延迟 orphan GC、删除 map 清理和失败隔离。
  - 依赖：T033。覆盖：AC-12、AC-18。

- [x] **T035 — 实现图片读取、解码与安全 SVG adapter**
  - 支持 PNG、JPEG、WebP、GIF、SVG 文件与浏览器允许的剪贴板图片，验证声明 MIME、实际解码、尺寸和配额。
  - SVG 必须拒绝 script、event handler、外部 URL、危险 URI、`foreignObject` 和不允许的节点/属性。
  - 如需新增 sanitizer/image library，先使用 Context7 核对当前 API、版本和安全建议，再更新 `package.json` 与 `package-lock.json`。
  - 依赖：T032。覆盖：AC-12、AC-20。

- [x] **T036 — 实现 image content block Command**
  - 添加图片引用、展示宽度、等比恢复、替代文本和删除的可逆 Command。
  - 复制/粘贴/duplicate 复用相同 asset 或按 map ownership 复制引用，不把 Blob/Base64 放入 history。
  - 资源写入失败或超过限制时 document 保持不变。
  - 依赖：T012、T034、T035。覆盖：AC-12、AC-18。

- [x] **T037 — 实现图片插入与编辑 UI**
  - 在 Insert menu/Inspector 中加入文件选择、剪贴板粘贴、宽度调整、恢复比例、替代文本和删除。
  - 显示 loading、安全占位、格式/大小/quota 错误，并保持 editor selection 和 keyboard focus。
  - 依赖：T026、T035、T036。覆盖：AC-12、AC-20、AC-21、AC-22。

- [x] **T038 — 在节点测量与 SVG scene 中渲染图片**
  - 为图片 ready/error 状态提供稳定占位尺寸，资源加载完成后批量重新测量且尽量保持 selected node 的屏幕锚点。
  - Canvas 可使用安全 object URL；序列化 SVG 必须使用内联 data URI，不能泄漏 `blob:` URL。
  - 覆盖透明图、动画 GIF 静态导出行为、SVG、超大尺寸、加载失败和完整 bounds。
  - 依赖：T019、T030、T036、T037。覆盖：AC-08、AC-12、AC-19、AC-20。

- [x] **T039 — 实现 MindMap bundle 格式与资源 round trip**
  - 在 `mindmap-format` 中新增 bundle envelope、asset manifest、Base64 payload、checksum/MIME/总大小验证与确定性序列化。
  - 保留 document-only v1/v2/v3 导入；bundle 必须先完整校验，再原子写入 assets/document，失败时不产生半张 map。
  - 依赖：T005、T034–T036。覆盖：AC-01、AC-12、AC-18、AC-19。

- [x] **T040 — 完成图片保存、复制与导出集成测试**
  - 覆盖自动保存/刷新、复制主题、复制整图、bundle 导入导出、SVG/PNG 内联、quota、损坏 checksum 和恶意 SVG。
  - 确认失败时原 map、最后成功保存 revision 和 undo/redo history 不被破坏。
  - 运行 format、storage、renderer 和 Web 针对性测试。
  - 依赖：T033–T039。覆盖：AC-12、AC-18、AC-19、AC-20。

## 6. 数学公式

- [x] **T041 — 验证并锁定 MathJax Web 集成方式**
  - 使用 Context7 获取当前 MathJax v4 文档，制作最小 Vite spike，验证动态 import、`tex2svgPromise()`、SVG 序列化、字体资源和 production build。
  - 记录 bundle 增量、首次加载行为和不支持项；只有 spike 通过后才添加实际 dependency 并更新 lockfile。
  - 若 bundle 体积不满足目标，只更换 Web `EquationRenderer` adapter，不改变 core schema。
  - 依赖：T001。

- [x] **T042 — 实现 EquationRenderer adapter 与缓存**
  - 定义平台无关 `EquationRenderer` contract；Web 实现异步加载 MathJax 并返回经过清理的 SVG、intrinsic size 和错误结果。
  - 缓存 key 包含 LaTeX source、display mode、字号和 renderer version；错误或极端尺寸不能让 layout/export 崩溃。
  - 依赖：T041。覆盖：AC-13、AC-20。

- [x] **T043 — 实现 equation content block Command 与编辑 dialog**
  - 保存 LaTeX source、display mode 和展示 metadata；提交无效公式时保留最后一次有效内容和当前草稿。
  - 提供创建、编辑、预览、删除和明确错误反馈，处理空、极长、不支持命令与 IME composition。
  - 依赖：T012、T026、T042。覆盖：AC-13、AC-18、AC-21、AC-22。

- [x] **T044 — 在节点测量与 SVG scene 中渲染公式**
  - 使用 `RenderedEquation` 生成可序列化 SVG primitive，不依赖 `foreignObject`。
  - 公式异步 ready 后重新测量布局；Canvas、SVG export 和 PNG export 复用同一有效渲染结果。
  - 依赖：T030、T038、T042、T043。覆盖：AC-08、AC-13、AC-19、AC-20。

- [x] **T045 — 完成公式 round trip、导出与失败测试**
  - 覆盖有效/无效 LaTeX、编辑恢复、复制/粘贴、undo/redo、autosave、bundle、SVG/PNG 和 MathJax 加载失败。
  - 验证 renderer cache 不把派生 SVG 当成唯一事实来源，刷新后可从 source 重建。
  - 依赖：T042–T044。覆盖：AC-13、AC-18、AC-19、AC-20。

## 7. Theme 与细粒度样式

- [x] **T046 — 实现 theme、topic、text、border 与 branch style Command**
  - 支持五类 topic shape、font family/size/weight/italic/strike/alignment/color、fill、border、fixed width 与 branch color/width/pattern/connector shape。
  - Document theme 保存背景、默认字体和内置 preset；显式 topic style 覆盖 theme default。
  - 每项更新只修改用户选择的属性，并生成精确 inverse。
  - 依赖：T003、T006、T010。覆盖：AC-08、AC-14、AC-18。

- [x] **T047 — 实现计算样式与 theme 级联规则**
  - 提供平台无关的 computed style helper，处理 map theme、层级默认值、branch 默认值与 explicit override。
  - 重置样式只移除对应 override，并恢复当前 theme；切换 theme 不覆盖显式值。
  - 为单选、多选混合值、后代和同层级查询添加测试。
  - 依赖：T046。覆盖：AC-14、AC-15、AC-19。

- [x] **T048 — 实现独立 style clipboard 与批量应用**
  - Style clipboard 只存于 UI state，与 topic content clipboard 分离。
  - 支持复制、粘贴、重置，以及应用到当前主题、同级、全部后代或同层级；执行前暴露明确作用范围。
  - 多选只覆盖用户实际选择的属性，并以原子 `BatchCommand` 支持 undo/redo。
  - 依赖：T012、T026、T046、T047。覆盖：AC-14、AC-15、AC-18。

- [x] **T049 — 扩展 Inspector 与 Style menu**
  - 提供 theme、topic、text、border、branch 和增强对象样式入口；多选显示一致值或 mixed state。
  - 颜色、数值和枚举控件需要 validation、keyboard 操作、可访问名称和焦点恢复。
  - 依赖：T024、T031、T046–T048。覆盖：AC-14、AC-15、AC-16、AC-21、AC-22。

- [x] **T050 — 让 Canvas 与导出统一使用 computed style**
  - 扩展 SVG scene 的形状、文字、边框、背景和 branch line 渲染，编辑画布与 export 不得分别计算样式。
  - 选择框、text editor overlay、connector port 和 fixed-width wrap 必须与渲染结果对齐。
  - 依赖：T019、T030、T044、T047。覆盖：AC-08、AC-14、AC-16、AC-19。

- [x] **T051 — 完成样式回归与批量操作测试**
  - 覆盖五种形状、theme 切换、explicit override、mixed state、复制/粘贴/重置、同级/后代作用域和增强对象样式。
  - 验证文本、结构、labels、notes、links 和其他 metadata 不因样式操作改变。
  - 运行 core、renderer 与 Web 针对性测试。
  - 依赖：T046–T050。覆盖：AC-08、AC-14、AC-15、AC-16、AC-18、AC-19。

## 8. 统一 Action 与基本编辑工具栏

- [x] **T052 — 定义 EditorActionRegistry contract**
  - 定义 Action ID、group、label key、shortcut、visibility、enabled/active 状态、disabled reason 和 execute contract。
  - 将 document Command、UI-only state change 和 platform side effect 路由分开，descriptor 不持有独立 document 副本。
  - 按 History、Topic、Structure、Insert、Style、View 分组，并建立完整必需操作清单。
  - 依赖：T013、T025、T031、T040、T045、T051。覆盖：AC-21、AC-22。

- [x] **T053 — 将现有快捷键和编辑操作迁移到统一 dispatcher**
  - 先迁移 undo/redo、创建同级/子级、编辑、duplicate、删除、collapse、tidy、zoom、fit、center、import/export。
  - Keyboard parser 只把事件映射到 Action ID；IME composition、input/textarea 和浏览器保留快捷键继续使用现有 guard。
  - 迁移后现有快捷键与 undo/redo 回归测试必须保持通过。
  - 依赖：T052。覆盖：AC-04、AC-18、AC-21。

- [x] **T054 — 实现 selection-aware Action 状态规则**
  - 覆盖 loading、无选择、main root、普通主题、Floating Topic、多选、relationship、boundary、summary 和 Callout。
  - 非法操作保持可见并返回本地化 disabled reason；多选动作声明作用范围，不支持的批量操作禁用。
  - History、平台能力和异步 action 进行中状态必须实时更新，不允许点击后静默失败。
  - 依赖：T052、T053。覆盖：AC-21、AC-22。

- [x] **T055 — 创建基础编辑工具栏骨架与高频按钮**
  - 在 Header 下方创建 toolbar，直接显示 Undo、Redo、创建同级、创建子级、删除、Insert、Structure、Style 和基础缩放。
  - Header 继续负责返回、标题、保存、导入和导出，不重复编辑工具。
  - 所有按钮通过 dispatcher 执行，提供图标、中文/英文 accessible name、tooltip 和 shortcut。
  - 依赖：T053、T054。覆盖：AC-20、AC-21、AC-22。

- [x] **T056 — 实现 Topic、Structure、Insert、Style 与 View 分组菜单**
  - 接入插入父主题、Floating Topic、重排/层级、布局、focus、Marker、labels、Callout、关系线、边界、概要、notes、links、图片、公式和样式操作。
  - 显示当前 structure/theme/tool active 状态，并在菜单打开期间安全响应 selection/history 变化。
  - 依赖：T024、T025、T031、T037、T043、T049、T055。覆盖：AC-02 至 AC-17、AC-21、AC-22。

- [x] **T057 — 实现工具栏键盘导航与焦点管理**
  - 支持 `Tab`、方向键、`Home`/`End`（如采用 roving focus）、`Enter`、`Space` 和 `Esc`。
  - 设置正确的 `aria-expanded`、`aria-controls`、`aria-disabled`、menu role/label，并在菜单关闭后返回触发按钮。
  - 处理 tooltip、颜色选择器、语言切换、undo 和 IME composition 期间的焦点边界。
  - 依赖：T055、T056。覆盖：AC-20、AC-22。

- [x] **T058 — 实现响应式 overflow menu**
  - 根据可用宽度将低频项移入 overflow，保留全部必需操作，并避免遮挡 Canvas 主要编辑区域。
  - 处理浏览器缩放、窗口 resize、overflow 打开后再次 resize 和语言切换导致的宽度变化。
  - Overflow 内动作、tooltip、disabled reason 和键盘行为必须与原分组一致。
  - 依赖：T055–T057。覆盖：AC-21、AC-22。

- [x] **T059 — 统一 context menu、Inspector 与工具栏并验证 Action 等价性**
  - 让 context menu 和 Inspector 改用相同 Action ID 或共享 Command builder，移除重复业务分支。
  - 使用参数化测试从 toolbar、shortcut、context menu 和 Inspector 执行同一 action，比较 document、history、autosave revision 和错误结果。
  - 补充所有 Action 文案、disabled reason、tooltip 和中英文 i18n key。
  - 依赖：T053–T058。覆盖：AC-18、AC-21、AC-22。

## 9. 导出、可靠性、性能与验收

- [x] **T060 — 统一异步资源导出 pipeline**
  - Export 在序列化前等待图片和公式资源 ready，并以内联 data URI/SVG fragment 生成完整 scene。
  - SVG/PNG 使用完整 document/layout bounds，不受 viewport、focus 或 filter 的临时裁切；明确导出当前完整导图的规则。
  - 对超大 Floating Topic 坐标、Canvas 像素上限、内存不足和资源缺失提供 typed 可恢复错误与 SVG fallback。
  - 依赖：T040、T045、T050、T059。覆盖：AC-12、AC-13、AC-16、AC-19。

- [x] **T061 — 加固 autosave 与资源失败一致性**
  - 扩展 revision-aware autosave，使 schema v3 document、Floating Topic、结构、labels、numbering、Callout、图片引用、公式和样式进入最新成功 revision。
  - 测试保存进行中连续切换布局、粘贴图片、编辑公式和 undo/redo；旧保存不得覆盖新 revision。
  - Quota、asset transaction 和 repository failure 必须保留可编辑状态并显示可恢复错误。
  - 依赖：T040、T045、T051、T059。覆盖：AC-18、AC-20。

- [x] **T062 — 完成全功能 undo/redo 混合序列测试**
  - 构造跨结构、Floating Topic、labels、numbering、Callout、图片、公式、样式和 Action 入口的长序列。
  - 逐步 undo/redo 并验证 document、asset availability、selection guard、layout 与 scene；undo 后新编辑必须清空 redo。
  - 依赖：T059–T061。覆盖：AC-18、AC-19。

- [x] **T063 — 优化并验证 50/500 节点性能**
  - Profile layout、scene、React rerender、filter/focus、autosave、图片/公式缓存和 toolbar state 计算。
  - 使用 document revision、content hash、memoized layout/scene 和 viewport state 隔离消除已证实的热点；没有证据时不引入 Worker 或 Canvas 重构。
  - 验证 50 主题连续键盘创建/移动不丢输入，500 主题可完成布局切换、筛选、聚焦、pan/zoom 和保存。
  - 依赖：T019、T025、T045、T059、T061。覆盖：AC-20。

- [x] **T064 — 添加 V2 关键流程 E2E**
  - 覆盖旧 map 升级、高级结构、Floating Topic、多布局、labels/numbering、Callout、图片/公式、样式、toolbar 与导出 round trip。
  - 覆盖 keyboard-only toolbar、disabled reason、focus restore、overflow resize 和 IME/text-edit guard。
  - 使用隔离 IndexedDB 与确定性 fixtures，避免测试相互污染。
  - 依赖：T060–T063。覆盖：AC-01 至 AC-22。

- [x] **T065 — 执行 Chrome 与 Edge 人工验收**
  - 按 `plan.md` 的八个人工场景验证 Canvas、toolbar、keyboard、IME、图片/公式、导出、错误恢复和窄窗口。
  - 记录浏览器版本、结果、截图或复现步骤；发现问题先回到对应任务修复，不把未通过项标记完成。
  - Firefox 与 Safari 只记录尽力兼容结果，不作为本阶段阻塞门禁。
  - 依赖：T064。覆盖：AC-01 至 AC-22。

## 10. 文档、仓库卫生与交付记录

- [x] **T066 — 更新 `.gitignore`**
  - 检查 MathJax spike、Playwright、bundle fixture、截图、coverage、cache、临时导出和浏览器 profile 产物。
  - 只忽略生成物和本地临时文件，不得隐藏 source、spec、test fixture、文档、lockfile 或必要的验证证据。
  - 依赖：T041、T064。

- [x] **T067 — 更新 `README.md`**
  - 使用中文说明 V2 实际完成范围、启动/测试命令、支持浏览器、本地优先行为、资源限制与明确未支持项。
  - 只记录已实现并已验证的功能，不把计划项描述为已完成。
  - 依赖：T065。

- [x] **T068 — 更新 `docs/PROJECT_STRUCTURE.md`**
  - 记录 schema v3 ownership、Command、layout strategy/composition、renderer、asset repository、EquationRenderer、Action registry、toolbar 与 platform adapter 边界。
  - 使用实际文件和 export 名称，删除或修正已过时的目录描述。
  - 依赖：T065。

- [x] **T069 — 更新 `docs/FILE_FORMAT.md`**
  - 说明 v3 document、v1/v2 migration、forest invariant、structure override、labels/numbering/Callout、content blocks、theme、bundle envelope、asset manifest、checksum 和限制。
  - 记录兼容保证、安全失败行为与用户备份/恢复方式。
  - 依赖：T039、T065。

- [x] **T070 — 更新 `docs/USER_GUIDE.md`**
  - 使用中文说明基础编辑工具栏、快捷键、高级结构、Floating Topic、布局、labels/numbering、Callout、图片/公式、样式、focus/filter 和导入导出。
  - 记录资源限制、SVG/PNG fallback、常见错误恢复和本地数据备份建议。
  - 依赖：T065。

- [x] **T071 — 创建或更新 `CODE_MAP.md`**
  - 只根据实际实现记录 package、module、主要 public API、数据流、Action group、测试入口和 ownership。
  - 为后续小程序复用标明平台无关层与 Web-only adapter，但不承诺未实现平台。
  - 依赖：T065、T068。

- [x] **T072 — 创建或更新 `PROJECT_PROGRESS.md`**
  - 使用中文按 AC-01 至 AC-22 记录完成、部分完成、未完成和已知风险，并链接对应测试或验证证据。
  - 只有实现和验证均通过的条目才能标记完成；不得因为任务文件存在就宣称 V2 已交付。
  - 依赖：T065、T067–T071。

- [x] **T073 — 运行完整验证并生成 `verify.md`**
  - 运行以下完整门禁并记录命令、时间、结果和失败原因：

    ```powershell
    npm.cmd run format:check
    npm.cmd run lint
    npm.cmd run typecheck
    npm.cmd test
    npm.cmd run build
    npm.cmd run test:e2e
    ```

  - 检查 `git diff --check`、未跟踪生成物和 `.gitignore`；确认没有产品范围外改动。
  - 在 `specs/web-mind-map-editor-v2/verify.md` 中逐项映射 AC-01 至 AC-22 的自动化/人工证据、已知限制和未通过项。
  - 依赖：T066–T072。覆盖：AC-01 至 AC-22。

## 11. 编辑器尺寸、视口与拖动体验回归修复

- [x] **T074 — 使用实际顶栏高度分配桌面编辑区**
  - 将编辑页改为 `100dvh` Grid，移除 `calc(100vh - 68px)`，并限制桌面根页面外层滚动。
  - Canvas 与 Inspector 填充剩余高度，Inspector 长内容只在自身滚动。
  - 覆盖：AC-23。

- [x] **T075 — 完成 960px 响应式断点与文件操作 overflow**
  - 宽度不超过 960px 时将 Inspector 放到 Canvas 下方，保持 Canvas 至少 520px 高且无横向溢出。
  - 隐藏顶栏文件按钮，并让导入 JSON、导出 JSON/SVG/PNG 从“更多”菜单继续可访问。
  - 依赖：T074。覆盖：AC-21、AC-23。

- [x] **T076 — 修正初始 viewport 与适应画布策略**
  - 每个 document 首次获得有效 Canvas 尺寸时以 100% 居中 Root，后续 revision 与 resize 不重复初始化。
  - 小导图适应画布不超过 100%，大导图缩小并保留边距与最小 zoom。
  - 依赖：T074。覆盖：AC-23。

- [x] **T077 — 禁止拖动主题时选择渲染文字**
  - Canvas/SVG 渲染面禁用 `user-select`，主题编辑 textarea 恢复文本选择。
  - 不增加全局 `preventDefault`，保持双击编辑、输入聚焦、键盘和 IME 行为。
  - 覆盖：AC-20、AC-23。

- [x] **T078 — 增加布局、viewport 与拖动 E2E**
  - 覆盖 2048、1440、1280、1024、960、900、800、721、720 和 390 宽度组合。
  - 同时检查 `body` 与 `documentElement` overflow、Inspector 排列、文件菜单、初始/适配 zoom、拖动后文字选择和编辑框选字。
  - 依赖：T074–T077。覆盖：AC-20、AC-21、AC-23。

- [x] **T079 — 完成浏览器验收与中文文档同步**
  - 运行 format、lint、typecheck、unit、build、Chromium E2E、Chrome/Edge 验收和 Playwright CLI 可视化检查。
  - 更新 `spec.md`、`plan.md`、`tasks.md`、`verify.md`、`PROJECT_PROGRESS.md` 与 `CODE_MAP.md`。
  - 依赖：T078。覆盖：AC-23。

## 建议执行批次

1. **批次 A：T001–T006** — 回归基线、schema v3、forest invariant 与迁移；这是其他任务的共同基础。
2. **批次 B：T007–T013** — 高级结构 Command 与 Floating Topic 领域能力。
3. **批次 C：T014–T019** — 可组合布局、五种结构、mixed structure 与 Canvas 接入。
4. **批次 D：T020–T025** — labels、numbering、filter 与 branch focus。
5. **批次 E：T026–T031** — typed selection、Callout 和增强对象样式。
6. **批次 F：T032–T040** — asset repository、图片安全、bundle 与图片导出。
7. **批次 G：T041–T045** — MathJax spike、公式编辑、渲染和导出。
8. **批次 H：T046–T051** — theme、细粒度样式、style clipboard 与批量应用。
9. **批次 I：T052–T059** — 统一 Action registry、基础编辑工具栏、overflow 与可访问性。
10. **批次 J：T060–T065** — 统一导出、autosave、undo/redo、性能、E2E 与浏览器验收。
11. **批次 K：T066–T073** — `.gitignore`、用户/架构/格式文档、`CODE_MAP.md`、`PROJECT_PROGRESS.md` 和最终验证。
12. **批次 L：T074–T079** — 编辑器全高布局、960px 响应式、初始/适配 viewport、拖动禁选文字与浏览器回归。

首个实施批次建议从 T001–T006 开始；完成并验证 schema v3 与迁移基础后，再进入结构编辑任务。
