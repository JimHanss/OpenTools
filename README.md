# OpenTools Mind Map

OpenTools is a local-first, single-user web mind-map editor. It provides a
keyboard-first tree editor, map library, autosave, search, drag and drop,
style/metadata controls, JSON import/export, complete-map SVG/PNG export, and
the optional relationship, boundary, summary, and tidy-order tools.

The web app is the MVP. Its document model, commands, layout, SVG scene, and
storage contracts are platform-neutral so a mini-program or mobile renderer can
reuse them later.

## Quick start

Requirements: Node.js 22.12 or newer and npm 10 or newer.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the Vite URL printed by the command in a current desktop Chrome or Edge.
The MVP also has best-effort Firefox and Safari compatibility.

## Checks

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

## Documentation

- [User guide](docs/USER_GUIDE.md): editing, shortcuts, backup, import, and export.
- [File format](docs/FILE_FORMAT.md): OpenTools JSON v2 and migration rules.
- [Project structure](docs/PROJECT_STRUCTURE.md): package boundaries and dependency direction.
- [Code map](CODE_MAP.md): main modules, exported capabilities, and ownership.
