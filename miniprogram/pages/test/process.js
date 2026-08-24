Page({
  data: {
    currentStep: 1,
    totalSteps: 3,
    steps: [
      { label: '准备', status: 'active' },
      { label: '左耳', status: 'pending' },
      { label: '右耳', status: 'pending' }
    ],
    currentEar: '',
    currentFrequency: 125,
    currentFrequencyIndex: 0,
    frequencies: [
      { value: 125, status: 'active' },
      { value: 250, status: 'pending' },
      { value: 500, status: 'pending' },
      { value: 1000, status: 'pending' },
      { value: 2000, status: 'pending' },
      { value: 4000, status: 'pending' }
    ],
    preparationItems: [
      '确认耳机左右方向佩戴正确',
      '保持坐姿稳定，测试时不要说话',
      '设备音量处于舒适、较低的水平'
    ]
  },

  onLoad() {},

  startLeftEar() {
    this.setData({
      currentStep: 2,
      currentEar: 'left',
      currentFrequency: this.data.frequencies[0].value,
      currentFrequencyIndex: 0,
      steps: [
        { label: '准备', status: 'complete' },
        { label: '左耳', status: 'active' },
        { label: '右耳', status: 'pending' }
      ]
    }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    })
  }
})
