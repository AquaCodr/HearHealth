// 杭州医院数据库（GCJ-02坐标系，与微信定位/高德地图一致）
const HOSPITAL_DB = [
  // 市中心（上城区）
  { name: '浙江大学医学院附属第一医院(庆春院区)', address: '杭州市上城区庆春路79号', latitude: 30.255920, longitude: 120.177825, department: '耳鼻喉科' },
  { name: '浙江大学医学院附属第二医院(解放路院区)', address: '杭州市上城区解放路88号', latitude: 30.251172, longitude: 120.177439, department: '耳鼻喉科' },
  { name: '杭州市第一人民医院(湖滨院区)', address: '杭州市上城区浣纱路261号', latitude: 30.255273, longitude: 120.166749, department: '耳鼻喉科' },
  { name: '浙江大学医学院附属邵逸夫医院(庆春院区)', address: '杭州市上城区庆春东路3号', latitude: 30.256376, longitude: 120.202351, department: '耳鼻喉科' },
  { name: '杭州市第三人民医院', address: '杭州市上城区西湖大道18号', latitude: 30.245757, longitude: 120.179770, department: '耳鼻喉科' },
  { name: '浙江省中医院(湖滨院区)', address: '杭州市上城区邮电路54号', latitude: 30.252314, longitude: 120.165900, department: '耳鼻喉科' },
  { name: '杭州市第一人民医院(吴山院区)', address: '杭州市上城区严官巷34号', latitude: 30.230181, longitude: 120.168519, department: '耳鼻喉科' },
  { name: '浙江大学医学院附属妇产科医院(湖滨院区)', address: '杭州市上城区学士路1号', latitude: 30.256546, longitude: 120.168387, department: '耳鼻喉科' },
  { name: '杭州市红十字会医院(仁爱院区)', address: '杭州市拱墅区环城东路208号', latitude: 30.265493, longitude: 120.187065, department: '耳鼻喉科' },
  // 城北（拱墅区）
  { name: '浙江省人民医院(朝晖院区)', address: '杭州市拱墅区上塘路158号', latitude: 30.284640, longitude: 120.168161, department: '耳鼻喉科' },
  { name: '杭州市第一人民医院(城北院区)', address: '杭州市拱墅区景莘街50号', latitude: 30.351867, longitude: 120.173288, department: '耳鼻喉科' },
  { name: '树兰(杭州)医院', address: '杭州市拱墅区东新路848号', latitude: 30.328786, longitude: 120.174522, department: '耳鼻喉科' },
  // 城西/之江（西湖区）
  { name: '浙江医院(灵隐院区)', address: '杭州市西湖区灵隐路12号', latitude: 30.248959, longitude: 120.124832, department: '耳鼻喉科' },
  { name: '浙江大学医学院附属第一医院(之江院区)', address: '杭州市西湖区梧桐路366号', latitude: 30.145902, longitude: 120.100094, department: '耳鼻喉科' },
  // 滨江（滨江区）
  { name: '浙江大学医学院附属第二医院(滨江院区)', address: '杭州市滨江区江虹路1511号', latitude: 30.201344, longitude: 120.198023, department: '耳鼻喉科' },
  { name: '浙江大学医学院附属儿童医院(滨江院区)', address: '杭州市滨江区滨盛路3333号', latitude: 30.191132, longitude: 120.174389, department: '耳鼻喉科' },
  // 下沙（钱塘区）
  { name: '浙江大学医学院附属邵逸夫医院(钱塘院区)', address: '杭州市钱塘区下沙路368号', latitude: 30.301668, longitude: 120.315971, department: '耳鼻喉科' },
  // 萧山（萧山区）
  { name: '浙江大学医学院附属妇产科医院(钱江院区)', address: '杭州市萧山区济仁路368号', latitude: 30.218612, longitude: 120.257258, department: '耳鼻喉科' }
];

const { getSettings } = require('../../utils/app-settings');
const usageTracker = require('../../utils/usage-tracker');
const { calculateUsageRisk } = require('../../utils/usage-risk');

const USAGE_REFRESH_INTERVAL_MS = 30 * 1000;
const HEALTH_REMINDER_STORAGE_KEY = 'hearHealthDailyRiskReminder';

