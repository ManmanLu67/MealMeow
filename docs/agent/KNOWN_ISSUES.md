# Known Issues

> Confirmed problems only. Remove an entry when fixed (note the commit).

## 云函数还没在云端跑过

- Symptom: 入口已经调用编译后的 `handle` 和 `runDueJobs`，但仓库里没有云环境 ID。页面仍读预览数据，没有打到这两个云函数。
- Reproduce: 读 `miniprogram/utils/config.js` 的 `usePreviewData`，以及 `miniprogram/app.js` 的 `wx.cloud.init`。
- Tried: 适配器和入口用假数据库测过。没有上传云函数，也没有建集合。
- Status: open。有云环境后再接页面。

## 内容安全还没在微信里跑过

- Symptom: 提交和回调的代码已经有了，但云函数没上传，也没有配置 `MEAL_MEDIA_TOKEN`。没有这个令牌时，回调签名会被拒绝。
- Reproduce: 读 `cloudfunctions/api/index.js`。令牌不在仓库里。
- Tried: `test/media-check.test.ts` 用假的提交函数测过。没有请求微信。
- Status: open。有云环境后再配令牌并上传。

## 没有 AppID 和云环境

- Symptom: `project.config.json` 是 `touristappid`，`wx.cloud.init` 没给 `env`，云开发用不了。
- Reproduce: 读 `project.config.json` 和 `miniprogram/app.js`。
- Tried: 无
- Status: open。真实 AppID 在本机 `project.config.json`，不入库。

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
