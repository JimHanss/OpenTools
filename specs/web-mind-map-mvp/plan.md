# Web Mind Map MVP 技术计划

## 计划摘要

将当前“可展示初始化导图”的 Web 骨架演进为本地优先的单用户编辑器。继续保留现有的 `mindmap-core`、`mindmap-layout`、`mindmap-renderer-svg`、`mindmap-storage`、`mindmap-format` 五层边界；Web 应用只负责界面、浏览器事件和浏览器能力适配。

首版按可验证的纵向切片实施：先完成可靠的数据模型、命令和存储，再完成单导图编辑与导航，随后扩展导图库、导入导出、搜索和主题信息。关系线、边界、概要和一键整理按照规格作为增强项，在必需功能稳定后独立评估和排期。

## 当前基线

- `mindmap-core` 已有基础文档、节点、样式、链接类型和空的命令历史，但尚未实现具体编辑命令或结构校验。
- `mindmap-layout` 能输出从左到右的固定尺寸树布局，并会忽略折叠节点的后代。
- `mindmap-renderer-svg` 目前只提供三次贝塞尔连接线路径。
- `mindmap-storage` 已提供基于 Dexie 的 IndexedDB 仓库，具备单个导图读写、列表和删除能力。
- `mindmap-format` 只有 schema v1 的基础 Zod 解析和 JSON 序列化，没有迁移与树结构完整性校验。
- `apps/web` 只读取并自动保存一张固定 ID 的欢迎导图；界面尚未具备导图库、编辑命令、平移、拖动、搜索、导入或导出。

## 受影响的文件与模块

| 区域               | 需要修改的现有文件                                                                | 计划新增内容                                                                                                                                             | 职责                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 领域模型与 Command | `packages/mindmap-core/src/index.ts`                                              | `model.ts`、`document.ts`、`validation.ts`、`commands/*.ts`、`history.ts`、`search.ts`、`index.test.ts`、`commands.test.ts`                              | 平台无关模型、不可变编辑、inverse Command、与选择状态无关的树辅助函数和 invariant。                           |
| 布局               | `packages/mindmap-layout/src/index.ts`、`index.test.ts`                           | 必要时拆分为 `types.ts`、`layout.ts`、`layout.test.ts`                                                                                                   | 根据 document 和外部提供的节点尺寸生成从左到右的树布局、bounds、connector 和折叠分支。                        |
| SVG 渲染           | `packages/mindmap-renderer-svg/src/index.ts`                                      | `scene.ts`、`export.ts`、renderer tests                                                                                                                  | 提供纯 SVG scene 和 connector 辅助函数；不依赖 React、DOM 或浏览器 API。                                      |
| 格式与迁移         | `packages/mindmap-format/src/index.ts`                                            | `schema.ts`、`migration.ts`、`validation.ts`、`index.test.ts`                                                                                            | 负责版本化 JSON 解析、迁移、结构验证和稳定序列化。                                                            |
| 持久化             | `packages/mindmap-storage/src/index.ts`                                           | `repository.ts`、`dexie-repository.ts`、`memory-repository.ts`、tests                                                                                    | 提供可替换的导图 repository、确定性测试 repository 和 IndexedDB 实现。                                        |
| Web 编辑器         | `apps/web/src/App.tsx`、`apps/web/src/editor/store.ts`、`apps/web/src/styles.css` | `library/*`、`editor/*`、`components/*`、`platform/*`、`hooks/*`、Web tests                                                                              | 负责导图库、编辑器 session、SVG canvas、inspector、dialog、keyboard/pointer 交互、autosave 和浏览器 adapter。 |
| 工具与端到端测试   | `package.json`、`package-lock.json`、`vitest.config.ts`、`.gitignore`             | `playwright.config.ts`、`apps/web/e2e/*.spec.ts`                                                                                                         | 只添加浏览器交互和 IndexedDB 测试需要的支持，并保留现有浏览器报告目录的忽略规则。                             |
| 文档和工作流产物   | `README.md`、`docs/PROJECT_STRUCTURE.md`                                          | `docs/USER_GUIDE.md`、`docs/FILE_FORMAT.md`、`CODE_MAP.md`、`PROJECT_PROGRESS.md`、`specs/web-mind-map-mvp/tasks.md`、`specs/web-mind-map-mvp/verify.md` | 提供用户说明、仓库职责地图、进度、可执行任务清单和最终验证记录。                                              |

