# 吃饭喵

个人可见的三餐打卡小程序：先吃饭，宠物才有饭吃。

产品规则在 [docs/agent/ARCHITECTURE.md](docs/agent/ARCHITECTURE.md)，这是唯一的一份，其他文档不重复它。给 agent 的工作约定在 [AGENTS.md](AGENTS.md)。当前进度在 [docs/agent/CURRENT_STATE.md](docs/agent/CURRENT_STATE.md)。

## 目录

```
domain/           纯规则：时间、饭点、饥饿、结算、连续天数。只依赖自己
app/              命令层：用户、打卡、口粮、结算、审核回调、领养。接口在 ports.ts，平台无关入口在 handle.ts
adapters/         存储的具体实现。现在有内存实现，云数据库和手机本地库以后加在这里
miniprogram/      微信小程序页面
cloudfunctions/   微信云函数：api（页面入口）、settle（每分钟结算）
test/             domain、app、分层的测试
docs/agent/       现状、规则正文、决定（decisions/）、交接（handoffs/）
docs/superpowers/ 实现计划（plans/）
```

依赖方向只能向下：`miniprogram`、`cloudfunctions` → `adapters` → `app` → `domain`。`test/architecture.test.ts` 会检查它。

## 开发

```bash
npm install
npm test            # node --test "test/*.test.ts"
npm run typecheck   # tsc --noEmit
```

运行小程序：用微信开发者工具打开本目录。`project.config.json` 指向 `miniprogram/` 和 `cloudfunctions/`。AppID 和云环境 ID 放在被忽略的 `project.private.config.json`，不要提交。

## 还没接上

云函数里的数据库读写、内容安全、订阅消息、AI 抠图、手机 App。小组不在这个版本。
