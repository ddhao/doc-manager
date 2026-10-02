# Repository Guidelines

## Project Structure & Module Organization

`doc-manager` is an Electron + React + Vite + TypeScript desktop app (Ant Design 5, Zustand 5, better-sqlite3) for official document workflows.

- `src/` — renderer (React). Pages live in `src/pages/<domain>/XxxPage.tsx`, shared UI in `src/components/`, state in `src/stores/`, DB facade in `src/db/index.ts`, routes in `src/router.tsx`.
- `electron/` — main process: `main.ts`, `preload.ts` (`contextBridge`), and `ipc/db.ts` (SQLite handlers).
- `public/` — static assets (TinyMCE skins, `icon.png`); `dist/`, `dist-electron/`, `release/` are build outputs.

## Build, Test, and Development Commands

- `npm install` — installs deps; `postinstall` rebuilds native modules for Electron.
- `npm run dev` — Vite dev server with HMR and Electron.
- `npm run build` — TypeScript type check (`tsc`) followed by the Vite production build.
- `npm run electron:build` — full build plus electron-builder packaging (DMG/NSIS) into `release/`.

There is no test suite or linter. Validate changes with `npm run build` and a manual smoke test of the affected page.

## Coding Style & Naming Conventions

- Two-space indentation, single quotes, semicolons, trailing commas. Keep TypeScript `strict`.
- Components/pages/interfaces use `PascalCase` (`IncomingPage.tsx`, `IncomingDoc`); variables and functions use `camelCase`.
- Import via the `@/*` alias (maps to `src/*`), e.g. `import { db } from '@/db'`.
- Persist DB columns in `snake_case`; user-facing labels stay in Chinese.
- Follow the existing inline-style pattern; there are no CSS modules.

## Commit & Pull Request Guidelines

Use Conventional Commits with concise Chinese descriptions, e.g. `fix: 修复收文编辑后仪表盘不更新` or `feat: 定期任务提醒弹窗`.

Pull requests should summarize the change, list manual verification steps, link related issues, and include screenshots for UI changes. The `Build & Release` workflow (`.github/workflows/build.yml`) packages macOS/Windows artifacts on `v*` tags and manual dispatch.

## Architecture & Data Access

Renderer calls flow: component → Zustand store → `db.all/get/run` (`src/db/index.ts`) → `window.electronAPI.db.*` → `ipcMain` → better-sqlite3. Never call `ipcRenderer` directly from components.

The SQLite file lives at `app.getPath('userData')/doc-manager.db` (WAL, foreign keys on); the `config` table stores key-value settings and base64 templates. Do not commit `*.db`, `.env`, or files under `release/` (see `.gitignore`).
