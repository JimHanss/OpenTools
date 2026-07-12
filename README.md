# OpenTools Mind Map

OpenTools is a local-first mind map editor. The first release targets the web while keeping the domain model, command system, layout, storage, and rendering boundaries reusable for mini-program and mobile clients.

## Development

Requirements: Node.js 22.12 or newer and npm 10 or newer.

```powershell
npm.cmd install
npm.cmd run dev
```

Common checks:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for the directory map, dependency rules, and future platform extension points.
