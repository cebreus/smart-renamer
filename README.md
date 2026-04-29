# Smart Renamer

[![macOS](https://img.shields.io/badge/OS-macOS_14+-black)](#)
[![Node](https://img.shields.io/badge/Node-22+-green)](#)
[![Privacy](https://img.shields.io/badge/Privacy-100%25_Local-orange)](#)

Smart Renamer is a local tool for macOS. It renames PDF files and images using
OCR and a local AI (LLM). It follows a deterministic, safe, and minimalist
approach to document archiving.

## Core Features

| Feature        | Description                                                   |
| :------------- | :------------------------------------------------------------ |
| **Privacy**    | 100% local processing via Apple Vision and LM Studio.         |
| **Logic**      | Multi-level strategy: Cache → Registry → LLM → Manual Dialog. |
| **Minimalism** | Output format: `YYYY-MM-DD (Company) Description.ext`.        |
| **Dedupe**     | Skips identical files using SHA-256 streaming hash.           |
| **Rollback**   | Undo last rename session via `--undo`.                        |
| **Robustness** | AI context fallback (4 -> 1 pages), signal-safe OCR cleanup.  |

## Requirements & Setup

- **System:** macOS 14+, Node.js 22+, pnpm 9+, Swift (Apple Vision).
- **AI:** LM Studio 0.4+ (vision model) running at `http://localhost:1234`.

```bash
git clone https://github.com/your-username/smart-renamer.git
cd smart-renamer
pnpm install
```

## Usage

```bash
node index.js file.pdf              # Single file
node index.js incoming/             # Folder (recursive scan)
node index.js docs/*.png --dedupe   # Multiple files, skip duplicates
node index.js file.pdf --dry        # Dry run (no actual rename)
node index.js file.pdf --force      # Ignore cache, reprocess
node index.js --undo                # Rollback last session
```

### CLI Options

| Flag       | Description                                               |
| :--------- | :-------------------------------------------------------- |
| `--dry`    | Preview rename without changing anything on disk.         |
| `--force`  | Ignore curated cache and reprocess the file from scratch. |
| `--dedupe` | Skip files with identical content (SHA-256).              |
| `--undo`   | Rollback all successful renames from the last session.    |
| `--help`   | Show usage information.                                   |

### Environment Variables

| Variable                | Default       | Description                                   |
| :---------------------- | :------------ | :-------------------------------------------- |
| `TRACE_VERBOSE`         | `false`       | Log full AI request/response detail.          |
| `VISION_OCR_LANGS`      | `cs-CZ,en-US` | Languages for Apple Vision OCR.               |
| `SWIFT_PATH`            | `swift`       | Custom path to the Swift executable.          |
| `SMART_RENAMER_LOCALE`  | `cs`          | UI language for macOS dialogs (`cs` or `en`). |
| `INTERACTION_MAX_STEPS` | `100`         | Maximum manual interaction steps per file.    |

## How it works

1. **Discover Files:** Accepts files and folders, scans recursively, processes
   supported types (`.pdf`, `.jpg`, `.jpeg`, `.png`, `.tif`, `.tiff`).
2. **Hash & Cache:** Computes SHA-256 and checks curated memory
   (`registry-files.json5`).
3. **OCR:** Apple Vision OCR processes pages in Swift (up to 10 pages per
   document, 60s timeout).
4. **Match:** Checks `registry.json5` for known company patterns (match modes:
   `substring`, `exact`, `regex`).
5. **AI:** Local LLM analyses OCR text + page images; when inference fails, it
   automatically reduces context from 4 down to 1 page.
6. **Merge:** Combines sources. Missing fields trigger a macOS dialog for manual
   refinement.
7. **Rename:** Sanitises name (max 255 bytes) and handles collisions
   incrementally.
8. **Log:** Saves transaction to `renames.log` for rollback support.
9. **Learn:** Saves operator-approved metadata to `registry-files.json5`.

### Safety & Limits

- **Interaction Limit:** Max 100 dialog steps per file
  (`INTERACTION_MAX_STEPS`). A warning is shown at 80 steps.
- **AI Context Fallback:** Inference starts at max 4 pages and retries down to 1
  page on failure.
- **OCR Page Limit:** Swift OCR processes up to 10 pages per document.
- **Recursion Limit:** Rollback searches for moved files up to a depth of 5.
- **Cleanup:** Temporary OCR images are automatically deleted, even if the
  process is interrupted via `SIGINT` (Ctrl+C).

## Local Data Files

These files are local only (ignored by Git).

| File                   | Purpose                                             |
| :--------------------- | :-------------------------------------------------- |
| `registry.json5`       | Your manual rules for company pattern matching.     |
| `registry-files.json5` | Auto-learned cache of operator-approved renames.    |
| `renames.log`          | Transaction history (JSONL). Required for `--undo`. |
| `debug.log`            | Diagnostic trace (OCR output, AI payloads).         |

### `registry.json5` format

```json5
[
  {
    pattern: 'O2|Telefonica',
    company: 'O2',
    title: 'Invoice',
    matchMode: 'substring', // substring, exact, or regex
  },
]
```

### Advanced Config (`src/config.js`)

- `VALUE_BLOCKLIST`: Array of strings to filter out from AI suggestions (e.g.
  "null", "unknown").
- `LLM_TIMEOUT_MS`: Timeout for AI inference (default 35s).

## Supported Inputs

- Files: PDF, JPG, JPEG, PNG, TIF, TIFF.
- Paths: Individual files or folders.
- Folder mode is recursive and avoids symlink loops.

## Development & Quality

- **Quality Check:** `pnpm check:all` (Lint, Knip, jscpd, depcruise, audit).
- **Format:** `pnpm fix:format`.
- **Lint only:** `pnpm check:lint`.
- **Unused check:** `pnpm check:unused`.
- **Duplicate code:** `pnpm check:dupe`.
- **Dependency graph:** `pnpm check:deps`.
- **Security audit:** `pnpm check:audit`.

## Support

- **Privacy:** 100% Local. No telemetry. No cloud APIs.
