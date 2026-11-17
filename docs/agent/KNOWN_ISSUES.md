# Known Issues

> Confirmed problems only. Remove an entry when fixed (note the commit).

## 云函数没有数据层

- Symptom: `cloudfunctions/api` 和 `cloudfunctions/settle` 固定返回 `not_implemented`。
- Reproduce: 调用这两个入口。
- Tried: 未接数据库。这是还没做，不是规则冲突。
- Status: open。第 5 份计划。

## 页面没有在微信开发者工具里验收

- Symptom: 页面界面已按 `DESIGN.md` 做完，读 `miniprogram/utils/preview.js` 的样例数据。我只在 Chrome 里用自写的脚本把 wxml 近似渲染成 HTML 看过版面，那不是微信的渲染引擎。`wx:for`、`hover-class`、`picker`、`switch`、`navigator`、`env(safe-area-inset-bottom)`、`position: fixed` 在真机上的表现没有验证。
- Reproduce: 用微信开发者工具打开，给首页加启动参数 `state=living|peckish|hungry|critical|memorial|pasture|two-due|idle`。
- Tried: 静态检查（JSON、JS 语法、require 路径、资源引用、标签配对、class 和 data 字段都有来源）通过。
- Status: open

## 照片没有提交内容安全

- Symptom: `finishCheckin` 写入的照片永远是 `pending`，没有代码把它提交审核，也没有回调入口。线上一餐的照片 2 小时后会进入 `manual_review`，宠物冻结。
- Reproduce: 读 `app/checkin.ts` 的 `finishCheckin`；没有调用 `submitMedia` 或类似函数。
- Tried: `applyReview` 已经能收回调，窗口结束前也能收。缺的是提交和回调入口，在第 5 份计划任务 4。
- Status: open

## 没有 AppID 和云环境

- Symptom: `project.config.json` 是 `touristappid`，`wx.cloud.init` 没给 `env`，云开发用不了。
- Reproduce: 读 `project.config.json` 和 `miniprogram/app.js`。
- Tried: 无
- Status: open。真实值放 `project.private.config.json`，不入库。

## 手机 App 还没有任何代码

- Symptom: 分层已经为手机端留了边界，但没有手机端的存储适配器、入口和界面。手机本地没有云端定时器，结算要靠 App 启动、回到前台时调用 `runDueJobs`。
- Reproduce: 读 `ARCHITECTURE.md` 的「分层」。
- Tried: 无。这是还没做，不是缺陷。
- Status: open。做之前先写一份计划。

## DESIGN.md 与页面设计.md 的小差异

- Symptom: DESIGN.md 要求在「我的」里加「声音与震动」，已实现，但 `页面设计.md`（规划目录里）的「我的」页还没有这一行。
- Reproduce: 读 `DESIGN.md` 第 5.5 节，对照 `页面设计.md` 的「我的」页。
- Tried: 无
- Status: open（纯文档同步，页面和规则都已实现）
