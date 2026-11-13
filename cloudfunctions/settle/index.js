// 每分钟扫描 settlement_jobs：windowEndAt 已过且 status = 'pending'。
// 不扫 meal_records。漏餐靠任务在，不靠记录。
// 审核未终态时任务改成 waiting_review 或 manual_review，不改饥饿值。
// 打卡云函数不喂宠物。MealCompleted 不驱动结算。
exports.main = async () => {
  return { ok: false, error: 'not_implemented' }
}
