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
    healthVisible: true,
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
      { name: '浙江大学医学院附属第一医院', distance: '1.2km', department: '耳鼻喉科' },
      { name: '浙江大学医学院附属第二医院', distance: '2.5km', department: '耳鼻喉科' },
      { name: '杭州市第一人民医院', distance: '3.1km', department: '耳鼻喉科' }
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

    let healthStatus = 'normal';
    if (progressPercent >= 80) {
      healthStatus = 'danger';
    } else if (progressPercent >= 50) {
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

    this.setData({
      progressPercent,
      progressGradient,
      progressColor,
      healthStatus,
      capStartLeft,
      capStartTop,
      capEndLeft,
      capEndTop
    });
  },

  getProgressColor(status) {
    switch (status) {
      case 'danger':
        return '#ff3b30';
      case 'warning':
        return '#ff9500';
      default:
        return '#0066cc';
    }
  },

  dismissHealth() {
    this.setData({ healthVisible: false });
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
    const name = e.currentTarget.dataset.name;
    wx.showToast({ title: `导航到${name}`, icon: 'none' });
  }
});
