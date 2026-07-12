# Project structure

This document is the long-lived directory and dependency guide for the OpenTools mind map editor. Update it whenever a top-level application or package is added, removed, or changes responsibility.

## Directory map

```text
OpenTools/
├─ apps/
│  └─ web/                         React + Vite web application
│     └─ src/
│        ├─ editor/                Web-only editor UI state and interactions
│        ├─ App.tsx                Application shell and SVG scene composition
│        ├─ main.tsx               Browser entry point
│        └─ styles.css             Application styles and design tokens
├─ packages/
│  ├─ mindmap-core/                Platform-neutral document model and commands
│  ├─ mindmap-layout/              Platform-neutral tree layout calculations
│  ├─ mindmap-renderer-svg/        SVG path and rendering helpers for the web
│  ├─ mindmap-storage/             Storage contract and IndexedDB adapter
│  └─ mindmap-format/              JSON schema, validation, and migrations
├─ docs/
│  └─ PROJECT_STRUCTURE.md         This directory and architecture reference
├─ AGENTS.md                       Durable product scope and quality constraints
├─ package.json                    npm workspaces and repository scripts
├─ tsconfig.base.json              Shared TypeScript compiler rules
├─ tsconfig.json                   TypeScript project references
└─ vitest.config.ts                Repository test configuration
```

Generated directories such as `node_modules`, `dist`, `coverage`, and browser test reports are intentionally ignored by Git.

## Dependency direction

```text
apps/web
  ├─> mindmap-core
  ├─> mindmap-layout ──> mindmap-core
  ├─> mindmap-renderer-svg ──> mindmap-layout
  ├─> mindmap-storage ──> mindmap-core
  └─> mindmap-format ──> mindmap-core
```

Rules:

1. `mindmap-core` must not import React, DOM, IndexedDB, SVG, Canvas, or mini-program APIs.
2. `mindmap-layout` must accept structured data and return positions and connectors without reading the DOM.
3. Rendering packages consume layout results but never become the source of truth.
4. Storage and platform APIs are accessed through replaceable interfaces.
5. User-visible edits will be introduced as commands so undo/redo and future synchronization share one change model.
6. Internal JSON always carries a `schemaVersion`; migrations belong in `mindmap-format`.

## Future platform expansion

The planned sequence is desktop web, responsive/PWA web, mini program, then native or hybrid mobile only if required.

A mini-program client should reuse `mindmap-core`, `mindmap-layout`, and `mindmap-format`, then provide platform-specific packages such as:

```text
apps/mini-program/
packages/mindmap-renderer-mini/
packages/mindmap-storage-mini/
packages/platform-mini/
```

Do not move browser-only code into the reusable packages merely to avoid a small adapter.

## Repository commands

| Command              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Start the Vite development server               |
| `npm run build`      | Type-check all workspaces and build the web app |
| `npm run typecheck`  | Run TypeScript project references               |
| `npm run lint`       | Lint application and package source             |
| `npm test`           | Run Vitest tests once                           |
| `npm run test:watch` | Run Vitest in watch mode                        |
| `npm run format`     | Format repository files with Prettier           |
