# AAC Profile Manager

On-device, privacy-first Progressive Web App (PWA) for Speech-Language Pathologists (SLPs) to manage a caseload of student AAC profiles on a classroom iPad — including read-only parsing of real AAC vocabulary exports.

## Architecture & Privacy Guarantees

- **100% On-Device**: No server, no accounts, no cloud sync, no third-party analytics, and zero network calls carrying student data.
- **Static Next.js Export & Offline PWA**: Built with Next.js (static export), React, TypeScript, and Tailwind CSS. Includes a Web App Manifest, iPad/PWA icons, local `sql-wasm.wasm`, and a content-versioned service worker (`out/sw.js`) so the app installs to the iPad Home Screen and runs fully offline after first load.
- **IndexedDB Storage (`src/lib/data-store.ts`)**: Stores one record per student profile in IndexedDB with versioned schema migrations (`src/lib/migrations.ts`). UI components never touch IndexedDB directly.
- **Passcode Protection (`src/lib/secure-store.ts`)**: Optional passcode gate modeled on `AscendEd-DataTool`. Passcodes are never stored in plaintext — hashed with PBKDF2-SHA-256 (600,000 iterations, random salt) with escalating lockout (`src/lib/attempt-lockout.ts`), wrapping an AES-256-GCM Data Encryption Key that encrypts stored student profile records at rest.
- **Initials by Default**: Student display defaults to initials (`displayName`). Full name and student photo fields exist but are off by default and explicitly opt-in per profile.
- **Read-Only AAC File Parsers (`src/lib/parsers/`)**: Every parser runs locally in the browser (`fflate` + `sql.js` WASM), extracts labels, spoken messages, grid layout, and page links into a common Open Board Format (OBF)-shaped model, omits licensed symbol artwork, and never writes to or modifies an imported AAC file.

## Supported AAC File Formats

| AAC System | Extensions | Support Status |
|---|---|---|
| **TouchChat & LAMP Words for Life** | `.ce` | Supported (read-only ZIP + `.c4v` SQLite via `fflate` & `sql.js`) |
| **TD Snap** | `.sps`, `.spb` | Supported (read-only SQLite with runtime schema discovery & integrity check, ported from `rjpenny16/AAC-Editor`; `SyncHash` ignored) |
| **Proloquo2Go** | `.p2gbk`, `.p2g` | Recognized stub with privacy-safe structure-only inspector (`docs/PROLOQUO2GO_INVESTIGATION.md`) |

## Project Shape

```text
src/
  app/            # Static-export routes (/, /profile/, /profile/new/, /profile/edit/, /import/, /compare/, /settings/)
  components/     # UI screens and shared components
  hooks/          # ProfilesProvider & useProfiles context
  lib/            # Types, constants, data-store, indexed-db-store, migrations, secure-store, backup, snapshot-compare, parsers/
  providers/      # Root AppProviders (PasscodeGate -> ProfilesProvider -> AppShell)
scripts/          # Build helpers for local sql-wasm.wasm copy & static service worker generation
docs/             # Format investigation notes (Proloquo2Go)
```

## Development & Verification

```bash
npm install
npm run typecheck      # TypeScript strict check
npm test               # Vitest unit test suite (store, migrations, secure-store, backup, parsers, compare, PWA)
npm run build:static   # Static export (out/) + versioned offline service worker (out/sw.js)
npm run dev            # Local development server
```