// 周几标签（getDay：0=周日，6=周六）
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function pad2(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatDuration(minutes) {
  if (!minutes) return '0分钟';
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}小时${remainder}分` : `${hours}小时`;
}

Page({
  data: {
    greeting: '',
    tipVisible: false,
    todayHours: 0,
    todayMinutes: 0,
    threshold: 2,
    healthReminder: true,
    progressPercent: 0,
    progressGradient: '',
    healthStatus: 'normal',
    healthText: '正在加载今天的应用内记录…',
    healthDismissed: false,
    locationDenied: false,
    weekData: [], // 近7天数据（今天在最右），由 loadUsageData 生成
    maxWeekHours: 4,
    nearbyHospitals: [
      { name: '浙江大学医学院附属第一医院(庆春院区)', address: '杭州市上城区庆春路79号', latitude: 30.255920, longitude: 120.177825, distance: '1.2km', department: '耳鼻喉科' },
      { name: '浙江大学医学院附属第二医院(解放路院区)', address: '杭州市上城区解放路88号', latitude: 30.251172, longitude: 120.177439, distance: '2.5km', department: '耳鼻喉科' },
      { name: '杭州市第一人民医院(湖滨院区)', address: '杭州市上城区浣纱路261号', latitude: 30.255273, longitude: 120.166749, distance: '3.1km', department: '耳鼻喉科' }
    ]
  },

  onLoad() {
    this.setGreeting();
    this.loadNearbyHospitals();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    // 设置可能刚在设置页改过；每次回到首页都读取最新配置。
    const settings = getSettings();
    this.setData({
      threshold: settings.reminderThreshold,
      healthReminder: settings.healthReminder
    }, () => {
      this.loadUsageData(true);
      this.startUsageRefreshTimer();
    });
  },

  onHide() {
    this.clearTipTimer();
    this.clearUsageRefreshTimer();
  },

  onUnload() {
    this.clearTipTimer();
    this.clearUsageRefreshTimer();
  },

  setGreeting() {
    const hour = new Date().getHours();
    let greeting = '';
    if (hour >= 6 && hour < 12) {
      greeting = '早上好';
    } else if (hour >= 12 && hour < 18) {
      greeting = '下午好';
    } else {
      greeting = '晚上好';
    }
    this.setData({ greeting });
  },

  // 今日圆环与本周概览共用一份数据：先读本地立即渲染，再异步拉云端合并刷新。
  // 数据来自前台时长追踪（见 utils/usage-tracker.js），按用户账号存在 usage_records 里。
  loadUsageData(refreshCloud = true) {
    const now = new Date();
    // 近7天：从6天前到今天，今天在最右边
    const todayKey = dateKeyOf(now);
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const startKey = dateKeyOf(startDate);

    const render = (days) => {
      const byKey = {};
      (days || []).forEach(record => { byKey[record.dateKey] = record; });

      const threshold = this.data.threshold || 1;
      let peakHours = 0;
      const weekData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dateKey = dateKeyOf(date);
        const isToday = i === 0;
        const record = byKey[dateKey];
        const seconds = record ? Number(record.seconds) || 0 : 0;
        const hours = Math.round((seconds / 3600) * 10) / 10;
        const minutes = Math.round(seconds / 60);
        peakHours = Math.max(peakHours, hours);
        // 与圆环、健康提示复用统一风险计算（见 utils/usage-risk.js）
        const risk = calculateUsageRisk(seconds, threshold);
        weekData.push({
          day: WEEK_LABELS[date.getDay()],
          dateLabel: `${date.getMonth() + 1}/${date.getDate()}`,
          hours,
          minutes,
          isToday,
          selected: false,
          status: risk.status
        });
      }

      const todaySeconds = (byKey[todayKey] && byKey[todayKey].seconds) || 0;
      const totalMinutes = Math.floor(todaySeconds / 60);
      const risk = calculateUsageRisk(todaySeconds, threshold);

      this.setData({
        todayHours: Math.floor(totalMinutes / 60),
        todayMinutes: totalMinutes % 60,
        weekData,
        maxWeekHours: Math.max(threshold, Math.ceil(peakHours * 10) / 10 || 0, 1),
        healthText: this.buildHealthText(todaySeconds, totalMinutes, risk)
      });
      this.calculateHealthStatus(risk);
      this.maybeShowHealthReminder(todayKey, risk);
    };

    render(usageTracker.getDays(startKey, todayKey));
    if (refreshCloud) {
      usageTracker.refreshRange(startKey, todayKey).then(render);
    }
  },

  buildHealthText(usageSeconds, totalMinutes, risk) {
    if (!usageSeconds) {
      return '今天还没有应用内记录，使用耳机时记得控制音量并适当休息';
    }
    const durationText = formatDuration(totalMinutes);
    if (risk.status === 'danger') {
      return `今日应用内记录时长${durationText}，当前时长较高，建议暂停使用耳机并充分休息`;
    }
    if (risk.status === 'warning') {
      return `今日应用内记录时长${durationText}，已达到提醒阈值，建议适当休息`;
    }
    return `今日应用内记录时长${durationText}，当前风险状态较低`;
  },

  // 轻点顶部问候卡片，显示 WHO 护耳小知识，3 秒后自动恢复
  toggleTip() {
    // 重复点击时先清掉上一次的定时器，避免提前收回或重复触发
    this.clearTipTimer();
    if (!this.data.tipVisible) {
      this.tipTimer = setTimeout(() => {
        this.tipTimer = null;
        this.setData({ tipVisible: false });
      }, 3000);
    }
    this.setData({ tipVisible: !this.data.tipVisible });
  },

  clearTipTimer() {
    if (this.tipTimer) {
      clearTimeout(this.tipTimer);
      this.tipTimer = null;
    }
  },

  calculateHealthStatus(risk) {
    const progressPercent = risk.progressPercent;
    const healthStatus = risk.status;
    const progressColor = this.getProgressColor(healthStatus);
    const progressDeg = (progressPercent / 100) * 270;
    // 270度圆环，缺口在顶部（CSS 角度：从 225deg 开始，顺时针 270deg 后回到 135deg）
    const progressGradient = `conic-gradient(from 225deg, ${progressColor} 0deg ${progressDeg}deg, #e8e8ed ${progressDeg}deg 270deg, transparent 270deg 360deg)`;

    // 进度条两端圆角：在首尾位置叠加与环同宽的小圆点（轨道半径 = 100rpx - 环粗/2）
    const ringWidth = 20;
    const radius = 100 - ringWidth / 2;
    const startRad = (225 * Math.PI) / 180; // 起点固定 225deg
    const capStartLeft = 100 + radius * Math.sin(startRad);
    const capStartTop = 100 - radius * Math.cos(startRad);
    const endRad = ((225 + progressDeg) * Math.PI) / 180;
    const capEndLeft = 100 + radius * Math.sin(endRad);
    const capEndTop = 100 - radius * Math.cos(endRad);

    // 灰色背景轨道末端圆角（固定 135deg 位置，即 225+270）
    const trackEndRad = (135 * Math.PI) / 180;
    const trackCapEndLeft = 100 + radius * Math.sin(trackEndRad);
    const trackCapEndTop = 100 - radius * Math.cos(trackEndRad);

    this.setData({
      progressPercent,
      progressGradient,
      progressColor,
      healthStatus,
      capStartLeft,
      capStartTop,
      capEndLeft,
      capEndTop,
      trackCapEndLeft,
      trackCapEndTop
    });
  },

  getProgressColor(status) {
    // 复用 app.wxss 语义 token，不在页面内创建新的颜色体系。
    switch (status) {
      case 'danger':
        return 'var(--color-danger)';
      case 'warning':
        return 'var(--color-warning)';
      default:
        return 'var(--color-success)';
    }
  },

  startUsageRefreshTimer() {
    this.clearUsageRefreshTimer();
    // 只读本地 tracker 镜像；云端仍由 tracker 原有节奏同步，并仅在 onShow 时主动拉取。
    this.usageRefreshTimer = setInterval(() => {
      this.loadUsageData(false);
    }, USAGE_REFRESH_INTERVAL_MS);
  },

  clearUsageRefreshTimer() {
    if (this.usageRefreshTimer) {
      clearInterval(this.usageRefreshTimer);
      this.usageRefreshTimer = null;
    }
  },

  getDailyReminderState(dateKey) {
    if (this.dailyReminderState && this.dailyReminderState.dateKey === dateKey) {
      return this.dailyReminderState;
    }
    try {
      const stored = wx.getStorageSync(HEALTH_REMINDER_STORAGE_KEY);
      if (stored && stored.dateKey === dateKey) {
        this.dailyReminderState = {
          dateKey,
          warningShown: Boolean(stored.warningShown),
          dangerShown: Boolean(stored.dangerShown)
        };
        return this.dailyReminderState;
      }
    } catch (error) {
      // Storage 不可用时仍使用当前页面实例的内存态去重。
    }
    this.dailyReminderState = { dateKey, warningShown: false, dangerShown: false };
    return this.dailyReminderState;
  },

  saveDailyReminderState(state) {
    this.dailyReminderState = state;
    try {
      wx.setStorageSync(HEALTH_REMINDER_STORAGE_KEY, state);
    } catch (error) {
      // 当前页面实例仍会通过 dailyReminderState 避免重复提醒。
    }
  },

  maybeShowHealthReminder(dateKey, risk) {
    if (!this.data.healthReminder || risk.status === 'normal') return;

    const state = this.getDailyReminderState(dateKey);
    let content = '';

    if (risk.status === 'danger' && !state.dangerShown) {
      state.dangerShown = true;
      // 首次载入就已超过 90% 时只提示更高等级，避免连续弹出两次。
      state.warningShown = true;
      content = '今日记录时长较高，建议暂停使用耳机并让耳朵充分休息。';
    } else if (risk.status === 'warning' && !state.warningShown) {
      state.warningShown = true;
      content = '今日记录时长已达到提醒阈值，建议适当休息。';
    }

    if (!content) return;
    this.saveDailyReminderState(state);
    wx.showModal({
      title: '用耳健康提醒',
      content,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 获取用户定位，计算最近3家医院
  loadNearbyHospitals() {
    wx.getLocation({
      type: 'gcj02', // 与医院数据库坐标系一致
      success: (res) => {
        const { latitude, longitude } = res;
        const withDistance = HOSPITAL_DB.map(h => ({
          ...h,
          distance: this.calculateDistance(latitude, longitude, h.latitude, h.longitude)
        }));
        withDistance.sort((a, b) => a.distance - b.distance);
        const nearest3 = withDistance.slice(0, 3).map(h => ({
          ...h,
          distance: h.distance < 1 ? `${Math.round(h.distance * 1000)}m` : `${h.distance.toFixed(1)}km`
        }));
        this.setData({ nearbyHospitals: nearest3, locationDenied: false });
      },
      fail: () => {
        // 用户拒绝授权或获取失败，降级显示默认3家
        const defaultHospitals = HOSPITAL_DB.slice(0, 3).map(h => ({
          ...h,
          distance: '——'
        }));
        this.setData({ nearbyHospitals: defaultHospitals, locationDenied: true });
      }
    });
  },

  // Haversine公式计算两点间直线距离（公里）
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  // 点击柱子，在顶部显示/隐藏具体时长（0时长柱子无数据，不响应）
  onTapBar(e) {
    const index = e.currentTarget.dataset.index;
    const target = this.data.weekData[index];
    if (!target || !target.minutes) return;
    const weekData = this.data.weekData.map((item, i) => ({
      ...item,
      selected: i === index ? !item.selected : false
    }));
    this.setData({ weekData });
  },

  dismissHealth() {
    // 卡片常驻，点击后仅隐藏"知道了"按钮（本次会话内），下次进入重新出现
    this.setData({ healthDismissed: true });
    wx.showToast({ title: '好的，注意护耳', icon: 'none', duration: 1500 });
  },

  goTest() {
    wx.navigateTo({ url: '/pages/test/guide' });
  },

  goSkill() {
    wx.navigateTo({ url: '/pages/skill/list' });
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' });
  },

  goHospital(e) {
    const { latitude, longitude, name, address } = e.currentTarget.dataset;
    wx.openLocation({
      latitude: Number(latitude),
      longitude: Number(longitude),
      name,
      address,
      scale: 18,
      fail: () => {
        wx.showToast({ title: '打开地图失败', icon: 'none' });
      }
    });
  }
});
