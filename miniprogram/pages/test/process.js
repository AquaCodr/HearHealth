Page({
  data: {
    currentStep: 1,
    totalSteps: 3,
    steps: [
      { label: '准备', status: 'active' },
      { label: '左耳', status: 'pending' },
      { label: '右耳', status: 'pending' }
    ],
    preparationItems: [
      '确认耳机左右方向佩戴正确',
      '保持坐姿稳定，测试时不要说话',
      '设备音量处于舒适、较低的水平'
    ]
  },
  onLoad() {}
})
