# Current Project State

> Last updated: 2026-11-18
> Keep under ~2 pages. Record verified facts only. Update when status or findings materially change.

## 1. Current goal

界面已锁定，以 `miniprogram/` 现有页面为准。命令已能编译进云函数。下一步是云数据库适配器。不改页面。

## 2. Status

- Stage: 页面锁定。`handle.ts` 已有 `home`、`gallery`、`adoptView`。云函数仍返回 `not_implemented`
- Branch: feat/views
- Overall: `config.usePreviewData` 为 true，页面打开时读 `preview.js`

## 3. Completed and verified

- `npm test`：124 项通过，0 失败。`npm run typecheck` 退出码 0。`npm run build:cloud` 生成 `cloudfunctions/lib/`，`git status` 不列出该目录。`settle.js` 能被 CommonJS 加载。没有在微信开发者工具里打开过。
- 首页：动物图、食盘、口袋、相册、三张拍立得和物种相机按稿子的位置摆。当天已打卡且未驳回的照片留在首页。
- 图鉴：有吃到的日子是绿格；三餐都是打卡才有星。窗口内的空餐是白底，还没到窗口是灰底 `#F7F8F9`。空盘描边是同一张。口粮仍是刀叉格。
- 用户页：饭点、提醒、声音、隐私拆成四张图标卡片。
- 领养页标题是「请选择」。四个外观显示为猫、狗、鸟、鱼。预览里确认领养后，如果当时首页是抽象人，回到首页会改成对应动物。
- 首页未到打卡时间的餐卡是白底、灰色描边 `#6B6B6B`、灰字。已打卡仍是绿底，到点仍是黄底。
- 拍立得顶上有黄色图钉，卡片仍向左倾。口粮是束口布袋。没有宠物时，人和「领养」以及普通相机放在餐卡和底栏之间的正中。
- 食盘是稿子里那只盘子。打卡当时盛满丸子，之后按时间变淡，到下一顿饭点清空。口粮和零食不加。新的一餐打卡重新盛满这一盘，不会叠过稿子里的数量。
- 首页是抽象人时（没宠物、纪念、冷却），相机是 `camera-plain.png`：圆框加中间相机符号，没有动物。有宠物时仍用各物种相机。

## 4. Current work

- 云函数入口仍返回 `not_implemented`。编译产物还没被入口调用。
- 饭点相机改为可选待打的餐或零食。三餐打卡时间重合会被拒绝。

## 5. Decisions

- 宠物增加可选字段 `species`。旧档没有这个字段时按黑猫画。
- 图鉴的星只表示三餐都是打卡。有口粮或只打了一部分会是绿格，没有星。连续天数的算法没改。
- 打卡时段内和未到时段的空盘是同一张描边。白和灰差在格子的底色：白是 `#FFFFFF`，灰是 `#F7F8F9`。
- 三个物种相机沿用「相机/未到饭点」的圆和符号。鹦鹉从圆框背后探出头，露在右侧。
- 2026-11-18：界面锁定。饥饿、健康、等级留在首页左上角。
- 2026-11-18：饭点里点相机，可选还没打的那一餐，也可以另记零食。零食不代替这一餐。没有待打的餐时，相机直接记零食。
- 2026-11-18：三餐打卡时间不能重合。窗口仍是饭点前后 1 小时、左闭右开，恰好隔 2 小时允许。见 ADR-0003。

## 6. Blockers

- 云函数没有数据库适配器，入口返回 `not_implemented`。照片内容安全提交和回调没接。
- 页面没有在微信开发者工具里验收。`usePreviewData` 仍为 true。

## 7. Next actions

1. 云数据库适配器实现 `Store`，云函数改为调用编译后的 `handle`。内容安全仍后做。
2. 在微信开发者工具里看锁定后的页面。

## 8. References

- Overview: PROJECT_OVERVIEW.md
- Architecture: ARCHITECTURE.md
- Known issues: KNOWN_ISSUES.md
- Plan: docs/superpowers/plans/2026-11-13-views.md
- Latest handoff: handoffs/
