# Agent Working Agreement

项目规则的唯一入口。Claude Code 经 `CLAUDE.md` 读入。
本文件保持短。产品规则在 `docs/agent/ARCHITECTURE.md`，不写在这里。

## 1. Project (fill in)

- What it is: 个人可见的三餐打卡微信小程序。先吃饭，宠物才有饭吃。
- Build / run: 用微信开发者工具打开本目录。没有单独的打包命令。
- Test: `npm test`（`node --test "test/*.test.ts"`）。类型检查：`npm run typecheck`
- Do not touch: 小组、跨用户读写、独立宠物页 `/pet`、密钥、`project.private.config.json`
- 产品规则正文是 `docs/agent/ARCHITECTURE.md`。`D:\Project\任务规划\吃饭喵` 里的文档和它冲突时，以它为准。《吃饭打卡小程序：产品与规则设计文档.md》停用。

## 2. Principles

- Understand existing code before changing it. Prefer minimal, targeted changes.
- Do not invent project facts, test results, or dependencies.
- Preserve existing user changes. Never overwrite unrelated work.
- Never expose or commit secrets, tokens, passwords, or private config.
- Ask before destructive or irreversible operations.

## 3. Task start

1. Run `git status --short` and note the branch.
2. Read `docs/agent/CURRENT_STATE.md`.
3. If `docs/agent/CODEMAP.md` exists, read it before a wide search.
4. Read `docs/agent/PROJECT_OVERVIEW.md` only if the project or module is unfamiliar.
5. Open only the architecture notes, ADRs (`docs/agent/decisions/`), and latest handoff relevant to the task.
6. Verify important claims against code and tests before relying on notes.

Do not rescan the whole repo or replay old conversations without a concrete reason.

## 4. Implementation

- Name the target files and expected behavior before editing.
- Follow existing conventions and dependency boundaries.
- Prefer targeted tests; record what was actually run.
- Record significant decisions and rejected alternatives as an ADR.
- Notes and handoffs are aids, not truth.

## 5. Task end / handoff

1. Summarize changes and rationale.
2. List modified files and verification results (and tests not run).
3. List unresolved issues and the next 1-3 steps.
4. Update `docs/agent/CURRENT_STATE.md` when status, findings, decisions, or next steps change.
5. If another agent or session will continue, add `docs/agent/handoffs/YYYY-MM-DD-<topic>.md`
   from `handoffs/_TEMPLATE.md`.

Never record secrets or paste full chat transcripts into project docs.

## 6. Project skills

- Skill files already in this repo: from agent-hub run
  `scripts/install-project-skill.ps1 -Project D:\Project\吃饭喵 -Source <directory that contains SKILL.md>`.
  That junctions `.claude/skills/<name>` (Claude Code, Cursor), `.codebuddy/skills/<name>`
  (CodeBuddy, WorkBuddy), and `.agents/skills/<name>` (Doubao) to that directory. Do not copy a second tree.
- A skill written in this repo: edit only `.claude/skills/<name>/SKILL.md`, then run
  `scripts/sync-project-skills.ps1`. It copies `.codebuddy/skills/` and junctions `.agents/skills/<name>`.
- `.agents/skills/` is in `.cursorignore` and `.gitignore`. Cursor already reads `.claude/skills`.
  Do not add another copy under `.cursor/skills`.
- `scripts/sync-project-skills.ps1 -Check` must pass before commit.
  Commit hand-written `.claude/skills/` and the generated `.codebuddy/skills/` copy.
  Vendored junctions stay gitignored; the files stay at the `-Source` path.

## 7. Parallel agents

Two agents writing at once must use separate git worktrees/branches. Only one agent
(or the user) updates `CURRENT_STATE.md` when merging.
