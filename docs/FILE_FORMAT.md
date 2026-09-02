# 思维导图文件格式

OpenTools 当前可编辑领域格式为 schema v3。导入层接受 v1、v2 和 v3，内存中的 document 与再次导出结果始终规范化为 v3。本文描述内部 JSON、图片资源 bundle、迁移与安全失败规则。

## 纯 document JSON

不包含图片引用的导图导出为普通 JSON，顶层结构如下：

```json
{
  "schemaVersion": 3,
  "id": "map-example",
  "title": "产品计划",
  "rootNodeId": "root",
  "nodes": {},
  "floatingTopics": {},
  "defaultStructure": "logic-right",
  "structureOverrides": {},
  "labels": {},
  "assets": {},
  "theme": {},
  "relationships": [],
  "boundaries": [],
  "summaries": [],
  "callouts": [],
  "createdAt": "2026-07-15T00:00:00.000Z",
  "updatedAt": "2026-07-15T00:00:00.000Z"
}
```

解析使用 strict schema。缺字段、字段类型错误、未知未来 `schemaVersion`、损坏的引用或非法几何数据会明确失败，不会静默删除内容后继续保存。

## 森林模型

一张导图由一个主树和零个或多个 Floating Topic 子树组成：

- `rootNodeId` 指向主 root。
- `floatingTopics` 的 key 是额外 root node ID，value 为内容坐标 `{ x, y, structure? }`。
- 主 root 和 Floating Topic root 的 `parentId` 都必须是 `null`。
- 其他节点必须有且只有一个 parent，并且在 parent 的 `childIds` 中恰好出现一次。
- 每个节点必须从主 root 或某个已登记 Floating Topic root 恰好可达一次。
- cycle、重复 child、多 parent、未登记的 detached root 和跨 root 重复所有权均为非法。

Floating Topic 的 `x/y` 是内容空间坐标，不是屏幕像素；viewport 平移缩放不会改写它。其 `structure` 可覆盖该自由子树的布局。

## 结构字段

支持的 `MindMapStructure`：

- `logic-right`
- `logic-left`
- `mind-map-balanced`
- `tree-top`
- `org-top`

`defaultStructure` 控制整图默认布局；`structureOverrides[nodeId]` 只覆盖对应分支。结构切换只影响派生 layout，不应改写父子关系、顺序、内容或样式。

## Node

```json
{
  "id": "topic-1",
  "parentId": "root",
  "childIds": [],
  "text": "用户研究",
  "collapsed": false,
  "markers": [{ "kind": "priority", "value": "1" }],
  "notes": "访谈五位用户",
  "links": [{ "label": "研究计划", "url": "https://example.com" }],
  "labelIds": ["label-research"],
  "labelSortMode": "manual",
  "numbering": { "style": "decimal", "mode": "siblings", "startAt": 1 },
  "contentBlocks": [],
  "styleOverrides": { "shape": "pill", "fixedWidth": 240 },
  "style": {}
}
```

- `styleOverrides` 只保存用户明确覆盖的属性；未覆盖值继续跟随 theme。
- `style` 是为 v1/v2/v3 兼容保留的 materialized fallback，不应作为新编辑的优先写入目标。
- `fixedWidth` 允许范围 80–800；未设置时根据测量内容自适应。
- node 原始 `text` 不包含显示编号；编号由 `numbering` 与 sibling 顺序派生。

## Labels、编号与增强对象

- `labels` 是 map 级 catalog，node 通过 `labelIds` 引用；label 名称最长 64 个字符。
- `numbering.style` 支持 `decimal`、`alpha`、`roman`，`mode` 支持 `siblings` 与 `hierarchical`。
- `relationships` 引用起止 node，可保存 label、线型、端点和 control points。
- `boundaries` 与 `summaries` 保存目标 node ID 列表及各自样式。
- `callouts` 通过 `ownerNodeId` 关联主题，保存文本、方向、offset 和样式，但不进入主题 hierarchy。

删除、复制或跨 parent 移动 subtree 时，Command 必须维护这些引用；导入验证不允许指向不存在的 node。

