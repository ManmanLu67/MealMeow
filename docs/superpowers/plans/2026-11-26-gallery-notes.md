# 图鉴批注与照片期限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 图鉴里为每餐和每份零食写一段批注，月份只到本月和上月，照片在用户确认后再从过期月份删掉。

**Architecture:** 批注存在记录上，命令只改这一段文字和两个时间。图鉴读模型带上批注，并把月份夹在本逻辑月和上月。清照片从 `openLocal` 的默认路径拿掉，改由小程序在提示确认后单独调用。

**Tech Stack:** TypeScript，`node --test`，微信小程序。`npm run build:local` 后再跑页面。

**Spec:** `docs/superpowers/specs/2026-11-26-satiety-notes-design.md`

## Global Constraints

- 批注是 `{ text, createdAt, updatedAt }`，一段，上限 200 个 Unicode 字符。`text.trim()` 为空则删掉批注。只写过一次时页面只显示一个时间。
- 正餐多张照片共用一条。口粮没有批注。首页拍立得不显示批注。
- 图鉴月份是本逻辑月和上一个逻辑月。连续天数仍用全部历史。
- 说明文案是「图鉴只显示本月和上月的照片。更早的打卡还在，只是没有照片。」
- 月末提示文案是「N月的照片即将从图鉴去掉。打卡记录还在，可以先存进相册。」N 是即将离开的那个月。最后一天只提示不删。没确认过就不删文件。
- 这个「提示过哪个月」和第一次进入图鉴的标记存在本机，不进备份。旧备份没有批注时当作没有。
- 存相册沿用打卡页已有的 `wx.saveImageToPhotosAlbum` 和失败提示。保存当前大图，不关闭大图。

## Review Focus

- 空白批注会清掉时间，下一次再写重新记第一次。测试在任务 1。
- 201 个字符被拒绝，已有批注不变。测试在任务 1。
- 口粮不能写入批注。测试在任务 1。
- 请求上上个月的图鉴日期时，停在上月，不把连续天数截断。测试在任务 2。
- 普通打开不删除过期照片；确认之后才删。测试在任务 4。

---

### Task 1: 批注命令

**Files:**
- Create: `app/annotate.ts`
- Modify: `app/types.ts`
- Modify: `app/handle.ts`
- Test: `test/backup.test.ts`
- Test: `test/handle.test.ts`

**Interfaces:**
- Consumes: `Store.runExclusive`、`MealRecordDoc`、`SnackDoc`
- Produces:
  - `Annotation = { text: string; createdAt: string; updatedAt: string }`
  - `MealRecordDoc.note?: Annotation`，`SnackDoc.note?: Annotation`
  - `setAnnotation(store, caller, now, input: { kind: 'meal'; date: string; meal: MealType; text: string } | { kind: 'snack'; date: string; startedAt: string; text: string }): Promise<{ ok: true } | { ok: false; error: string }>`
  - 动作名 `annotate`。错误原文：`批注太长`、`无这条记录`、`口粮没有批注`。

- [ ] **Step 1: Write the failing test**

- 给一条有照片的正餐写「早饭」，`createdAt` 和 `updatedAt` 都是 `now`。再写「加菜」，`createdAt` 不变，`updatedAt` 用新的 `now`。
- 写入 `'   '` 后记录上没有 `note`。再写「又记」，`createdAt` 是这一次的 `now`。
- 201 个「字」返回 `批注太长`，原来的 `note` 还在。
- 口粮记录返回 `口粮没有批注`。没有的零食返回 `无这条记录`。
- 导出再导入后 `note.text` 仍是「早饭」。没有 `note` 的旧记录导入后仍没有 `note`。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "annotation|批注" test/handle.test.ts test/backup.test.ts`

Expected: FAIL，动作不存在。

- [ ] **Step 3: Implement `setAnnotation` and the `annotate` action**

字符数用 `[...text.trim()].length`。更新时保留原来的 `createdAt`。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/handle.test.ts test/backup.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/annotate.ts app/types.ts app/handle.ts test/handle.test.ts test/backup.test.ts
git commit -m "feat: store one annotation on a meal or snack"
```

