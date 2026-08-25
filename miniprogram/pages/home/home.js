Page({
  data: {
    greeting: '',
    todayHours: 1,
    todayMinutes: 35,
    threshold: 2,
    progressPercent: 0,
    progressGradient: '',
    healthStatus: 'warning',
    healthText: '今天已戴耳机1h35min，建议摘下休息一会儿',
    healthDismissed: false,
    weekData: [
      { day: '一', hours: 1.2, status: 'normal' },
      { day: '二', hours: 2.5, status: 'warning' },
      { day: '三', hours: 0.8, status: 'normal' },
      { day: '四', hours: 3.1, status: 'danger' },
      { day: '五', hours: 1.7, status: 'normal' },
      { day: '六', hours: 2.2, status: 'warning' },
      { day: '日', hours: 1.6, status: 'normal' }
    ],
    maxWeekHours: 4,
    nearbyHospitals: [
      { name: '浙江大学医学院附属第一医院', address: '杭州市上城区庆春路79号', latitude: 30.2638, longitude: 120.1725, distance: '1.2km', department: '耳鼻喉科' },
      { name: '浙江大学医学院附属第二医院', address: '杭州市上城区解放路88号', latitude: 30.2578, longitude: 120.1680, distance: '2.5km', department: '耳鼻喉科' },
      { name: '杭州市第一人民医院', address: '杭州市上城区浣纱路261号', latitude: 30.2560, longitude: 120.1630, distance: '3.1km', department: '耳鼻喉科' }
    ]
  },

  onLoad() {
    this.setGreeting();
    this.calculateHealthStatus();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
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

  calculateHealthStatus() {
    const totalHours = this.data.todayHours + this.data.todayMinutes / 60;
    const threshold = this.data.threshold;
    const progressPercent = Math.min((totalHours / threshold) * 100, 100);

    // 按 PRD：<50%阈值=正常绿，50%-100%阈值=警告黄，>100%阈值=危险红
    let healthStatus = 'normal';
    if (totalHours > threshold) {
      healthStatus = 'danger';
    } else if (totalHours >= threshold * 0.5) {
      healthStatus = 'warning';
    }

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
    // 与 app.wxss 语义 token 保持一致：success #34c759 / warning #ffcc00 / danger #ff3b30
    switch (status) {
      case 'danger':
        return '#ff3b30';
      case 'warning':
        return '#ffcc00';
      default:
        return '#34c759';
    }
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
