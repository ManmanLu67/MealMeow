# Codemap

One line per directory you have actually opened. Path, then what it is for. No file inventories.

| Path | What it is |
|---|---|
| `docs/agent/` | 现状、产品规则、决定、交接。 |
| `domain/` | 不依赖微信的规则。 |
| `app/` | 对 `Store` 接口的命令：`handle.ts` 平台无关入口，用户同步、打卡、口粮、结算、审核回调、领养。`views.ts` 是首页、图鉴、领养的读模型，只读不写。接口在 `ports.ts`。 |
| `adapters/memory/` | `Store` 的内存实现。以后云数据库和手机本地库也放 `adapters/`。 |
| `test/` | 领域规则和命令的测试。`fixtures.ts` 是共用夹具。 |
| `miniprogram/` | 小程序页面壳。已打开首页和打卡页。 |
| `cloudfunctions/api/` | 页面云函数入口，未实现。 |
| `cloudfunctions/settle/` | 每分钟结算入口，未实现。 |