---

### Task 2: 图鉴月份和批注读模型

**Files:**
- Modify: `app/views.ts`
- Modify: `app/retention.ts`
- Test: `test/views.test.ts`
- Test: `test/retention.test.ts`

**Interfaces:**
- Consumes: `note`、`stapleMonth`、`logicalDate`
- Produces:
  - `GalleryMeal.note` 和 `GallerySnack.note`：`Annotation | null`。口粮和没有批注的是 null。
  - `galleryView` 的 `earliestMonth` 永远是上一个逻辑月，不再是最早一条记录的月份。
  - 请求的日期所在月份早于上月或晚于本月时，改看上月 1 日或今天。
  - `purgeNotice(now: Date, timeZone: string, noted: string | null): { month: string; deleteNow: boolean } | null`

- [ ] **Step 1: Write the failing test**

- 上上个月有打卡、本月也有：`earliestMonth` 是上月，`streak` 仍把上上个月算进去（若那一天三餐都完成）。
- 请求上上个月的某一天：返回的餐格日期不早于上月 1 日。用视图里的月份或把请求夹住之后再读记录。断言 `galleryView` 不会去画上上个月的 `month` 日历：传入上上个月的 `month` 时，返回的 `calendar.key` 是上月。
- 有 `note` 的正餐和零食出现在 `meals` / `snacks` 的 `note.text` 上。口粮的 `note` 是 null。
- `purgeNotice` 不看库里有没有照片。最后一天的定义：逻辑日的下一天属于另一个 `YYYY-MM`。
  - `2026-11-30T15:00:00.000Z`（上海 11 月 30 日 23:00，仍是 11 月的最后一天）且 `noted` 不是 `'2026-10'`：`{ month: '2026-10', deleteNow: false }`。这里的月份是上一个逻辑月。`noted` 已是 `'2026-10'` 时返回 null。
  - `2026-11-30T20:00:00.000Z`（上海 12 月 1 日 04:00）且 `noted` 不是 `'2026-10'`：`{ month: '2026-10', deleteNow: true }`。这里的月份是上上个月，也就是已经掉出「本月和上月」的那一个月。`noted` 已是 `'2026-10'` 时仍返回 `{ month: '2026-10', deleteNow: true }`。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "gallery|purgeNotice" test/views.test.ts test/retention.test.ts`

Expected: FAIL

- [ ] **Step 3: Clamp the month and add `purgeNotice` in `app/retention.ts`**

月末当天提示的是上一个逻辑月，`deleteNow` 为 false。其他日子提示的是上上个月，`deleteNow` 为 true。本任务不删文件。连续天数的算法不改。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/views.test.ts test/retention.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/views.ts app/retention.ts test/views.test.ts test/retention.test.ts
git commit -m "feat: limit the gallery to two months and describe photo purge"
```

---

### Task 3: 图鉴页面上的批注、保存和说明

**Files:**
- Modify: `miniprogram/pages/gallery/gallery.wxml`
- Modify: `miniprogram/pages/gallery/gallery.wxss`
- Modify: `miniprogram/pages/gallery/gallery.js`
- Modify: `miniprogram/utils/api.js` 只在这一任务不改清照片；保存和批注走已有的 `call`。

**Interfaces:**
- Consumes: `annotate`、`GalleryMeal.note`、`GallerySnack.note`、`earliestMonth`
- Produces: 本机键 `galleryPhotoHint`。大图里有输入框、时间、「保存到相册」「完成」。

- [ ] **Step 1: 无自动化页面测试**

这一步不新增测试。任务 2 的读模型就是这一任务的契约。

- [ ] **Step 2: Run the gallery view test**

Run: `node --test --test-name-pattern "gallery" test/views.test.ts`

