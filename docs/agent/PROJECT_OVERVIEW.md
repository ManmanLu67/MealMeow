# Project Overview

> Update only on major changes (goals, modules, entry points).

## Purpose

给本人用的三餐打卡小程序。窗口内打卡或使用应急口粮，窗口结束后结算，个人宠物才会吃到或挨饿。照片和记录只给自己看。

## Main modules

| Module | Path | Responsibility |
|---|---|---|
| 领域规则 | `domain/` | 时间、饭点、饥饿、结算、连续天数。不碰微信。 |
| 命令层 | `app/` | 用户、打卡、口粮、结算、审核回调、领养。只依赖 `domain/` 和 `app/ports.ts`。 |
| 适配器 | `adapters/` | `Store` 的具体实现。现在只有内存实现。 |
| 小程序 | `miniprogram/` | 页面壳。三个 Tab，外加打卡、领养、饭点、提醒、关于。 |
| 云函数 | `cloudfunctions/api`、`cloudfunctions/settle` | 页面入口和定时结算。都还没接数据库。 |
| 给 agent 的说明 | `docs/agent/` | 现状、规则正文、决定、交接。 |

## Entry points

- 微信开发者工具打开仓库根目录。`project.config.json` 指向 `miniprogram/` 和 `cloudfunctions/`。
- 测试：`npm test`。类型检查：`npm run typecheck`

## How to run / test

- Run: 微信开发者工具
- Test: `npm test`

## Glossary

术语和已经定死的规则在 `ARCHITECTURE.md`。
