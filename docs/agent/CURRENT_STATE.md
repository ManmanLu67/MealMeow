# Current Project State

> Last updated: 2026-11-13（晚）
> Keep under ~2 pages. Record verified facts only. Update when status or findings materially change.

## 1. Current goal

正式写云函数和页面行为之前，先把开发骨架和互相冲突的规则收成一套。

## 2. Status

- Stage: 规则已收口，产品功能未开工
- Branch: main
- Relevant code commit: ae9f24d
- Overall: in progress

## 3. Completed and verified

- 领域规则在 `domain/`，测试在 `test/domain.test.ts`。上一轮会话跑过 `node --test test/domain.test.ts`，24 项通过。本轮没有改领域代码，没有重跑。
- 开发骨架已按全局规则补上：`AGENTS.md`、`CLAUDE.md`、`docs/agent/`、`scripts/sync-project-skills.ps1`。

## 4. Current work

- Task: 无正在写的功能
- Expected behavior: 三份规划文档已经按 `docs/agent/ARCHITECTURE.md` 改过
- Files / modules: `D:\Project\任务规划\吃饭喵` 的《个人用户版本》《页面设计》《技术架构》

## 5. Decisions

- 开发入口、任务起止、技能同步按 agent-hub 项目模板。产品规则放在 `ARCHITECTURE.md`，不堆在 `AGENTS.md`。见 `decisions/ADR-0001-rules-and-scaffold.md`。
- 饥饿按档恢复。打卡不结算。结算看 `settlement_jobs`。审核未终态则宠物冻结。连续天数分先领养和先打卡。没有独立宠物页。打卡以「完成打卡」写入。小组不启用。

## 6. Blockers

- Problem: 无。云函数还没接数据库，这是未做，不是挡住规则收口的问题。
- Checked: 三份现行规划文档里点名过的冲突句
- Unverified: 微信开发者工具里的页面点击。本轮没有打开模拟器。

## 7. Next actions

1. 你确认三份规划文档和 `docs/agent/ARCHITECTURE.md` 是否还要改。
2. 设计批准前不接云数据库，不拆新的云函数。
3. 开工时先补失败测试，再写 `cloudfunctions/api` 和 `settle` 的真实读写。

## 8. References

- Overview: PROJECT_OVERVIEW.md
- Architecture: ARCHITECTURE.md
- Known issues: KNOWN_ISSUES.md
- Latest handoff: handoffs/
