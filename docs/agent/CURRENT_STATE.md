# Current Project State

> Last updated: 2026-11-17
> Keep under ~2 pages. Record verified facts only. Update when status or findings materially change.

## 1. Current goal

首页按《首页 UI 规格》改版，在 `feat/views` 上。饥饿按下一餐饭点从 0% 涨到 100%，口粮停在 10%。健康把原来的饥饿值换成满分 100。等级是第一次打卡到现在的小时数开方，再减去已经结束的饥饿日，最低 0。数据卡在屏幕左边，三餐竖排在它右边。猫是圆角脸，耳朵是上窄下宽的圆角三角，耳根埋进头顶，各状态同一对。很饿、濒危只改眼睛和嘴。对照过参考 SVG。食盘收在猫的左下，不探出屏幕。情绪词贴在猫的右下。打卡照片是原图拍立得，图钉竖直，和食盘同一高度、离猫一截。口粮是束口口袋。没宠物时是线框抽象人。纪念标记是相册，点进去是纪念册页面，再点卡片进详情。预览参数记在不入库的 `docs/local/preview-states.md`。两餐同时待打只存在于预览 `state=two-due`。

## 2. Status

- Stage: 首页新版式和三行数值已写，未提交
- Branch: feat/views（从 feat/snack-name 的 7731f28 拉出；main 是主干）
- Overall: 工作区有未提交的读模型。feat/snack-name 仍停在 7731f28，可以单独合并

## 3. Completed and verified

- 本会话 `npm test`：116 项通过，0 失败。`npm run typecheck` 退出码 0。
- `homeView`：胶囊、红点、宠物区、状态词、名字、相机动作。审核未完成不留红点，也不改状态词。
- `galleryView`：连续天数用 `personalStreak` + `streakAnchor`。三格去掉隐藏和整餐驳回，口粮无图，一餐多张只留未驳回的。零食单独一行。可选日期只换当天的三格和零食，不改连续天数。
- `adoptView`：活着的宠物不能领养；冷却未结束也不能。

## 4. Current work

- Task: 首页按规格改版。餐卡、猫咪、食盘、相机、自定义底栏（第三项「用户」，仍打开原来的「我的」）已写。没宠物或宠物已死时主舞台是火柴人加「领养」。纪念是舞台右上角的图案，点开信息卡。
- 饥饿、健康、等级已有算法。结算时把当天饥饿档记在宠物的 `hungerLog` 上；扣级只算日期早于今天的记录。有点饿、很饿每天扣 1 级，濒危按当天结算餐数扣，吃饱和死亡不扣。情绪词跟饥饿百分比。预览数据是按场景写死的示例，不是实时时钟。数据卡在页面流的左上角，三餐在右侧同一行里竖排。猫、食盘、情绪词各自占位，不再叠在卡片上。
- 打卡后 30 分钟的食物和照片还没按时间计算。预览里只有 `state=idle` 能看到食盘有食物和一张照片。
- Verification: 测试见第 3 节。没有在微信开发者工具里打开过。`config.usePreviewData` 仍为 true。

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

1. 在微信开发者工具里看首页、图鉴、用户三个 Tab。健康用词等逻辑定了再定。
2. 把读模型接到 `handle.ts` 和云函数。内容安全仍未做。

## 8. References

- Overview: PROJECT_OVERVIEW.md
- Architecture: ARCHITECTURE.md
- Known issues: KNOWN_ISSUES.md
- Plan: docs/superpowers/plans/2026-11-13-views.md
- Latest handoff: handoffs/
