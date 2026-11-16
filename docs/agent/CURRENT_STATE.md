# Current Project State

> Last updated: 2026-11-13（夜）
> Keep under ~2 pages. Record verified facts only. Update when status or findings materially change.

## 1. Current goal

存储、打卡、结算和分层已经在 main。下一批是页面读模型，然后接微信云函数。

## 2. Status

- Stage: 存储、打卡、结算的命令和分层完成，页面读模型和微信接入未开工
- Branch: main
- Overall: in progress

## 3. Completed and verified

- 在合并前的 `feat/store` 上跑过 `npm run typecheck`，退出码 0。跑过 `npm test`（`node --test "test/*.test.ts"`），76 项通过，0 失败。合并后的结果见第 4 节。
- 分层：`domain/` → `app/`（接口在 `app/ports.ts`，入口在 `app/handle.ts`）→ `adapters/memory/`。`test/architecture.test.ts` 检查依赖方向、平台 API 和时钟，违反会让 `npm test` 失败。
- 已落实的规则：宠物死亡和领养、窗口前到达的审核、补结算任务、连改饭点、冻结期删除、整体冻结、同一用户写命令串行、饭点避开 03:01–04:59、口粮和打卡互斥、连续天数锚点和多只宠物、一张通过即可。规则补充见 `decisions/ADR-0002-settlement-freeze-and-review-rules.md`。
- `.gitignore` 覆盖私有配置、密钥和证书、编译产物、手机端构建和签名、日志、编辑器目录。

## 4. Current work

- Task: 整理文件夹结构，合并分支，删除重复内容
- Expected behavior: 主目录是唯一完整的项目，不再有单独的工作树
- Verification after merge: 见本节末尾的记录

## 5. Decisions

- 开发入口、任务起止、技能同步按 agent-hub 项目模板。产品规则放在 `ARCHITECTURE.md`，不堆在 `AGENTS.md`，README 也不再重复规则。见 `decisions/ADR-0001-rules-and-scaffold.md`。
- 饥饿按档恢复。打卡不结算。结算看 `settlement_jobs`。审核未终态则宠物冻结。连续天数分先领养和先打卡。没有独立宠物页。打卡以「完成打卡」写入。小组不启用。
- 整体冻结、口粮与打卡互斥、饭点避开 03:01–04:59、一张通过即可：`decisions/ADR-0002-settlement-freeze-and-review-rules.md`，accepted。
- 分层规则写在 `ARCHITECTURE.md` 的「分层」一节。

## 6. Blockers

- 云函数还没接数据库，这是未做。
- Unverified: 微信开发者工具里的页面点击。云数据库适配器没写，`runExclusive` 在真实数据库上的行为没验证。手机 App 没有任何代码，分层只是为它留了边界。

## 7. Next actions

1. 按 `docs/superpowers/plans/2026-11-13-views.md` 做读模型，写在 `app/views.ts`。
2. 微信云函数在 `2026-11-13-wechat.md`：云数据库适配器放 `adapters/cloud/`，云函数只调用 `app/handle.ts`。
3. 内容安全提交和回调：照片现在永远是 `pending`，见 `KNOWN_ISSUES.md`。

## 8. References

- Overview: PROJECT_OVERVIEW.md
- Architecture: ARCHITECTURE.md
- Known issues: KNOWN_ISSUES.md
- Latest handoff: handoffs/
