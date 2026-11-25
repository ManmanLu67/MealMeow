# 首页口袋上的口粮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 有活着的宠物时，首页口袋一直显示本月剩余口粮；点口袋确认后，按窗口、是否已打、剩余次数决定记不记在本餐上。

**Architecture:** 顺序放在 `domain/meal.ts` 的纯函数里，首页只调用它。只有函数返回使用时，页面才调用现有 `exempt`。`useStaple` 的拒绝顺序不改。剩余次数由首页视图按换月规则算好再交给页面。

**Tech Stack:** TypeScript，`node --test`，微信小程序页面。领域代码经 `npm run build:local` 编译到 `miniprogram/generated/`。

**Spec:** `docs/superpowers/specs/2026-11-25-staple-bag-design.md`

## Global Constraints

- 口袋只在 `petView === 'living'` 时出现，位置仍是 `miniprogram/pages/home/home.wxss` 里 `.bag` 现在这块（`left: 40rpx; top: 444rpx`）。
- 数字在口袋右上角，表示本月剩余次数。每月 2 个，逻辑月 1 日 04:00 换月后回到 2，剩下的不累积。
- 确认框标题是「使用应急口粮？」，正文是「每月 2 个，剩下的不带到下个月。」按钮是「取消」和「使用」。
- 确认后的三句原文是「当前未在打卡时间」「已打卡」「已用完」。不调用口粮命令。
- 窗口是否罩住现在，按饭点前后 1 小时、左闭右开，和 `useStaple` 一样。已打或口粮的格子状态不是 `due`，不能靠「没有 due」判断。
- 没有恰好一餐的窗口罩住现在，包括两餐同时罩住，都显示「当前未在打卡时间」。
- 窗口里的那一餐已是打卡或口粮时，哪怕剩余是 0，也显示「已打卡」。
- 不在窗口时，哪怕剩余是 0，也显示「当前未在打卡时间」。
- 命令若拒绝，显示命令返回的 `error`，页面不自己把数字减 1。成功后重新拉首页。
- 正餐打卡页的口粮入口和报错不改。`app/checkin.ts` 的 `useStaple` 不改。
- 次数仍在用户上。没宠物、纪念、冷却中不显示口袋。

## Review Focus

- 窗口已过且这一餐已打过：显示「当前未在打卡时间」，不显示「已打卡」。测试在任务 1。
- 窗口里已打过且剩余是 0：显示「已打卡」，不显示「已用完」。测试在任务 1。
- 不在窗口且剩余是 0：显示「当前未在打卡时间」，不显示「已用完」。测试在任务 1。
- 库里的月份是上个月、剩余是 0：首页显示 2。测试在任务 2。
- 窗口里已打过的餐，`inWindow` 仍是 true。测试在任务 2。

---

### Task 1: 口粮确认顺序

**Files:**
- Modify: `domain/meal.ts`
- Modify: `domain/index.ts`
- Test: `test/domain.test.ts`

**Interfaces:**
- Consumes: `ChipState`、`MealType`、`MEALS`
- Produces:
  - `effectiveStapleLeft(now: Date, timeZone: string, storedMonth: string, storedLeft: number): number`
  - `stapleTap(chips: readonly { meal: MealType; state: ChipState; inWindow: boolean }[], stapleLeft: number): { action: 'block'; message: '当前未在打卡时间' | '已打卡' | '已用完' } | { action: 'use'; meal: MealType }`

- [ ] **Step 1: Write the failing test**

在 `test/domain.test.ts` 的 staple 描述里加这两条。从 `domain/index.ts` 引入 `effectiveStapleLeft` 和 `stapleTap`。

