# OpenTools Project Context

## Product Goal

Build a cross-platform mind mapping system that can run on the web, later extend to mini programs, and eventually be installable on phones.

The first MVP should be web-only. The product focus is a complete mind-map module, with the basic mind-mapping capabilities of Xmind as the functional reference. Do not broaden the first version into unrelated diagram types, collaboration, AI features, or a general productivity suite unless the user explicitly changes scope.

## MVP Scope

Prioritize a polished single-user web mind-map editor:

- Map create, open, rename, duplicate, delete, and autosave.
- Node create, edit, delete, copy, paste, duplicate, reorder, and move between parents.
- Keyboard-first editing: Enter for sibling, Tab for child, Delete/Backspace for removal, undo/redo, copy/paste, and basic multi-select.
- Mouse and touch basics: select, drag node/subtree, pan canvas, zoom in/out, fit to screen, center selected node.
- Tree layout: start with one robust left-to-right layout; keep the layout engine separate so other layouts can be added later.
- Node presentation: topic text, rich-enough styling, colors, icons/markers, priority/status markers, notes, links, and collapse/expand.
- Structure helpers: relationship lines, boundaries, summary/grouping, search, and tidy layout when feasible for the MVP.
- Import/export: use an internal editable JSON format first; support PNG/SVG export early; treat Xmind/OPML import/export as later compatibility work unless requested.

## Architecture Direction

Keep the core mind-map logic platform-neutral:

- Domain model: store maps and nodes as plain structured data, independent of DOM or browser-only APIs.
- Command system: implement edit operations as commands such as AddNode, DeleteNode, MoveNode, UpdateText, UpdateStyle, and CollapseNode. Commands should support undo/redo and later history sync.
- Layout engine: input is the tree/domain model; output is node positions, bounds, and connector paths.
- Rendering adapters: web MVP can use HTML/SVG/Canvas as appropriate, but rendering must not own the source of truth.
- Storage adapters: define load/save/list/delete/export boundaries so local-first browser storage can later move to cloud, mini program storage, or native storage.
- Platform adapters: isolate keyboard, pointer/touch, clipboard, file download/upload, text measurement, and share/install APIs.

## Platform Strategy

Build in this order unless the user changes priority:

1. Desktop web MVP with local-first persistence.
2. Responsive/mobile web and PWA install support.
3. Mini program version by reusing the domain model, commands, layout, and storage contracts.
4. Native or hybrid mobile app only if PWA/mini program cannot satisfy required device integration.

For mini program compatibility, avoid assuming direct DOM access inside core logic. Treat webview embedding as a possible shortcut, but keep the long-term path open for a native canvas-based mini program renderer.

## Deferred Scope

Do not include these in the first MVP unless explicitly requested:

- Real-time collaboration, comments, or team workspaces.
- AI generation, AI summarization, or prompt-based map creation.
- Full Xmind file compatibility.
- Multiple complex layout families.
- Whiteboard or generic flowchart editing.
- Role-based permissions, billing, or enterprise administration.
- Desktop native app packaging.

## Quality Bar

The MVP should feel like a real editor, not a static demo:

- 50-node maps should be fast to create with keyboard shortcuts.
- 500-node maps should remain usable for pan, zoom, search, collapse, and autosave.
- Undo/redo must be reliable across core edit operations.
- Autosave must avoid data loss after refresh or browser crash when possible.
- Exported image output should match the visible map closely enough for sharing.
- Internal JSON export/import should round-trip without losing editable structure.

Use this context as the default product target for future development in this repository.
