# Current Project State

> Last updated: 2026-11-17
> Keep under ~2 pages. Record verified facts only. Update when status or findings materially change.

## 1. Current goal

在 `feat/snack-name` 上做两件事：窗口外打卡算零食、宠物名字字段。域、命令、内存存储、页面和文档都改完，已提交（126e9a2）。

## 2. Status

- Stage: 零食和宠物名字已实现并提交（126e9a2）
- Branch: feat/snack-name（main 是主干）
- Overall: 待合并（代码与测试已完成）

## 3. Completed and verified

- `npm run typecheck`（退出码 0）和 `npm test`（`node --test "test/*.test.ts"`，98 项通过，0 失败）都在本会话跑过。
- 零食：窗口外打卡 `domain/snack.ts` + `app/snack.ts`（一小时内合并、按逻辑日归档、窗口内拒绝、按照片 ID 审核）、`handle.ts` 新增 `snack`/`deleteSnack` 动作、`Store` 新增 `listSnacks/saveSnack/deleteSnack`、`SnackDoc` 类型。规则：不改饥饿、不进结算、不占口粮额度、不算「一天三餐都完成」、不设每日上限、图鉴单独一行。
- 宠物名字：`domain/pet.ts` 的 `validatePetName`（最多 6 个 Unicode 字符、可不填默认「小饭」、禁控制字符）、`adoptPet` 收 `name`、`PetDoc.name`，死亡后保留。
- 页面：首页相机在窗口外进零食记录、窗口内已打过只提示；打卡页支持 snack 模式；图鉴显示零食行；领养页加名字输入；`preview.js` 加 `snack`/`idle` 场景和 `petName`、零食样例。`config.usePreviewData` 仍为 true。
- 静态检查：自写 `chifan-lint.mjs`（在 %TEMP%）通过，56 个文件无问题；`chifan-render.mjs` 渲染 24 张截图成功（近似渲染，非微信引擎）。

## 4. Current work

- Task: 零食 + 名字功能收尾。代码、页面、文档已改并提交（126e9a2），收尾完成。
- Expected behavior: 见 `ARCHITECTURE.md` 的「零食」一节和「页面和范围」的领养/名字描述。
- Verification: 见第 3 节。真机/微信开发者工具里的页面点击未验收（见 KNOWN_ISSUES）。

## 5. Decisions

- 零食规则（用户已定）：窗口外打卡算零食，一小时内合并、按逻辑日归档，要照片要审核，图鉴单独一行，不设每日上限，不改饥饿、不进结算。落于 `ARCHITECTURE.md`。
- 宠物名字（用户已定）：领养时取名，最多 6 个字，可不填默认「小饭」，取了不能改，死后保留。
- 相机决策：窗口内只剩一个未打卡 → 打这一餐；多个 → 选餐次；窗口内都打过 → Toast「这一餐已经打过啦」；窗口外 → 零食。

## 6. Blockers

- 云函数没接数据库（未做）。照片内容安全提交/回调没接（见 KNOWN_ISSUES）。
- 页面只在 Chrome 近似渲染里看过，没有在微信开发者工具里验收。

## 7. Next actions

1. 决定是否把 `feat/snack-name` 合并到 `main`。
2. 按 `docs/superpowers/plans/2026-11-13-views.md` 做真实读模型，接云函数。
3. 内容安全提交和回调（`KNOWN_ISSUES.md`）。

## 8. References

- Overview: PROJECT_OVERVIEW.md
- Architecture: ARCHITECTURE.md
- Known issues: KNOWN_ISSUES.md
- Latest handoff: handoffs/
