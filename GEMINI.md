# GEMINI.md

## Project

Smart Renamer (macOS CLI/Quick Action) - Deterministic, safe, and minimalist
document renaming. Consistency over descriptive perfection (no placeholders).

## Stack

Node.js 22+, ESM, `pnpm` exclusively, macOS native `osascript`. Apple Vision
Framework (OCR), LM Studio (local LLM).

## Commands

- Lint: `pnpm check:lint`
- Format: `pnpm fix:format`
- Check All: `pnpm check:all`
- Safe Git Revert: `git restore -- <path>`
- Safe Git Stash: `git stash push -m "reason/context"`

## Architecture

- Pipeline: `REGISTRY (Regex) → LLM Inference → Manual Fallback Dialog`
- Data Flow: Local OCR → Local LLM Inference → User Validation

## Rules

- Linter is Master: ESLint/Knip/Prettier rules override aesthetic preferences.
- IMPORTANT: Never use `eslint-disable` without explicit user approval. Propose
  config changes on conflict.
- TDD-Ready Architecture: Even without active tests, code must be strictly
  testable. Isolate side-effects (I/O, OCR, APIs) to module boundaries. Core
  logic must be pure, deterministic functions.
- Use functional/procedural paradigm; no classes.
- Use named `function` declarations only (no top-level arrow functions).
- Enforce function order: Internals first (leaf → composite), Exports last.
- Validate inputs at boundaries (validator contract: `{ isValid, error }`).
- Preserve error chains using `Error.cause`.
- Prefix booleans with `is/has/can/should`. Use `extract/to/from/parse` for
  converters.
- Use British English (GB-EN) only, A2 level simplicity.
- JSDoc is required ONLY for exported functions; keep existing untouched.
- IMPORTANT: Destructive git commands (`reset --hard`, `clean`, `checkout`,
  staging) require user approval.
- Never access secrets (`.env`, SSH keys).

## Workflow

- Pre-flight: Read `eslint.config.js` and `package.json` to understand the
  linter rules before coding.
- Verify first: Back every claim with tool output (`grep_search`/`view_file`
  before editing).
- Atomic Validation Loop: Write atomic module → Run `pnpm check:lint`
  immediately → Adjust.
- State what will change and why before using tools.
- Provide brief, technical root-cause analysis; zero self-flagellation.
- Analyze edge cases (e.g., OCR failure, LLM timeout) _before_ writing code.
- Minimal changes: Do not refactor unrelated code. Apply minimal targeted diffs
  only (no full file overwrites).
- Scope boundaries: If a fix requires refactoring multiple files or changing
  architecture, STOP. When unsure, explain both approaches and let the user
  choose.
- Confidence threshold: Do not guess. If you lack context, explicitly say "I
  don't know". Answer only when highly confident.
- Commit Policy: Commits are forbidden by default. EXCEPTION: You may commit
  autonomously ONLY to safeguard a fully verified, atomic chunk of work before
  starting a risky change. Never commit unverified or unfinished work.

## Out of scope

- NEVER solve renaming tasks using only the LLM (bypassing Regex/Fallback
  pipeline).
- NEVER use `npm` or `yarn` (strictly `pnpm`).
- Do not use `pdftotext` or Tesseract (Apple Vision Framework only).
- Do not send data to the cloud (strictly localhost).
