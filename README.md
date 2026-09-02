# OpenTools 思维导图

OpenTools 是一个本地优先、面向多平台扩展的思维导图编辑器。当前版本是 Web MVP V2，目标是在浏览器中提供一套可持续日常使用的单人思维导图编辑体验，并把领域模型、Command、布局、渲染和存储保持为平台无关模块，为后续小程序与移动端复用保留边界。

## 当前能力

- 导图库：创建、打开、重命名、复制、删除与自动保存。
- 键盘编辑：新建同级/子主题、编辑、删除、复制粘贴、撤销重做、同级重排与层级调整。
- 高级结构：插入父主题、仅删除当前主题并保留子主题、主树与 Floating Topic、分支聚焦与整理布局。
- 五种布局：`logic-right`、`logic-left`、`mind-map-balanced`、`tree-top`、`org-top`，并支持分支级 mixed structure。
- 语义与增强：Marker、labels、自动编号、Callout、关系线、边界、概要、备注与链接。
- 内容块：本地图片与 LaTeX 数学公式；公式由 MathJax 延迟渲染并缓存。
- 样式：主题形状、文字、边框、分支线、批量样式、复制/粘贴样式和四套内置 theme。
- 画布：多选、拖动子树、拖动 Floating Topic、平移、缩放、适应画布、居中选中与筛选。
- 文件：schema v1/v2 自动迁移到 v3；内部 JSON 或资源 bundle 导入导出；完整导出 SVG/PNG。
- 可靠性：统一 Command history、revision-aware autosave、资源事务、配额检查与可恢复错误。

## 技术栈

- React 19 + TypeScript 6 + Vite 8
- Zustand 状态管理
- SVG 场景渲染
- Dexie/IndexedDB 本地持久化
- Zod 文件格式校验
- MathJax 4 公式渲染
- Vitest、Playwright、oxlint、Prettier

运行环境要求 Node.js `>=22.12.0`。仓库使用 npm workspaces，提交中保留 `package-lock.json`，日常命令以 npm 为准。

## 本地启动

```bash
npm install
npm run dev
```

Vite 会输出本地访问地址。生产构建与预览：

```bash
npm run build
npm run preview
```

## 验证命令

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

首次运行 Playwright 时可以执行：

```bash
npm run test:e2e:install
```

跨浏览器人工验收配置位于 `playwright.browser-acceptance.config.ts`，覆盖本机 Chrome 与 Edge channel：

```bash
npx playwright test --config playwright.browser-acceptance.config.ts
```

## 浏览器与数据

- 主要支持当前稳定版 Chromium 浏览器；自动化门禁使用 Playwright Chromium，发布前验收使用本机 Chrome 与 Edge。
- 导图和图片资源保存在当前浏览器 profile 的 IndexedDB 中，不会自动上传服务器。
- 清理站点数据、隐私模式退出或浏览器存储回收都可能删除本地导图；重要内容应定期导出 JSON 备份。
- 单个图片资源上限 5 MiB，单张导图图片总量上限 25 MiB。
- PNG 导出最大边长 16384 像素、最大 1600 万像素；超过限制时会提示原因并回退导出 SVG。
- 单条 LaTeX 源文本上限 10000 字符；内容块尺寸硬上限为 4096，Web 渲染默认约束在 1600×800 内。

## 当前不支持

V2 不包含云同步、账号、多人协作、AI、完整 Xmind/OPML 文件兼容、通用白板、PWA 安装、小程序、原生移动端或桌面端打包。后续平台会复用 `mindmap-core`、Command、layout、format 和 storage contract，不会把浏览器 DOM 依赖带入核心领域层。

## 项目文档

- `docs/PROJECT_STRUCTURE.md`：目录、模块职责与依赖边界。
- `docs/FILE_FORMAT.md`：schema v3、迁移、资源 bundle 与安全限制。
- `docs/USER_GUIDE.md`：编辑工具栏、快捷键和完整使用说明。
- `CODE_MAP.md`：代码入口、公共 API、数据流与测试定位。
- `PROJECT_PROGRESS.md`：V2 验收标准完成状态与证据。
- `specs/web-mind-map-editor-v2/`：需求、技术计划、任务和验证记录。

## 架构原则

`MindMapDocument` 是唯一持久化事实来源。所有可持久化编辑通过 Command 进入统一 history；layout 只计算几何结果；renderer 只消费 layout 和可渲染资源；storage 通过 adapter 保存 document 与 Blob；Web 层负责键盘、指针、剪贴板、文件和浏览器能力适配。任何后续平台实现都应保持这条依赖方向。
