# Smart Renamer: Agent Engineering Context

## 1. Agent Protocol & Integrity (CRITICAL)

- **Evidence first:** Back every codebase claim with tool output.
- **If uncertain:** Say "I don't know, I will verify" and then verify.
- **Verify before action:** Use `grep_search`/`read_file` before editing.
- **No fabricated issues:** Never invent errors to satisfy expectations.
- **Communication style:** Zero self-flagellation. Provide brief, technical
  root-cause analysis and a verified path to correction.

## 2. Safety & Filesystem Operations

- **Minimal diffs only:** Change only what is required.
- **No overwrite edits:** Do not use `write_file` for existing files.
- **Preserve intent:** Keep logic/comments unless change requires it.
- **Unsafe codebase:** Stop and ask before broad refactors.
- **Before tools:** State what will change and why.

## 3. Engineering Philosophy

- **Principles:** KISS, DRY, SOLID, YAGNI.
- **Paradigm:** Functional/procedural; no classes.
- **Top-level declarations:** Named `function` only (no top-level arrows).

## 4. Strict Coding Standards

- **Runtime:** Node.js 22+, ESM only, stdlib imports with `node:`.
- **Package Manager:** `pnpm` only (NEVER use `npm` or `yarn`).
- **Async:** Prefer async/await.
- **Syntax:** No `++`/`--`; use explicit increments. Preserve errors with
  `Error.cause`.
- **Exports:** Named exports only.
- **Files:** Use `kebab-case.js` and coherent module grouping.
- **Comments:** Use British English (GB-EN) only. Keep language concise and
  simple (A2 level).

## 5. Naming & Type Safety

- **Booleans:** Prefix with `is/has/can/should`.
- **Converters:** Use `extract/to/from/parse` naming.
- **JSDoc:** Required for new functions only; keep existing JSDoc untouched.
- **Validation:** Validate inputs at boundaries and fail fast.
- **Validator contract:** Return `{ isValid, error }`.
- **Constants:** Use SCREAMING_SNAKE_CASE for magic values.

## 6. Execution Workflow & Checklist

1. **Verify:** Confirm current state with tools.
2. **Analyze:** Compare state with these standards.
3. **Execute:** Apply minimal targeted edits.
4. **Validate:** Run `pnpm check:lint`.

### Final Agent Checklist:

- \[ ] Reused library solutions where appropriate?
- \[ ] Kept named `function` declarations at module top-level?
- \[ ] Used `is/has/can/should` for booleans?
- \[ ] Validated inputs at entry points?
- \[ ] Preserved error chains with `Error.cause`?
- \[ ] Passed `pnpm check:all`?

## 7. Source Control & Safety Protocol (CRITICAL)

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

## 8. Command Approval Profile

- **Allow:** `ls`, `rg`, `grep`, `sed`, `git diff`, `git status`, `git log`,
  `git restore -- <path>`, `git stash list/show/push -m/apply/pop`,
  `pnpm fix:format`, `pnpm check:lint`, `pnpm check:all`.
- **Ask first:** `git checkout`, `git reset --hard`, `git clean -fd`,
  `git commit --amend`, any staging/unstaging (`git add*`, `git reset`,
  `git restore --staged`).
- **Stash cleanup:** `git stash drop`/`git stash clear` only for explicit
  cleanup of obsolete named stashes, after `git stash list`.
- **Fallback:** If command is not listed or can mutate state, ask first.
