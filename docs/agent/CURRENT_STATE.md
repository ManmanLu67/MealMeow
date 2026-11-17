# Current Project State

> Last updated: 2026-11-17
> Keep under ~2 pages. Record verified facts only. Update when status or findings materially change.

## 1. Current goal

在 `feat/views` 上做首页、图鉴、领养的读模型。`app/views.ts` 已写完，测试通过。还没接到云函数，页面仍读预览数据。

## 2. Status

- Stage: 读模型已实现，未提交
- Branch: feat/views（从 feat/snack-name 的 7731f28 拉出；main 是主干）
- Overall: 工作区有未提交的读模型。feat/snack-name 仍停在 7731f28，可以单独合并

## 3. Completed and verified

- 本会话 `npm test`：108 项通过，0 失败。`npm run typecheck` 退出码 0。
- `homeView`：胶囊、红点、宠物区、状态词、名字、相机动作。审核未完成不留红点，也不改状态词。
- `galleryView`：连续天数用 `personalStreak` + `streakAnchor`。三格去掉隐藏和整餐驳回，口粮无图，一餐多张只留未驳回的。零食单独一行。可选日期只换当天的三格和零食，不改连续天数。
- `adoptView`：活着的宠物不能领养；冷却未结束也不能。

## 4. Current work

- Task: 页面读模型。代码和测试已写，未提交，未接页面。
- Expected behavior: 见 `ARCHITECTURE.md` 的连续天数、零食、页面和范围。计划在 `docs/superpowers/plans/2026-11-13-views.md`。
- Verification: 见第 3 节。页面仍是 `config.usePreviewData = true`。

## 5. Decisions

- 计划里的返回值比现有页面少。读模型按页面已经在读的形状补了：首页的 `date`、`petName`、`band`、`camera`；图鉴的 `days`、`todayIndex`、`snacks`，以及三格上的 `name`。错了的代价是以后接页面时要再改一次字段。
- `galleryView` 第四个参数是要看的逻辑日，不传就是今天。连续天数和顶栏一周始终按 `now`。
- `adoptView.canAdopt` 在宠物还活着时为 false。领域函数 `canAdopt` 只看冷却。
- 连续天数按天调用 `listRecords`，从终点往前走到第一个没完成的日子。没有按范围一次取出。

## 6. Blockers

- 云函数没接数据库（未做）。照片内容安全提交/回调没接（见 KNOWN_ISSUES）。
- 页面只在 Chrome 近似渲染里看过，没有在微信开发者工具里验收。
- 读模型没有接到 `handle.ts` 和云函数。页面还在读 `preview.js`。

## 7. Next actions

1. 决定是否提交 `feat/views`，以及 `feat/snack-name` 是否先合并到 `main`。
2. 把 `home` / `gallery` / `adopt` 接到 `handle.ts`，云函数改为调用读模型。页面把 `usePreviewData` 关掉。
3. 内容安全提交和回调（`KNOWN_ISSUES.md`）。

## 8. References

- Overview: PROJECT_OVERVIEW.md
- Architecture: ARCHITECTURE.md
- Known issues: KNOWN_ISSUES.md
- Plan: docs/superpowers/plans/2026-11-13-views.md
- Latest handoff: handoffs/