`apps/web/src/App.tsx` 只作为 application shell。功能行为移入职责集中的组件和 controller hooks，使编辑器保持可维护、可测试。

## 架构与数据流

```text
Browser event / toolbar / dialog
          |
          v
Web editor session (selection, viewport, edit state)
          |
          v
Platform-neutral command dispatcher
          |
          v
MindMapDocument + inverse command history
          |
          +------------------------+
          |                        |
          v                        v
layoutMindMap(document, metrics)  debounced serial autosave
          |                        |
          v                        v
SVG scene + React canvas           MindMapRepository (IndexedDB)
          |
          v
visible editor

JSON import: File adapter -> format parse/migrate/validate -> library or confirmed replacement
JSON export: format serialize -> File adapter
SVG/PNG export: layout + SVG scene -> SVG file / browser canvas adapter
```

### 职责规则

- `MindMapDocument` 是可编辑导图数据的唯一事实来源。
- 选择、活动文本编辑器、拖动预览、viewport transform、搜索游标和 dialog 都是仅属于 Web 的 UI state；除节点折叠等明确的导图功能外，这些状态不会持久化到领域 document。
- 所有持久化的 document 变更都必须经过 core Command。React 组件绝不直接修改 `childIds`、`nodes` 或嵌套 style。
- Layout package 接收完整的结构化数据和节点尺寸，但不能自行读取 DOM geometry。
- SVG package 生成确定性的 path 和可序列化的 scene 内容；浏览器文件创建、Canvas 渲染和 clipboard 访问保留在 Web adapter 中。
- Autosave controller 观察 Command 执行后的 document revision，并串行写入，避免较慢的旧保存覆盖较新的 document revision。

## 数据模型变更

### Schema 演进

将内部格式从 schema v1 升级到 schema v2。初始化欢迎导图已经持久化过 v1，因此仍必须能读取 v1 输入，并在 document 进入编辑器前完成迁移。新保存和导出只生成 v2。

迁移必须满足：

- 以确定性方式补充缺失的默认 style、空 notes、links、markers 和 collapse state。
- 当前缀可识别时，将旧版 string marker 转换为结构化 marker；无法识别的旧值保留为通用 icon marker，不能丢弃用户数据。
- 拒绝或报告无效 root reference、缺失 child record、重复 child reference、循环 ownership、多 parent 和断开连接的节点。
- 普通 v1 到 v2 迁移必须保留导图和节点 ID，使存储数据及当前导图链接保持稳定。

### 领域模型

将模型细化为明确、可序列化的类型，同时继续通过 `parentId` 和有序 `childIds` 表示邻接关系：

```ts
type MindMapSchemaVersion = 2

interface MindMapDocument {
  schemaVersion: MindMapSchemaVersion
  id: MindMapId
  title: string
  rootNodeId: MindMapNodeId
  nodes: Record<MindMapNodeId, MindMapNode>
  createdAt: string
  updatedAt: string
}

interface MindMapNode {
  id: MindMapNodeId
  parentId: MindMapNodeId | null
  childIds: MindMapNodeId[]
  text: string
  collapsed: boolean
  markers: MindMapMarker[]
  notes: string
  links: MindMapLink[]
  style: MindMapNodeStyle
}
```

除现有前景色、背景色和边框色外，计划为 `MindMapNodeStyle` 增加与 preset 兼容的明确 typography 和 shape 字段。`MindMapMarker` 具有受约束的 `kind`（`priority`、`status` 或 `icon`）和字符串值。Core validator 要求每个节点最多一个 priority marker 和一个 status marker，同时允许多个 icon。

