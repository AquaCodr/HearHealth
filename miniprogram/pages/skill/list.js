Page({
  data: {
    activeSource: 'developer',
    sourceTabs: [
      { key: 'developer', label: '开发者技能' },
      { key: 'community', label: '耳友妙招' }
    ],
    developerSkills: [],
    communitySkills: []
  },

  onSelectSource(e) {
    const source = e.currentTarget.dataset.source
    const isValidSource = this.data.sourceTabs.some(item => item.key === source)
    if (!isValidSource || source === this.data.activeSource) return

    this.setData({ activeSource: source })
  }
})