Expected: PASS

- [ ] **Step 3: Implement the gallery sheet**

点照片打开大图，不再一点就关。蒙层点下去关闭，并在关闭时用当前文字调用 `annotate`。`完成` 同样保存并关闭。`保存到相册` 调用 `wx.saveImageToPhotosAlbum`，成功提示「已存入相册」，失败文案抄 `miniprogram/pages/checkin/checkin.js` 里已有的相册失败提示。不关闭大图。

时间：`createdAt` 与 `updatedAt` 相同则只显示一行；不同则两行，分别是「写下」和「改过」，用设备本地的日期和时间。

月份行最右侧放一个信息图标。点击和第一次进入用同一段说明，`wx.showModal`，无取消按钮。第一次进入看 `galleryPhotoHint`，点确定后写成 `'1'`。若同一次进入还要月末提示，先关这一段，再出月末提示。月末提示由任务 4 的 `api.js` 弹出时，图鉴不要再弹一次相同的月末文案。

- [ ] **Step 4: Build**

Run: `npm run build:local`

Expected: 退出码 0

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/gallery
git commit -m "feat: edit a gallery note and save the photo"
```

---

### Task 4: 确认之后才删照片

**Files:**
- Modify: `app/local-session.ts`
- Modify: `app/handle.ts`
- Modify: `miniprogram/utils/api.js`
- Test: `test/local-session.test.ts`

**Interfaces:**
- Consumes: `purgeNotice`、`clearExpiredPhotos`
- Produces:
  - 动作 `photoPurge`，请求 `{ noted: string | null }`，返回 `{ notice: { month: string; deleteNow: boolean } | null }`。不删文件。
  - 动作 `purgePhotos`，调用现有 `clearExpiredPhotos`，返回被清掉的路径，和现在 `droppedPhotos` 一样由 `api.js` 删除本地文件。
  - 本机键 `photoPurgeNoted`，值是 `YYYY-MM`。

- [ ] **Step 1: Write the failing test**

在 `test/local-session.test.ts`：有上上个月照片时，普通 `home` 打开的 `droppedPhotos` 是空的，记录里的照片路径还在。随后 `purgePhotos` 的 `droppedPhotos` 含这些路径，记录里的照片被清空。没有过期照片时，`photoPurge` 在非月末返回 `notice: null`。月末当天即使没有照片，也返回 `deleteNow: false`，并且不改记录。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/local-session.test.ts`

Expected: FAIL，普通打开仍删掉了照片。

- [ ] **Step 3: Move deletion off the default open path**

`openLocal` 除 `purgePhotos` 外不再调用 `clearExpiredPhotos`。`photoPurge` 在 `deleteNow` 为 true 时，若 `clearExpiredPhotos` 一条路径都不会清，就返回 `notice: null`。`miniprogram/utils/api.js` 在一次成功的打开之后调用 `photoPurge`，把本机 `photoPurgeNoted` 传进去。返回的 `notice` 不是 null、且 `noted` 还不是这个 `month` 时，弹出无取消按钮的说明，正文用「N月的照片即将从图鉴去掉。打卡记录还在，可以先存进相册。」点确定后把 `photoPurgeNoted` 写成这个 `month`；仅当 `deleteNow` 为 true 时再调用 `purgePhotos` 并删除文件。`noted` 已经是这个 `month` 且 `deleteNow` 为 true 时，不再弹窗，直接 `purgePhotos`。

同一次打开不要弹两次。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/local-session.test.ts test/retention.test.ts`

Expected: PASS

Run: `npm test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/local-session.ts app/handle.ts miniprogram/utils/api.js test/local-session.test.ts docs/agent/CURRENT_STATE.md
git commit -m "feat: delete expired photos only after the month-end notice"
```

在 `CURRENT_STATE.md` 补一句：图鉴只有本月和上月，批注在记录上，过期照片要等月末提示确认后才删。
