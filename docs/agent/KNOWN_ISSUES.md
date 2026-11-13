# Known Issues

> Confirmed problems only. Remove an entry when fixed (note the commit).

## 云函数没有数据层

- Symptom: `cloudfunctions/api` 和 `cloudfunctions/settle` 固定返回 `not_implemented`。
- Reproduce: 调用这两个入口。
- Tried: 未接数据库。这是还没做，不是规则冲突。
- Status: open

## 页面不能在模拟器里验收

- Symptom: 首页和打卡页只是结构，没有接领域规则。
- Reproduce: 用微信开发者工具打开。本轮没有打开。
- Tried: 无
- Status: open
