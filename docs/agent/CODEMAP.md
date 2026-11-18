# Codemap

One line per directory you have actually opened. Path, then what it is for. No file inventories.

| Path | What it is |
|---|---|
| `docs/agent/` | 现状、产品规则、决定、交接。 |
| `domain/` | 不依赖微信的规则。`vitals.ts` 算饥饿百分比、健康分、等级和情绪词。 |
| `app/` | 对 `Store` 的命令。`handle.ts` 是入口，写操作和 `home`、`gallery`、`adoptView` 都从这里进。`views.ts` 只读。接口在 `ports.ts`。 |
| `adapters/memory/` | `Store` 的内存实现。以后云数据库和手机本地库也放 `adapters/`。 |
| `test/` | 领域规则和命令的测试。`fixtures.ts` 是共用夹具。 |
| `miniprogram/` | 小程序页面壳。三个 Tab，另有打卡、领养、纪念册和设置页。动物图在 `utils/pets.js`。 |
| `cloudfunctions/api/` | 页面云函数入口。动作名单与 `handle.ts` 一致，还没有数据库，全部返回未实现。 |
| `cloudfunctions/settle/` | 每分钟结算入口，未实现。 |
