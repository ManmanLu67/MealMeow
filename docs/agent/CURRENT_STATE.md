# Current Project State

> Last updated: 2026-11-13（夜）
> Keep under ~2 pages. Record verified facts only. Update when status or findings materially change.

## 1. Current goal

存储、打卡、结算已在 `feat/store`，上一轮复查找出的缺口已修，分层已按「以后能做手机 App」整理。下一批是页面读模型，然后接微信云函数。

## 2. Status

- Stage: 存储、打卡、结算的命令和分层在隔离分支
- Branch: feat/store（工作树 `.worktrees/feat-store`，main 停在计划提交）
- Relevant code commit: 见 `git log feat/store`，本轮修复已提交
- Overall: in progress

## 3. Completed and verified

- 本轮在 `.worktrees/feat-store` 跑过 `npm run typecheck`，退出码 0。跑过 `npm test`（`node --test "test/*.test.ts"`），76 项通过，0 失败。
- 修掉上一轮复查的缺陷：宠物死亡和领养、窗口前到达的审核、补结算任务、连改饭点、冻结期删除、整体冻结、同一用户写命令串行、饭点避开 03:01–04:59、口粮和打卡互斥、连续天数锚点和多只宠物。
- 审核聚合改为「一张通过整餐就通过，全部驳回才驳回」。用户决定，见 ADR-0002。
- 分层：`domain/` → `app/`（接口在 `app/ports.ts`，入口在 `app/handle.ts`）→ `adapters/memory/`。`test/architecture.test.ts` 检查依赖方向、平台 API 和时钟，违反会让 `npm test` 失败。
- `.gitignore` 补了私有配置、密钥和证书、编译产物、手机端构建和签名、日志、编辑器目录、`.superpowers/`。已检查没有已入库文件被它挡住。

## 4. Current work

- Task: 无正在写的功能
- Expected behavior: 打卡不喂宠物。窗口结束才结算。两小时内没有审核结果进入人工复核，饥饿不变。饥饿到 9 宠物死亡。
- Files / modules: `app/`、`adapters/`、`domain/`、`test/`

## 5. Decisions

- 开发入口、任务起止、技能同步按 agent-hub 项目模板。产品规则放在 `ARCHITECTURE.md`，不堆在 `AGENTS.md`。见 `decisions/ADR-0001-rules-and-scaffold.md`。
- 饥饿按档恢复。打卡不结算。结算看 `settlement_jobs`。审核未终态则宠物冻结。连续天数分先领养和先打卡。没有独立宠物页。打卡以「完成打卡」写入。小组不启用。
- 整体冻结、口粮与打卡互斥、饭点避开 03:01–04:59、一张通过即可，见 `decisions/ADR-0002-settlement-freeze-and-review-rules.md`，状态 accepted。
- 分层规则写在 `ARCHITECTURE.md` 的「分层」一节。

## 6. Blockers

- 云函数还没接数据库，这是未做。
- Unverified: 微信开发者工具里的页面点击。本轮没有打开模拟器。云数据库适配器没写，`runExclusive` 在真实数据库上的行为没验证。手机 App 没有任何代码，分层只是为它留了边界。

## 7. Next actions

1. 按 `docs/superpowers/plans/2026-11-13-views.md` 做读模型，写在 `app/views.ts`。
2. 微信云函数在 `2026-11-13-wechat.md`：云数据库适配器放 `adapters/cloud/`，云函数只调用 `app/handle.ts`。
3. 内容安全提交和回调：照片现在永远是 `pending`，见 `KNOWN_ISSUES.md`。

## 8. References

- Overview: PROJECT_OVERVIEW.md
- Architecture: ARCHITECTURE.md
- Known issues: KNOWN_ISSUES.md
- Latest handoff: handoffs/
