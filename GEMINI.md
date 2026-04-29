# Smart Renamer: Agent Engineering Context

## 0. Project Identity & Strategic "Vibe"

- **Project:** Smart Renamer (macOS CLI/Quick Action)
- **Goal:** Deterministic, safe, and minimalist renaming of documents
  (PDFs/scans) using local OCR (Apple Vision) and a local LLM (Gemma 4 via LM
  Studio).
- **The "Vibe" (Intentional Minimalism):** Filenames must be as concise as
  possible. No placeholders (`null` is omitted). Consistency is more important
  than descriptive perfection.
- **Architectural Memory (Why we do this):** Do not solve tasks using only LLM.
  We found that LLM hallucinates over poor OCR. Therefore, we use a multi-level
  strategy: `REGISTRY (Regex) → LLM Inference → Manual Fallback Dialog`. Respect
  and do not bypass this architecture.

## 1. Linter-First Supremacy (CRITICAL)

- **Linter is Master:** Project linters (ESLint, Knip, Prettier) are the final
  authority. Their rules override any aesthetic preferences from PRD or Design
  docs.
- **Pre-emptive Scan:** Always read config files (`eslint.config.js`,
  `package.json`) BEFORE coding to identify hard constraints (e.g.,
  max-statements: 12).
- **Atomic Validation Loop:**
  1. Write the first atomic module.
  2. Run `pnpm check:lint` immediately.
  3. Adjust coding style for the rest of the session based on results.
- **Conflict Strategy:** If rules conflict (e.g., `consistent-return` vs
  `unicorn`), STOP and propose a config change. Never use `eslint-disable`
  without explicit user approval.

## 2. Agent Protocol & Integrity

- **Evidence first:** Back every codebase claim with tool output.
- **If uncertain:** Say "I don't know, I will verify" and then verify.
- **Verify before action:** Use `grep_search`/`read_file` before editing.
- **No fabricated issues:** Never invent errors to satisfy expectations.
- **Communication style:** Zero self-flagellation. Provide brief, technical
  root-cause analysis and a verified path to correction. Act as a Senior
  Architect: analyse "Edge Cases" (e.g., Apple Vision failure, LLM timeout)
  before writing code. No fluff or filler.

## 3. Safety & Filesystem Operations

- **Minimal diffs only:** Change only what is required.
- **No overwrite edits:** Do not use `write_file` for existing files.
- **Preserve intent:** Keep logic/comments unless change requires it.
- **Unsafe codebase:** Stop and ask before broad refactors.
- **Before tools:** State what will change and why.

## 4. Engineering Philosophy

- **Principles:** KISS, DRY, SOLID, YAGNI.
- **Paradigm:** Functional/procedural; no classes.
- **Top-level declarations:** Named `function` only (no top-level arrows).
- **Function order (RECOMMENDED/ENFORCED STYLE):** Within every module,
  functions should be ordered by dependency for readability and clarity. Note
  that function declarations are hoisted in JavaScript, so the
  "define-before-call" constraint only strictly applies to const/let function
  expressions; function declarations may be referenced before their definition.
  However, the following order is recommended as a readability and documentation
  convention:
  1. `@file` JSDoc + imports + module-level constants/state
  2. Internal leaf functions (no outgoing calls to module-level siblings)
  3. Internal composite functions (call other internal functions)
  4. Exported functions — **always at the bottom**, as the public API surface

  Rationale: This ordering improves code clarity and serves as a module summary.
  Exports are the contract; they belong at the end. _(Note: ESLint does not
  enforce this structural order because plugins like `import/order` or
  `no-use-before-define` cannot reliably handle JS hoisting without breaking
  valid patterns. This is strictly an agent-enforced convention for
  readability.)_

## 5. Strict Coding Standards

- **Runtime:** Node.js 22+, ESM only, stdlib imports with `node:`.
- **Package Manager:** `pnpm` only (NEVER use `npm` or `yarn`).
- **Async:** Prefer async/await.
- **Syntax:** No `++`/`--`; use explicit increments. Preserve errors with
  `Error.cause`.
- **Exports:** Named exports only.
- **Files:** Use `kebab-case.js` and coherent module grouping.
- **Comments:** Use British English (GB-EN) only. Keep language concise and
  simple (A2 level).
- **Platform Constraint:** The script runs exclusively on macOS. Use `osascript`
  for native dialogues.
- **OCR Engine:** Exclusively via native Apple Vision Framework (called via a
  temporary Swift script); do not use `pdftotext` or Tesseract.
- **Privacy:** All LLM inference must occur via `localhost` (LM Studio).
  Strictly forbid sending data to the cloud.

## 6. Naming & Type Safety

- **Booleans:** Prefix with `is/has/can/should`.
- **Converters:** Use `extract/to/from/parse` naming.
- **JSDoc:** Required for new functions only; keep existing JSDoc untouched.
- **Validation:** Validate inputs at boundaries and fail fast.
- **Validator contract:** Return `{ isValid, error }`.
- **Constants:** Use SCREAMING_SNAKE_CASE for magic values.

## 7. Execution Workflow & Checklist

1. **Verify:** Confirm current state with tools.
2. **Analyze:** Compare state with these standards.
3. **Execute:** Apply minimal targeted edits.
4. **Validate:** Run `pnpm check:lint`.

### Final Agent Checklist:

- \[ ] Reused library solutions where appropriate?
- \[ ] Kept named `function` declarations at module top-level?
- \[ ] Function order: internals first, exports last?
- \[ ] Used `is/has/can/should` for booleans?
- \[ ] Validated inputs at entry points?
- \[ ] Preserved error chains with `Error.cause`?
- \[ ] Passed `pnpm check:all`?

## 8. Source Control & Safety Protocol

- **Index is user-owned:** Do not stage/unstage (`git add*`, `git reset`,
  `git restore --staged`) unless explicitly requested.
- **Safe revert allowed:** Use `git restore -- <path>` to reset working-tree
  content to current index.
- **Destructive git is blocked by default:** `git reset --hard`,
  `git clean -fd`, `git checkout -- <path>`, force push, and history rewrite
  commands require explicit user approval.
- **Prefer stash for temporary context switches:** Use named stashes
  (`git stash push -m "reason/context"`), review with `git stash list`, and
  clean obsolete stashes.
- **Never access secrets:** Do not read/export `.env`, SSH keys, or secret
  files.
- **Transparency:** Run `git status` before and after any source-control action.

## 9. Command Approval Profile

- **Allow:** `ls`, `rg`, `grep`, `sed`, `git diff`, `git status`, `git log`,
  `git restore -- <path>`, `git stash list/show/push -m/apply/pop`,
  `pnpm fix:format`, `pnpm check:lint`, `pnpm check:all`.
- **Ask first:** `git checkout`, `git reset --hard`, `git clean -fd`,
  `git commit --amend`, any staging/unstaging (`git add*`, `git reset`,
  `git restore --staged`).
- **Stash cleanup:** `git stash drop`/`git stash clear` only for explicit
  cleanup of obsolete named stashes, after `git stash list`.
- **Fallback:** If command is not listed or can mutate state, ask first.