```ts
it('resets staple left when the stored month is over', () => {
  assert.equal(effectiveStapleLeft(new Date('2026-09-30T20:00:00Z'), SH, '2026-09', 0), 2)
  assert.equal(effectiveStapleLeft(new Date('2026-09-30T19:59:00Z'), SH, '2026-09', 0), 0)
})

it('chooses the staple sentence before calling the command', () => {
  const lunch = { meal: 'lunch' as const, state: 'due' as const, inWindow: true }
  const missed = { meal: 'breakfast' as const, state: 'missed' as const, inWindow: false }
  const later = { meal: 'dinner' as const, state: 'upcoming' as const, inWindow: false }
  assert.deepEqual(stapleTap([missed, lunch, later], 2), { action: 'use', meal: 'lunch' })
  assert.deepEqual(stapleTap([missed, lunch, later], 0), { action: 'block', message: '已用完' })
  assert.deepEqual(
    stapleTap([
      { meal: 'breakfast', state: 'checked_in', inWindow: false },
      { meal: 'lunch', state: 'checked_in', inWindow: false },
      later,
    ], 0),
    { action: 'block', message: '当前未在打卡时间' },
  )
  assert.deepEqual(
    stapleTap([
      missed,
      { meal: 'lunch', state: 'checked_in', inWindow: true },
      later,
    ], 0),
    { action: 'block', message: '已打卡' },
  )
  assert.deepEqual(
    stapleTap([
      missed,
      { meal: 'lunch', state: 'exempt', inWindow: true },
      later,
    ], 2),
    { action: 'block', message: '已打卡' },
  )
  assert.deepEqual(
    stapleTap([
      { meal: 'breakfast', state: 'due', inWindow: true },
      { meal: 'lunch', state: 'due', inWindow: true },
      later,
    ], 2),
    { action: 'block', message: '当前未在打卡时间' },
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "staple sentence|resets staple left" test/domain.test.ts`

Expected: FAIL，`effectiveStapleLeft` 或 `stapleTap` 未导出。

- [ ] **Step 3: Implement the two functions in `domain/meal.ts` and export them from `domain/index.ts`**

`effectiveStapleLeft`：`stapleMonth(now, timeZone) === storedMonth` 时返回 `storedLeft`，否则返回 `STAPLE_PER_MONTH`。