导图标题继续作为 document-level data；因此重命名导图属于 document Command，必须参与 undo/redo。Notes 和 links 继续属于节点数据。关系线、边界和概要只在对应 enhancement 开始时使用独立的 document-level collection；在有可见功能使用它们之前，不提前引入 P0 模型。

### 数据 invariant

Core validator 和 format validator 必须遵守相同规则：

- 必须且只能存在一个 root；它是 `rootNodeId` 指向的 record，且具有 `parentId: null`。
- 每个非 root 节点都有一个存在的 parent，并且在该 parent 的有序 `childIds` 中只出现一次。
- 任何节点都不能出现在自己的 ancestry 中，树中不能有 cycle 或断开的 record。
- 节点不能移动到自身或任何 descendant 之下。
- Root 不能被删除、cut、作为 child paste 或移动。
- 文本按输入内容保留，但提交编辑时，只包含 whitespace 的标题需要规范化为安全 fallback。
- 解析 URL，并且 Web adapter 只能从外部打开安全的 `http:` 和 `https:` 链接。

## API 与接口变更

### `@opentools/mindmap-core`

使用具体的 discriminated Command 和纯辅助函数，替换当前仅提供通用 history 的契约。

```ts
type MindMapCommand =
  | CreateNodeCommand
  | UpdateNodeTextCommand
  | UpdateNodeStyleCommand
  | UpdateNodeMarkersCommand
  | UpdateNodeNotesCommand
  | UpdateNodeLinksCommand
  | ToggleNodeCollapseCommand
  | MoveNodeCommand
  | DeleteSubtreeCommand
  | PasteSubtreeCommand
  | RenameMapCommand
  | BatchCommand

interface CommandExecutionContext {
  now: string
}

interface CommandResult {
  document: MindMapDocument
  inverse: MindMapCommand
  affectedNodeIds: MindMapNodeId[]
}

function executeCommand(
  document: MindMapDocument,
  command: MindMapCommand,
  context: CommandExecutionContext,
): CommandResult
```

`CommandHistory` 存储已执行 Command 及其 inverse，暴露 `execute`、`undo`、`redo`、`canUndo` 和 `canRedo`，并在新编辑后清空 redo history。`BatchCommand` 保证多选操作具有原子性。Delete inverse 保留被移除的子树和原同级 index；move inverse 保留原 parent 和 index。ID 和 timestamp 由调用方提供的平台无关 factory/clock 生成，而不是在 core 内部生成。

Core helper 暴露树遍历、descendant 查找、规范化多选和搜索匹配。搜索本身必须是纯函数且不能展开节点；Web controller 通过 Command/UI state 执行结果选择、ancestor 展开和 viewport 居中。

### `@opentools/mindmap-layout`

将只支持固定宽度的输入替换为 layout request，并接收 renderer/platform 层提供的 `nodeSizes`。Package 为尚未测量的节点保留安全默认值。

```ts
interface NodeSize {
  width: number
  height: number
}

interface MindMapLayoutRequest {
  document: MindMapDocument
  nodeSizes?: ReadonlyMap<MindMapNodeId, NodeSize>
  config?: MindMapLayoutConfig
}

function layoutMindMap(request: MindMapLayoutRequest): MindMapLayoutResult
```

结果增加完整 content bounds，并保留稳定的节点 ID、节点矩形和 edge endpoint。折叠节点的 descendant 不出现在可视结果中，但不会从 document 删除。无效树输入应抛出 typed validation error，而不是无限递归。

### `@opentools/mindmap-format`

- 导出 `parseMindMapDocument(input): MindMapDocument`，用于检测 v1/v2、迁移支持的旧数据并验证全部 invariant。
- 只在验证通过后导出 `serializeMindMapDocument(document)`，避免应用导出内部已损坏的树。
- 导出对用户安全的 `FormatError` shape，包含稳定 code 和适合导入错误 UI 的 message。
- Migration 函数必须可独立测试，不允许 Dexie 或浏览器 `File` 类型泄漏到此 package。

