# Current Project State

> Last updated: 2026-11-13（晚）
> Keep under ~2 pages. Record verified facts only. Update when status or findings materially change.

## 1. Current goal

存储、打卡和结算已经写在 `feat/store`。下一批是首页和相册的读模型，然后才接微信云函数。

## 2. Status

- Stage: 存储、打卡、结算的命令已在隔离分支
- Branch: feat/store（工作树 `.worktrees/feat-store`，main 停在计划提交）
- Relevant code commit: c1a89c4
- Overall: in progress

## 3. Completed and verified

- 本轮在 `.worktrees/feat-store` 跑过 `node --test test/settle-run.test.ts test/checkin.test.ts test/store.test.ts test/domain.test.ts`，40 项通过。
- `createMemoryStore` 按用户、日期、餐次覆盖。`listPendingJobs` 只返回窗口已到且仍为 `pending` 的任务。`listHeldJobs` 返回审核等待已过截止时间的任务。
- `saveMeals` 把新饭点留到次日。`finishCheckin` 不改饥饿。`useStaple` 写口粮。`removeCheckin` 结算前删记录，结算后只隐藏照片。
- `runDueJobs` 漏餐和驳回挨饿，审核未终态冻结，截止后改为人工复核。`applyReview` 同一餐只结算一次。

## 4. Current work

- Task: 存储、打卡、结算三份计划的任务已复查通过
- Expected behavior: 打卡不喂宠物。窗口结束才结算。两小时内没有审核结果就进入人工复核，饥饿不变。
- Files / modules: `app/types.ts`、`app/store.ts`、`app/checkin.ts`、`app/settle.ts`

## 5. Decisions

- 开发入口、任务起止、技能同步按 agent-hub 项目模板。产品规则放在 `ARCHITECTURE.md`，不堆在 `AGENTS.md`。见 `decisions/ADR-0001-rules-and-scaffold.md`。
- 饥饿按档恢复。打卡不结算。结算看 `settlement_jobs`。审核未终态则宠物冻结。连续天数分先领养和先打卡。没有独立宠物页。打卡以「完成打卡」写入。小组不启用。

## 6. Blockers

- Problem: 无。云函数还没接数据库，这是未做，不是挡住规则收口的问题。
- Checked: 三份现行规划文档里点名过的冲突句
- Unverified: 微信开发者工具里的页面点击。本轮没有打开模拟器。

## 7. Next actions

1. 读模型和领养页按 `docs/superpowers/plans/2026-11-13-views.md`。
2. 微信云函数仍留在 `2026-11-13-wechat.md`。页面动作不能自己把审核写成通过。
3. 这三份计划还没有合进 main。

## 8. References

- Overview: PROJECT_OVERVIEW.md
- Architecture: ARCHITECTURE.md
- Known issues: KNOWN_ISSUES.md
- Latest handoff: handoffs/
