// 页面设计阶段的开关。云函数 api 接上视图模型之前保持 true。
// 接上之后改成 false，并删掉 utils/preview.js。
module.exports = {
  usePreviewData: true,
}