## 内容块

Node 的 `contentBlocks` 当前支持图片和公式。

图片块：

```json
{
  "id": "block-image-1",
  "type": "image",
  "assetId": "asset-<sha256-hex>",
  "width": 320,
  "height": 180,
  "altText": "架构草图",
  "preserveAspectRatio": true
}
```

公式块：

```json
{
  "id": "block-equation-1",
  "type": "equation",
  "source": "x^2 + y^2 = z^2",
  "displayMode": "block",
  "width": 240,
  "height": 64
}
```

LaTeX `source` 最长 10000 字符；领域层接受的显式尺寸最大 4096，Web `EquationRenderer` 默认把渲染结果约束在 1600×800 内。公式 SVG 是可重建缓存，不进入 document。

## Asset manifest

图片二进制不直接写入普通 document。`assets` 保存 metadata：

```json
{
  "asset-<sha256-hex>": {
    "id": "asset-<sha256-hex>",
    "kind": "image",
    "mimeType": "image/png",
    "byteSize": 1024,
    "checksum": "sha256:<64位十六进制>",
    "intrinsicWidth": 800,
    "intrinsicHeight": 600,
    "createdAt": "2026-07-15T00:00:00.000Z"
  }
}
```

支持 PNG、JPEG、WebP、GIF 与经过安全检查的 SVG。asset ID 必须由 checksum 确定，metadata、Blob 大小与 checksum 必须一致。单个资源上限 5 MiB，单张导图资源总量上限 25 MiB。

## 带资源的 bundle

存在被引用图片时，JSON 导出使用 bundle 包装：

```json
{
  "kind": "opentools-mindmap-bundle",
  "bundleVersion": 1,
  "document": { "schemaVersion": 3 },
  "assets": [
    {
      "id": "asset-<sha256-hex>",
      "mimeType": "image/png",
      "byteSize": 1024,
      "checksum": "sha256:<64位十六进制>",
      "intrinsicWidth": 800,
      "intrinsicHeight": 600,
      "createdAt": "2026-07-15T00:00:00.000Z",
      "data": "<Base64>"
    }
  ]
}
```

导出前要求每个被引用 asset 都存在；导入时逐个校验 Base64、MIME、大小、manifest、SHA-256 和总配额。缺失、重复、篡改或超限都整包失败，不进行部分导入。

## v1/v2 迁移

`parseMindMapDocument` 根据 `schemaVersion` 执行逐级迁移：

- v1 先补齐 v2 的基础领域字段，再进入 v3。
- v2 保留原 hierarchy、文字、折叠、Marker、备注、链接、关系线、边界、概要和 legacy style。
- v3 默认补齐空 `floatingTopics`、`structureOverrides`、`labels`、`assets`、`callouts`、node 内容块、style overrides、默认 structure 与 theme。
- 迁移后执行完整 strict schema 与 core 不变量校验。

迁移不写回原文件。用户导入后，导图库会把结果作为新的本地副本保存，并重映射必要 ID，避免意外覆盖同 ID 导图。

## 安全失败与恢复

- `schemaVersion > 3`：拒绝导入，提示当前版本不支持未来格式。
- JSON 语法、strict schema 或引用错误：拒绝整份文件，现有导图保持不变。
- bundle checksum、资源配额或 transaction 错误：不提交 document/Blob 的部分状态。
- 保存失败：当前内存 document 与 undo/redo history 保留，用户可修复存储问题后继续或导出备份。
- PNG 超过 16384 边长或 1600 万像素：不尝试危险 Canvas 分配，提示原因并回退 SVG。
- SVG/PNG 导出基于完整 document/layout，不受当前 viewport、focus 或 filter 裁剪。

## 备份建议

本地 IndexedDB 不是云备份。重要导图应定期执行“导出 JSON”；含图片时保留完整 bundle 文件。恢复时使用“导入 JSON”，应用会创建独立副本。SVG/PNG 适合分享，不包含足以恢复全部可编辑状态的数据，不能代替 JSON 备份。
