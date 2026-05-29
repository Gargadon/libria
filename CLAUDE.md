# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Development (Angular dev server + Electron)
npm run electron:dev

# Angular-only dev server (browser, no Electron APIs)
npm run dev        # or: npm start

# Production build (outputs to dist/)
npm run build

# Package for distribution (runs build first, then electron-builder → release/)
npm run electron:build

# Run tests
npm test           # uses Vitest via ng test
```

To run a single test file: `npx vitest run src/app/path/to/file.spec.ts`

## Architecture

Libria is an **Electron + Angular 21** desktop app for writing and typesetting books. It runs as a standalone app with no backend.

### Process split

| Layer | Entry point | Role |
|---|---|---|
| Electron main | `main.js` | OS file I/O, spellcheck session, native menus, IPC |
| Electron preload | `preload.js` | Exposes `window.electronAPI` bridge (contextIsolation) |
| Angular renderer | `src/main.ts` | All UI; talks to Electron via `window.electronAPI` |

In dev mode Angular serves at `localhost:4200` and Electron loads that URL. In production it loads `dist/libria/browser/index.html`.

### State management

All application state lives in a single **NgRx Signals Store** at `src/app/store/book.store.ts` (`BookStore`, provided in root). State shape is defined by `BookState`. Key sections:

- `book` — bibliographic metadata (`Book`; paper sizes: `5x8`, `6x9`, `A5`, `A4`, `A6`, `Letter`)
- `chapters` — ordered array of `Chapter` (each has a `body: Block[]`)
- `notes` — editorial annotations keyed by chapter + block index
- `tweaks` — all typographic/layout settings (`Tweaks`)
- `assets` — cover image and other binary resources stored as base64 data URLs
- `past` / `future` — undo/redo stacks (50 snapshots max, stored as deep clones)
- `ui` — transient UI state (active nav, sidebar visibility)
- `personalConfig` — user settings persisted via `PersonalConfigService`

The store exposes granular mutation methods. Always call `store.saveSnapshot()` before mutations that should be undoable.

### File format

Documents are saved as `.libria` files (JSON). The schema is defined in `src/app/models/book.models.ts` (`LibriaDocument`) and documented in `FORMATO_LIBRIA.md`. File I/O is handled by `FileService` — it detects whether `window.electronAPI` is present to choose between native Electron dialogs and the browser File System Access API.

### Services

| Service | Responsibility |
|---|---|
| `FileService` | Open/save `.libria` files; tracks `currentPath` |
| `ExportService` | Generate EPUB 3.0, DOCX, and PDF from store state |
| `ImportService` | Import DOCX files via `mammoth` |
| `HyphenService` | Lazy-loads `.hyb` hyphenation dictionaries from `public/dictionaries/` |
| `SpellCheckService` | Wraps Electron's session-level spellchecker; no-ops in browser |
| `PersonalConfigService` | Persists `PersonalConfig` to `localStorage` |

### Components

- `AppComponent` — root shell; orchestrates welcome screen vs. editor layout
- `WelcomeComponent` — shown when `store.book()` is null; handles new/open
- `EditorComponent` — block-based contenteditable editor for the active chapter
- `ContenteditableDirective` — bridges DOM contenteditable events to the store
- `SidebarComponent` — chapter list and navigation
- `TweaksPanelComponent` — 40+ typographic controls bound to `store.tweaks`
- `PreviewComponent` — live paginated CSS preview of the book
- `TopbarComponent` — file operations, undo/redo, export triggers

### i18n

UI strings use `@ngx-translate`. Translation files are in `public/i18n/en.json` and `public/i18n/es.json`. The app language follows `personalConfig.language`; the document language (`book.lang`, e.g. `"es-MX"`) controls hyphenation and spellcheck.

### Block types

Chapter content is a flat `Block[]` array. Supported `type` values: `chapter-title`, `p`, `first-p`, `h1`–`h3`, `scene-break`, `page-break`, `blockquote`, `dedication`, `epigraph`. Block mutations go through store methods (`updateChapterBlock`, `insertBlock`, `splitBlock`, `mergeWithPrevious`, etc.).

### Electron IPC

`window.electronAPI` (typed in `src/electron.d.ts`) exposes: `openDialog`, `saveDialog`, `readFile`, `writeFile`, `onFileOpen`, `onCloseRequested`, `setSpellCheckLanguage`, `addWordToDictionary`, and window title helpers. All renderer↔main communication goes through this bridge.