### `@opentools/mindmap-storage`

- 保留 `get`、`list`、`save` 和 `delete` 作为最小 repository 契约。
- 明确 list 按 `updatedAt` 降序排列，并返回 document 的防御性副本，避免 UI mutation 静默修改 cache state。
- 为单元测试增加 memory repository，并为 quota、IndexedDB 不可用和 transaction failure 定义明确的 repository error type。
- `duplicate` 由 Web 层通过 `get`、新 document ID 和 save 组合完成；它不属于 storage adapter。

### `@opentools/mindmap-renderer-svg`

- 保持 connector path 生成为纯函数。
- 增加可序列化的 SVG scene builder，消费 layout output 和 document presentation data，生成 node/edge primitives，并计算带 padding 的 export bounds。
- 不要在此 package 中添加 React component 代码或 Canvas 调用。

### Web 接口

- `EditorSession` 管理 `document`、`history`、revision number 和所有 Command 分发。
- Zustand store 只管理 UI state：选中节点 ID、正在编辑的节点 ID、viewport、drag intent、搜索 query/result index、打开的 panel/dialog 和保存状态。
- `AutosaveController` 接收 repository、document revision 和 debounce duration；它暴露最新 revision 的保存状态，以及在关闭、导入替换和显式导航前使用的 `flush` 方法。
- Browser adapter 隔离 `crypto.randomUUID`、pointer coordinate conversion、clipboard 读写、file picker/download、文本测量、SVG 序列化和 SVG-to-PNG 转换。

## Web UI 计划

### 应用界面

1. **导图库**：按最后更新时间列出已保存导图；支持创建、打开、重命名、复制、删除和导入 JSON。首次运行时，仅当 repository 为空才创建一张可编辑的 starter map。
2. **编辑器 header**：可编辑导图标题、明确的保存状态、undo/redo 和返回导图库控件。
3. **Canvas**：可聚焦的 SVG scene，并使用 HTML text-editor overlay 编辑节点文本；支持平移、缩放、适应画布、居中选择和 drag/drop 反馈。只有 500 节点导航确有需要时才增加紧凑 minimap。
4. **Toolbar**：节点创建、缩放/导航、折叠/展开、样式和导出操作。键盘仍是创建和编辑的最高效路径。
5. **Inspector**：选中节点文本、style preset、颜色、marker 控件、notes 和 links。空选择和多选状态应明确改变可用操作。
6. **搜索 panel**：query input、匹配数量和上一项/下一项控件；导航通过 Command 展开 ancestor，然后居中结果。
7. **Dialog**：破坏性删除确认、导入冲突选择、无效导入错误，以及 link/notes 编辑。首轮可以使用浏览器原生确认；自定义 dialog 必须正确恢复焦点。

### 交互细节

- 激活 Canvas 节点会选中该节点；`Enter` 启动创建同级节点的 Command，`Tab` 启动创建子节点的 Command。新建节点应立即打开 HTML overlay editor。
- 当 text input/textarea 或 IME composition 处于活动状态时，keyboard handler 忽略全局编辑 Command，明确的提交/取消处理除外。
- Pointer event 使用 pointer capture。在 hit testing 或 drop target 计算前，通过 viewport matrix 转换事件坐标。
- 拖动过程中只生成预览 UI state，直到 drop。有效 drop 转换为一个 move Command；指向自身/descendant 的无效 target 不改变 document。
- 文本选择 input 不嵌入导出的 SVG。已提交字符串由 SVG scene 渲染；临时 editor 保持为 absolute HTML overlay。
- 外部链接的 `window.open` 使用 `noopener,noreferrer`，且只在用户明确点击后运行。

## 实施步骤

### 1. 建立 fixture、契约和测试脚手架

