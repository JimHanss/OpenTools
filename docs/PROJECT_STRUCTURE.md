# Project structure

This is the durable directory and dependency guide for the OpenTools web MVP.
The source of truth for map data is always the platform-neutral document in
`mindmap-core`; browser components only dispatch commands and display derived
layout/scene data.

## Directory map

```text
OpenTools/
├─ apps/
│  └─ web/
│     ├─ e2e/                     Playwright acceptance coverage
│     └─ src/
│        ├─ app/                  Library/editor route composition and app hook
│        ├─ components/           Editor shell, SVG canvas, topic inspector, library UI
│        ├─ editor/               Session/history, autosave, viewport, keyboard, UI store
│        ├─ library/              Repository-backed map lifecycle service
│        ├─ platform/             Browser clipboard, IDs, file transfer, external-link adapters
│        ├─ App.tsx               Top-level application composition
│        └─ styles.css            Web styles and interaction states
├─ packages/
│  ├─ mindmap-core/               Domain model, validation, commands, history, search, tidy preview
│  ├─ mindmap-format/             JSON v1/v2 schemas, migration and format errors
│  ├─ mindmap-layout/             Pure left-to-right tree layout and bounds
│  ├─ mindmap-renderer-svg/       Pure scene primitives, connector paths and SVG serializer
│  └─ mindmap-storage/            Repository contract, memory and Dexie/IndexedDB adapters
├─ docs/                          User and architecture documentation
├─ specs/web-mind-map-mvp/        Requirements, plan, tasks and verification record
├─ CODE_MAP.md                    Code ownership and important exports
├─ PROJECT_PROGRESS.md            Current delivery status and known risks
├─ playwright.config.ts           Chromium acceptance-test configuration
└─ package.json                   npm workspaces and repository scripts
```

Generated dependency, build, test-report and browser-automation files are
ignored by Git. Source, tests, specs, lockfiles, and documentation are not.

## Dependency direction

```text
apps/web
  ├─ mindmap-core
  ├─ mindmap-layout ────────> mindmap-core
  ├─ mindmap-renderer-svg ─> mindmap-core + mindmap-layout
  ├─ mindmap-storage ──────> mindmap-core
  └─ mindmap-format ───────> mindmap-core
```

Rules:

1. `mindmap-core` must not import React, DOM, IndexedDB, SVG, Canvas, or
   mini-program APIs.
2. `mindmap-layout` consumes the document and returns node positions, edge
   geometry, and complete bounds without measuring the DOM.
3. `mindmap-renderer-svg` turns a validated document plus layout into SVG
   primitives; it never owns editable state.
4. Storage and browser capabilities are adapters behind small interfaces.
5. Any document edit must be a reversible command so history and future sync
   layers use one change model.
6. Internal JSON carries `schemaVersion`; parsing, serialization, and
   migration stay in `mindmap-format`.

## Implemented command groups

`mindmap-core` contains reversible commands for title and topic text, node
creation/move/delete/paste, style, markers, notes, links, collapse state,
relationships, boundaries, summaries, and explicit tidy-order updates. The
editor session owns the command history and autosave revision; Zustand contains
only transient UI state such as selection, viewport, drag preview, and search.

## Future platform expansion

The intended order is desktop web, responsive/PWA web, mini program, then a
native or hybrid client only if PWA and mini-program integrations cannot meet a
real requirement. A mini-program app should reuse `mindmap-core`,
`mindmap-layout`, and `mindmap-format`, then add platform-specific renderer,
storage, clipboard, and file-share adapters. Do not move browser APIs into the
reusable packages merely to avoid a small adapter.

## Repository commands

| Command                | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `npm run dev`          | Start the Vite web development server.           |
| `npm run build`        | Type-check all workspaces and build the web app. |
| `npm run typecheck`    | Run TypeScript project references.               |
| `npm run lint`         | Lint application and package source.             |
| `npm test`             | Run Vitest unit/integration tests once.          |
| `npm run test:e2e`     | Run Chromium Playwright acceptance tests.        |
| `npm run format:check` | Check Prettier formatting.                       |