`stapleTap`：先收集 `inWindow === true` 的餐。不是恰好一餐，返回 `{ action: 'block', message: '当前未在打卡时间' }`。这一餐的 `state` 是 `checked_in` 或 `exempt`，返回 `{ action: 'block', message: '已打卡' }`。`stapleLeft <= 0`，返回 `{ action: 'block', message: '已用完' }`。否则返回 `{ action: 'use', meal }`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add domain/meal.ts domain/index.ts test/domain.test.ts
git commit -m "feat: decide the home staple prompt before using a ration"
```

### Task 2: 首页视图带上剩余次数和窗口

**Files:**
- Modify: `app/views.ts`（`HomeView` 与 `homeView`）
- Test: `test/views.test.ts`

**Interfaces:**
- Consumes: `effectiveStapleLeft`（任务 1）
- Produces: `HomeView.stapleLeft: number`；每个 chip 增加 `inWindow: boolean`

- [ ] **Step 1: Write the failing test**

在 `test/views.test.ts` 的 `home view` 描述里加一条。午饭窗口用 `2026-11-13T04:00:00.000Z`（上海 12:00，默认午饭 12:00）。

```ts
it('reports staple left for this month and whether the window is open', async () => {
  const now = new Date('2026-11-13T04:00:00.000Z')
  const store = await seededStore({ stapleMonth: '2026-10', stapleLeft: 0 })
  await store.saveRecord(record({
    date: '2026-11-13',
    meal: 'lunch',
    status: 'checked_in',
    review: 'passed',
    photoReviews: ['passed'],
    checkinAt: now.toISOString(),
  }))
  const view = await homeView(store, { userId: 'u' }, now)
  assert.equal(view.stapleLeft, 2)
  assert.equal(view.chips.find((chip) => chip.meal === 'lunch')?.state, 'checked_in')
  assert.equal(view.chips.find((chip) => chip.meal === 'lunch')?.inWindow, true)
  assert.equal(view.chips.find((chip) => chip.meal === 'breakfast')?.inWindow, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "reports staple left" test/views.test.ts`

Expected: FAIL，`stapleLeft` 或 `inWindow` 为空。

- [ ] **Step 3: Add the fields in `homeView`**

`stapleLeft` 用 `effectiveStapleLeft(now, user.timeZone, user.stapleMonth, user.stapleLeft)`。

每个 chip 的 `inWindow` 用该餐 `mealWindow`：`now >= window.start && now < window.end`。有打卡记录时也按这个算，不看格子状态。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add app/views.ts test/views.test.ts
git commit -m "feat: show this month's staple count on the home view"
```

### Task 3: 首页口袋和确认框

**Files:**
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/pages/home/home.wxss`
- Modify: `miniprogram/pages/home/home.js`
- Modify: `miniprogram/utils/preview.js`
- Modify: `docs/agent/ARCHITECTURE.md`（页面和范围里补一句首页口袋）
- Modify: `docs/agent/CURRENT_STATE.md`

**Interfaces:**
- Consumes: `stapleTap`（`miniprogram/generated/domain/meal.js`，与 `miniprogram/utils/remind.js` 同一条 require）；`HomeView.stapleLeft` 和 chip.`inWindow`（任务 2）；`api.call('exempt', { meal })`
- Produces: 活着的宠物首页上可点的口袋。无新导出。

- [ ] **Step 1: 编译领域代码，确认页面能 require 到 `stapleTap`**

Run: `npm run build:local`

Expected: 退出码 0。`miniprogram/generated/domain/meal.js` 导出 `stapleTap`。

- [ ] **Step 2: 口袋只在活着的宠物上，右上角是数字**

`home.wxml` 里现在的 `wx:if="{{showBag}}"` 改成 `petView === 'living'`。外包一层可点的 view，`bindtap="askStaple"`。数字是 `stapleLeft`，放在口袋右上角。

`home.wxss` 不改 `.bag` 的 left/top/宽高。数字用绝对定位贴在口袋右上角，白底、深色描边，字号能放下一位数。

`home.js` 的 `apply` 写入 `stapleLeft`，chip 带上 `inWindow`。删掉按「今天已用口粮」设置 `showBag` 的那行。

`preview.js` 的 `homeView` 返回 `stapleLeft: 2`。`chips()` 给每餐加 `inWindow: states[i] === 'due'`。

- [ ] **Step 3: 点口袋先确认，确认后再决定**

沿用首页提醒框那套 `.mask` 和 `.dialog`。`stapleDialog === 'ask'` 时标题「使用应急口粮？」，正文「每月 2 个，剩下的不带到下个月。」取消关闭，使用调用 `stapleTap(this.data.chips, this.data.stapleLeft)`。

返回 `block` 时，同一框改显示 `message`，只有「知道了」。返回 `use` 时 `api.call('exempt', { meal: result.meal })`。`res.ok` 就关掉并 `load()`。否则框里显示 `res.error`，不在本地把 `stapleLeft` 减 1。`usePreviewData` 时不调用命令：`use` 就关掉框。

不改 `miniprogram/pages/checkin/`。

- [ ] **Step 4: 核对页面没有再把「今天用过口粮」当成口袋出现的条件**

Run: `npm test` 然后 `npm run typecheck`

Expected: 测试通过，类型检查退出码 0。

在 `home.js` 里搜 `showBag`，应没有赋值。`home.wxml` 的口袋条件是 `petView === 'living'`。

- [ ] **Step 5: 把这句话写进产品规则和现状**

`docs/agent/ARCHITECTURE.md` 页面和范围：有活着的宠物时，首页舞台左侧的口袋一直在，右上角是本月剩余口粮。点口袋先确认。不在窗口显示「当前未在打卡时间」；窗口里已打过或用过口粮显示「已打卡」；剩余 0 显示「已用完」；否则才记在本餐上。打卡页的入口仍在。

`docs/agent/CURRENT_STATE.md` 用同样的事实更新「当前工作」，日期写 2026-11-25。这一步没有在微信开发者工具里点过，状态里不要写成已确认。

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/home/home.wxml miniprogram/pages/home/home.wxss miniprogram/pages/home/home.js miniprogram/utils/preview.js docs/agent/ARCHITECTURE.md docs/agent/CURRENT_STATE.md docs/superpowers/specs/2026-11-25-staple-bag-design.md
git commit -m "feat: ask before using a staple from the home bag"
```

`miniprogram/generated/` 已 gitignore，不加入提交。
