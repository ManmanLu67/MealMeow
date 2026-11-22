# Project Overview

> Update only on major changes (goals, modules, entry points).

## Purpose

给本人用的三餐打卡小程序。窗口内打卡或使用应急口粮，窗口结束后结算，个人宠物才会吃到或挨饿。照片和记录只给自己看。

## Main modules

| Module | Path | Responsibility |
|---|---|---|
| 领域规则 | `domain/` | 时间、饭点、饥饿、结算、连续天数。不碰微信。 |
| 命令层 | `app/` | 用户、打卡、口粮、零食、结算、审核回调、领养，以及首页、图鉴、领养、用户页、纪念册的读模型。只依赖 `domain/` 和 `app/ports.ts`。 |
| 适配器 | `adapters/` | `Store` 的内存实现和云数据库实现。云侧另有内容安全提交和签名校验。 |
| 小程序 | `miniprogram/` | 页面壳。三个 Tab，外加打卡、领养、纪念册、饭点、提醒、声音与震动、关于。`usePreviewData` 为 true 时读预览；关掉后用户页、纪念册和打卡走云函数，打卡前先上传云存储。 |
| 云函数 | `cloudfunctions/api`、`cloudfunctions/settle` | 页面入口调 `handle`，定时结算调 `runDueJobs`。库是 `adapters/cloud/`。还没上传到云端。 |
| 给 agent 的说明 | `docs/agent/` | 现状、规则正文、决定、交接。 |

## Entry points

- 小程序：微信开发者工具打开仓库根目录。
- 测试和类型检查：`npm test`、`npm run typecheck`。
- 云函数编译：`npm run build:cloud`，产物在被忽略的 `cloudfunctions/lib/`。

## Glossary

术语和已经定死的规则在 `ARCHITECTURE.md`。