- 添加有文档说明的 document fixture：仅 root、深树、宽树、折叠树、带样式导图、无效导入和 500 节点导图。
- 围绕当前 v1 document 添加针对性测试，在修改类型前锁定迁移路径。
- 只有确定性 Dexie 测试需要时才添加 `fake-indexeddb`，只有浏览器验收测试需要时才添加 `@playwright/test`；同时增加对应 script 和报告忽略规则。
- 本步骤不修改应用行为。

**覆盖：** AC-01 至 AC-15 的测试基础。

### 2. 强化平台无关的 document model 和 Command 系统

- 将 `mindmap-core` 拆分为 model、validation、traversal、Command 和 history 模块，同时保持简洁的公开 barrel。
- 为导图重命名、节点创建/编辑/删除、移动/重排、子树 copy/paste、style、marker、notes、links 和 collapse state 实现不可变 Command。
- 为 undo/redo 实现原子 batch execution 和 inverse Command。
- 在 Command 执行前后实施验证；向 Web 层暴露 typed Command error，且不能部分修改当前 document。
- 为每个 Command、redo 清空、root 保护、子树恢复、无效移动、多选规范化和 500 节点 Command 序列添加单元测试。

**覆盖：** AC-02、AC-03、AC-04、AC-05、AC-07、AC-08、AC-14。

### 3. 升级格式、迁移和存储边界

- 定义 v2 JSON schema，以及带结构验证的 v1-to-v2 migration。
- 为有效 round trip 和规格中列出的所有 malformed case 添加导入/导出测试。
- 让 storage 返回副本并定义错误转换；使用内存 adapter 和兼容 IndexedDB 的测试环境验证 `get`、有序 `list`、`save` 和 `delete`。
- 添加 revision-aware autosave controller 设计，并针对 debounce、保存失败、进行中保存期间到达的新写入和强制 flush 编写单元测试。

**覆盖：** AC-01、AC-10、AC-11、AC-12、AC-15。

### 4. 构建导图库和 editor session shell

- 使用 repository hydration 和导图库界面替换固定 `mapId` 启动方式。
- 通过组合 Core Command 和 repository 的 application service 创建、打开、重命名、复制和删除导图。
- 只有 repository 中不存在有效导图时才创建 starter document。
- 引入 editor session、UI store 和 autosave 集成；暴露准确的 loading、saving、saved 和 failure 状态。
- 保持现有视觉风格，同时把导图库、editor shell 和可复用控件拆分为组件。

**覆盖：** AC-01、AC-10、AC-15。

### 5. 交付核心键盘编辑器和 undo/redo

- 通过由 Command 支持的 editor state 渲染 document，而不是本地 `useState` mutation。
- 添加选择、可编辑文本 overlay、同级/子级创建、删除、root guard、copy/cut/paste/duplicate 和基础多选。
- 接入平台感知的 undo、redo、copy、cut、paste 和全选快捷键；处理 IME composition 和可编辑字段退出条件。
- 提供可见的键盘焦点、选择和编辑状态；为 50 节点键盘输入路径添加单元测试和端到端测试。

**覆盖：** AC-02、AC-03、AC-05、AC-14。

### 6. 完成 layout、viewport 和选择导航

- 将已测量且感知文本的节点尺寸传入 layout request，并计算完整 content bounds。
- 在 viewport controller 中实现平移、有边界的缩放、缩放百分比、适应内容和居中选中项。
- 在 canvas 和 inspector 中添加折叠/展开，并通过存储和导出保留状态。
- 使用可变节点尺寸和折叠分支测试 layout；将 viewport 数学计算与 pointer event 分开测试。

**覆盖：** AC-06、AC-07、AC-13、AC-14。

### 7. 实现 drag/drop、样式和节点 metadata

- 添加由 pointer 驱动的 drag/drop，并提供明确的 before/after/child 指示和无效 target 反馈。
- 将完成的 drop 转换为单个 move/reorder Command；阻止 cycle 和 no-op move。
- 添加小型固定 theme/style preset palette，并提供直接颜色选择、markers、priority、status、notes 和 links。
- 当 parent/child 选择重叠时，batch style update 必须有可预测行为；破坏性多选始终规范化为顶层选中的 root。

