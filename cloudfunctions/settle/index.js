const cloud = require('wx-server-sdk')
const { runDueJobs } = require('../lib/app/settle.js')
const { createCloudStore } = require('../lib/adapters/cloud/cloud-store.js')
const { wxCloudDb } = require('../wx-db.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 定时器每分钟扫已到窗口的 pending 任务。规则在编译后的 runDueJobs 里。
exports.main = async () => {
  const store = createCloudStore(wxCloudDb(cloud.database()))
  const result = await runDueJobs(store, new Date())
  return { ok: true, settled: result.settled, frozen: result.frozen }
}
