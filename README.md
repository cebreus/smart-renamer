# Smart Renamer

[![macOS](https://img.shields.io/badge/OS-macOS_14+-black)](#)
[![Node](https://img.shields.io/badge/Node-22+-green)](#)
[![Privacy](https://img.shields.io/badge/Privacy-100%25_Local-orange)](#)

Smart Renamer is a local tool for macOS. It renames PDF files and images using
OCR and a local AI (LLM).

## Core Features

| Feature        | Description                                                   |
| :------------- | :------------------------------------------------------------ |
| **Privacy**    | 100% local processing via Apple Vision and LM Studio.         |
| **Logic**      | Multi-level strategy: Registry (Regex) → LLM → Manual Dialog. |
| **Minimalism** | Output format: `YYYY-MM-DD (Company) Description.ext`.        |
| **Dedupe**     | Skips identical files using SHA-256 streaming hash.           |

## Requirements & Setup

- **System:** macOS 14+, Node.js 22+, Swift.
- **AI:** LM Studio 0.4+ (vision model) running at `http://localhost:1234`.

```bash
git clone https://github.com/your-username/smart-renamer.git
cd smart-renamer
pnpm install
```

## Usage

```bash
pnpm start file.pdf           # Single file
pnpm start -d docs/*.png      # Multiple files with deduplication
```

### CLI Options

- `-d, --dedupe`: Skip identical files.
- `-h, --help`: Show help.

## How it works

1. **OCR:** Reads text via Apple Vision. Renders first 4 pages of PDF to JPG.
2. **Match:** Checks `registry.json5` for known company patterns.
3. **AI:** Local LLM analyses text and images to find date and company.
4. **Merge:** Combines data. If data is missing, it shows a macOS dialog box.
5. **Rename:** Sanitises name (max 255 bytes) and handles name collisions.
6. **Log:** Saves transaction to `smart-renamer.log` (JSONL with rotation).

## Configuration

Edit `src/config.js` for limits. Use `registry.json5` for known companies:

```json5
[{ pattern: 'O2|Telefonica', company: 'O2', title: 'Invoice' }]
```

## Development & Quality

- **Check all:** `pnpm check:all` (Lint, Knip, jscpd).
- **Format:** `pnpm fix:format`.
- **License:** MIT.

## Support

- **Issues:** Use the GitHub tracker.
- **Privacy:** No data leaves your machine.