**覆盖：** AC-04、AC-08。

### 8. 添加搜索、导入和导出

- 在 core 中实现纯文本匹配 collection，在 Web 中实现搜索 UI；搜索导航展开 ancestor 分支、选中匹配项并将其居中。
- 添加带 parse/migration/error 反馈的 JSON 文件导入。默认导入为新导图；当用户选择替换当前导图或发生 ID 冲突时，必须明确确认，并先 flush 当前 autosave。
- 使用经过验证的 serializer 添加 JSON 下载。
- 根据完整 layout scene 构建 SVG output，而不是根据当前 viewport。通过带尺寸 guard 和明确失败反馈的浏览器 adapter 将序列化 SVG 转换为 PNG。
- 为完整导图 SVG/PNG 导出和导入失败安全性添加浏览器测试。

**覆盖：** AC-09、AC-11、AC-12、AC-13。

### 9. 强化规模、可访问性和失败处理

- 使用 500 节点 fixture 验证打开、平移/缩放、折叠、搜索和 autosave；避免因仅 UI 变化重复执行完整 layout。
- 使用稳定 key 和 memoized scene/layout 派生结果；引入 virtualization 或 Canvas renderer 前先进行 profile。
- 验证焦点顺序、按钮名称、节点选择语义、纯键盘编辑和状态 announcement。
- 测试 IndexedDB 不可用、类似 quota 的写入失败、clipboard 拒绝、取消 file picker 和 malformed browser file data。

**覆盖：** AC-03、AC-06、AC-10、AC-12、AC-14。

### 10. 在 P0 验收通过后评估 MVP 增强项

- 只有验证 Command、format 和 export 支持后，才添加 document-level relationship record 和 SVG path。
- 添加包含 Command 和 layout-aware bounds 的 boundary 与 summary collection。
- 将 tidy-layout 作为保留 hierarchy 且报告作用范围的明确 Command。
- 这些条目在任务清单中保持可独立启停，避免其延期阻塞必需的 MVP 发布。

## 风险与缓解措施

| 风险                                           | 影响                                     | 缓解措施                                                                                                            |
| ---------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 本次指定的编辑器范围较大。                     | Enhancement 可能延迟 core 发布。         | 按纵向切片实现和验收 P0；关系线、边界、概要和整理功能置于独立 enhancement gate 后。                                 |
| Undo/redo 丢失 hierarchy 或 style 数据。       | 造成数据丢失和不可靠的编辑器行为。       | Command 返回明确 inverse；使用 immutable fixture，并对每个 Command 及混合 Command 序列进行单元测试。                |
| 防抖保存发生竞争或报告过期成功状态。           | 新编辑可能被覆盖，或被错误显示为已保存。 | 跟踪单调递增 revision、串行写入，在进行中写入完成后保存最新 snapshot，并只为最新已保存 revision 显示成功。          |
| 现有 v1 本地数据无法读取。                     | 用户丢失初始化或早期导图。               | 保留 v1 migration fixture，验证迁移后的 document，保留 identifier，并报告损坏数据而不删除。                         |
| SVG 文本测量/导出和屏幕编辑器不同。            | 节点重叠，或图片导出与编辑器不一致。     | 使用共享 scene model 和外部提供的节点测量尺寸；测试中英文长文本、换行和超大导图。                                   |
| 缩放/平移后 pointer 坐标失效。                 | 节点选择或拖放 target 错误。             | 集中管理 viewport-to-canvas transform，并在多种 scale 下对坐标转换进行单元测试。                                    |
| 500 节点导图触发缓慢 rerender。                | 无法达到质量目标。                       | 按 document revision memoize layout 和 scene；让 viewport/UI state 不参与 document 计算，并在升级架构前先 profile。 |
| IME 和浏览器快捷键与编辑器快捷键冲突。         | 中文输入可能意外创建或删除节点。         | Composition 和文本编辑焦点期间禁用全局 Command；在 Chrome 和 Edge 中人工覆盖 keyboard/IME 边界情况。                |
| 超大导图或浏览器 API 不可用导致 PNG 转换失败。 | 导出功能静默失败。                       | 设置有文档说明的输出尺寸限制，提供 SVG fallback，并显示可恢复的导出错误。                                           |
| IndexedDB 或 clipboard 不可用。                | 持久化或 copy/paste 可能失败。           | 使用 typed adapter error 和可见的非破坏性反馈；浏览器能力允许时提供仅本地 fallback path。                           |

