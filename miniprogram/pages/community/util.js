// 社区页面共享工具
function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return String(date || '')
  const pad = n => (n < 10 ? '0' + n : '' + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 统一封装社区云函数调用
function callCommunity(type, data = {}) {
  return wx.cloud.callFunction({
    name: 'communityFunctions',
    data: { type, ...data }
  }).then(res => {
    const r = res.result || {}
    if (r.success === false) {
      throw new Error(r.errMsg || '请求失败')
    }
    return r.data
  })
}

module.exports = { formatTime, callCommunity }
