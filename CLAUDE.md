# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

办公室收文管理系统 — an Electron + React + Vite + TypeScript desktop app for managing official document workflows (incoming, outgoing, meetings) for a township government office. Uses Ant Design 5 for UI, Zustand 5 for state, and better-sqlite3 (embedded in Electron main process) as the local database.

## Commands

```bash
npm run dev             # Start Vite dev server with HMR (also launches Electron)
npm run build           # TypeScript check + Vite production build
npm run electron:build  # Full build + electron-builder package (DMG/NSIS)
```

There is no test suite or linter configured.

## Architecture

### Three-layer Electron architecture

```
Renderer (React)          Preload (contextBridge)       Main Process
┌──────────────────┐     ┌────────────────────┐     ┌──────────────────────┐
│ Pages/Components │────>│ window.electronAPI │────>│ ipcMain handlers     │
│ Zustand stores   │     │ .db / .clipboard   │     │ better-sqlite3       │
│ Ant Design UI    │     │ .file / .shell     │     │ native dialogs/files │
└──────────────────┘     └────────────────────┘     └──────────────────────┘
```

- **Renderer** (`src/`): React app with HashRouter, all UI and state logic runs here
- **Preload** (`electron/preload.ts`): Exposes `window.electronAPI` via `contextBridge` with 5 namespaces: `db`, `clipboard`, `print`, `file`, `shell`
- **Main** (`electron/main.ts` + `electron/ipc/db.ts`): IPC handlers, SQLite via better-sqlite3 (WAL mode, foreign keys ON), auto-creates tables and runs migrations on first access

### Database access pattern

All DB calls go: `React component → Zustand store action → db.all/get/run (src/db/index.ts) → window.electronAPI.db.* → ipcRenderer.invoke → ipcMain.handle → better-sqlite3`

The `db` facade in `src/db/index.ts` wraps the IPC calls — stores and pages import it directly:
```ts
import { db } from '@/db';
const rows = await db.all<MyType>('SELECT ...', [params]);
```

The DB file lives at `app.getPath('userData')/doc-manager.db`. The `config` table (key-value) stores user settings: `forward_template`, `meeting_template`, `approval_template` (base64 docx).

### State management (Zustand stores)

Each domain has its own store in `src/stores/`:

| Store | Key data | Notes |
|---|---|---|
| `incomingStore` | IncomingDoc, DocDepartment, IncomingFile | CRUD + approval number auto-generation, Excel import/export, batch reply |
| `outgoingStore` | OutgoingDoc, OutgoingDocUnit | CRUD + unit read tracking |
| `meetingStore` | Meeting, MeetingAttendee, MeetingFile | CRUD + attendee management via Transfer component, Excel import/export |
| `unitStore` | Unit, Department, Contact | Three related domain objects in one store (units, departments, contacts) |
| `configStore` | DocLevel, DocType, DocTag, DispatchType | Reference data for dropdowns |
| `archiveStore` | ArchiveBox, ArchiveRecord | Archive box CRUD + record management |

### Routing and layout

All routes live under a single `<AppLayout />` in `src/router.tsx`. The layout has a dark sidebar (220px, collapsible) with menu groups separated by dividers, a white header showing the current page title, and a `<Content>` area with 16px margin/padding.

Routes: `/dashboard`, `/incoming`, `/outgoing`, `/meetings`, `/units`, `/departments`, `/contacts`, `/archives`, `/archives/records`, `/config`, `/backup`, `/templates`

### Key features by page

- **IncomingPage**: Document registration form (title, level, type, tag, unit, document number, security level, approval number, handler, reviewer), multi-role department assignment (lead/assist/summary/read_handle/read_notify), forward text generation (template-based → clipboard), approval form generation (docxtemplater fills a Word template → temp file → system open), file attachments, archive into boxes, Excel import/export with fuzzy unit matching, batch reply, password-protected data clearing
- **MeetingsPage**: Date-grouped table with rowSpan merging, human-friendly time formatting (今天/明天/周X/下周X, 凌晨/早上/上午/中午/下午/晚上), attendee selection via Ant Design Transfer (pulls from contacts), notification/receipt generation from configurable template
- **DashboardPage**: Three-tab unified view (收文/发文/会议), deadline-aware filtering (all/overdue/2-day), color-coded rows (red for overdue, yellow for today, blue for within 2 days), inline status dropdown

### Styling conventions

- Inline styles via React `style` prop throughout — no CSS modules or styled-components
- Multi-line text truncation uses `-webkit-line-clamp` pattern:
  ```tsx
  style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
  ```
- Tables use `scroll={{ y: 'calc(100vh - XXpx)' }}` for viewport-height-based scrolling

### Template system

The app uses two template types stored in the `config` table:
1. **转发模版** (`forward_template`): Text with `{{key}}` placeholders; keys: 来文单位, 标题, 转发股室, 收文员, 呈批编号, 回复日期, 公文类型, 公文标签, 摘要
2. **会议通知模版** (`meeting_template`): Text with `{{key}}` placeholders; keys: 主题, 时间, 地点, 备注, 参会领导, 参会人员
3. **呈批表模版** (`approval_template`): Base64-encoded .docx file; filled by docxtemplater at generation time with keys like 标题, 来文单位, 呈批编号, 转发股室, 主办股室, etc.
