Page({
  data: {
    greeting: '',
    todayHours: 1,
    todayMinutes: 35,
    threshold: 2,
    progressPercent: 0,
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

  onReady() {
    setTimeout(() => {
      this.drawProgressRing();
    }, 100);
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
    this.setData({ progressPercent });
  },

  drawProgressRing() {
    const ctx = wx.createCanvasContext('progressCanvas', this);
    const centerX = 50;
    const centerY = 50;
    const radius = 38;
    const lineWidth = 7;

    // 背景环（缺口在顶部，270度弧）
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.setStrokeStyle('#e8e8ed');
    ctx.setLineWidth(lineWidth);
    ctx.stroke();

    // 进度环
    const percent = this.data.progressPercent / 100;
    const startAngle = 0.75 * Math.PI;
    const endAngle = startAngle + percent * 1.5 * Math.PI;

    let progressColor = '#0066cc';
    if (this.data.healthStatus === 'warning') {
      progressColor = '#ff9500';
    } else if (this.data.healthStatus === 'danger') {
      progressColor = '#ff3b30';
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.setStrokeStyle(progressColor);
    ctx.setLineWidth(lineWidth);
    ctx.setLineCap('round');
    ctx.stroke();

    // 端点小圆点
    if (percent > 0.02 && percent < 0.98) {
      const dotX = centerX + radius * Math.cos(endAngle);
      const dotY = centerY + radius * Math.sin(endAngle);
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5, 0, 2 * Math.PI);
      ctx.setFillStyle(progressColor);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2.5, 0, 2 * Math.PI);
      ctx.setFillStyle('#ffffff');
      ctx.fill();
    }

    ctx.draw();
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