## 验证命令

在相关实施步骤后运行以下命令，并将结果记录到 `specs/web-mind-map-mvp/verify.md`：

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

添加浏览器测试工具后：

```powershell
npm.cmd run test:e2e
```

开发期间的针对性检查：

```powershell
npm.cmd test -- packages/mindmap-core
npm.cmd test -- packages/mindmap-format
npm.cmd test -- packages/mindmap-layout
npm.cmd run dev
```

使用最新稳定桌面版 Chrome 和 Edge 进行人工验收：

1. 创建、重命名、复制、删除并重新打开两张彼此独立的导图。
2. 使用 `Enter` 和 `Tab` 创建 50 个主题，通过中文 IME 编辑，然后依次 undo 和 redo。
3. 移动一个子树，尝试无效的 descendant drop，并确认 document 数据仍然有效。
4. 编辑后刷新，模拟保存失败，然后验证状态和恢复行为。
5. 搜索折叠分支，并确认 ancestor 展开且结果居中。
6. 导入有效、损坏和 v1 JSON；验证错误处理安全，且 v2 round trip 等价。
7. 为大于 viewport 的导图导出 SVG 和 PNG；检查没有节点或 connector 被裁切。
8. 打开 500 节点 fixture，完成平移、缩放、搜索、折叠和 autosave，且不能崩溃。

## 必需的文档更新

- 更新 `README.md`，写明当前产品范围、开发命令、支持的浏览器和新增测试命令。
- 新 Web/package 模块完成后更新 `docs/PROJECT_STRUCTURE.md`；记录 editor session 和 platform adapter 边界。
- 创建 `docs/USER_GUIDE.md`，说明导图生命周期、键盘快捷键、drag/drop、搜索、备份/导入/导出和浏览器存储限制。
- 创建 `docs/FILE_FORMAT.md`，说明 JSON v2、迁移保证、用户备份指引和明确不支持的格式。
- 实现后创建/更新 `CODE_MAP.md`，只记录实际 component、service 和 package ownership。
- 只在验证后创建/更新 `PROJECT_PROGRESS.md`；必需验收标准通过或用户接受已记录风险之前，不能把功能标记为完成。
- 在下一工作流阶段创建 `specs/web-mind-map-mvp/tasks.md`，实现/验证后创建 `specs/web-mind-map-mvp/verify.md`。
- 添加测试和导出工具后重新检查 `.gitignore`；继续忽略生成报告、cache 和本地 artifact，但不能隐藏 source、spec、doc 或 lockfile。

## 决策与确认

准备任务拆分不需要阻塞性确认。本计划记录已批准 MVP 规格中的以下默认决策：

- 必需发布目标是简体中文桌面 Web；移动 Web/PWA 和小程序 UI 不属于本次实现。
- 必须提供带 v1 migration 的 JSON schema v2，因为初始化应用已在本地存储 v1 document。
- JSON 导入默认创建新导图；替换已打开导图或解决 ID 冲突始终需要明确确认。
- 内置 marker palette 和 style preset 在 MVP 内保持固定；不引入自定义 icon 上传、rich text editor 或 template market。
- 关系线、边界、概要和 tidy layout 继续作为非阻塞 enhancement，不能延迟 P0 验收。

由于这是重大功能变更，创建任务清单后，工作流在代码实现前仍应等待用户明确的继续执行命令。
