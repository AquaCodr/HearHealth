// 护耳技能库 —— 官方指南（本地静态数据）+ 耳友妙招（云函数 tip 板块）
const { SKILLS, SKILL_CATEGORIES } = require('../../data/skills')
const { formatTime, callCommunity } = require('../community/util')

Page({
  data: {
    activeSource: 'developer',
    sourceTabs: [
      { key: 'developer', label: '官方指南' },
      { key: 'community', label: '耳友妙招' }
    ],
    // 分类筛选
    categories: [{ key: 'all', label: '全部' }, ...SKILL_CATEGORIES.map(c => ({ key: c, label: c }))],
    activeCategory: 'all',
    developerSkills: [],
    developerTotal: SKILLS.length,
    communitySkills: [],
    communityLoading: false,
    communityError: false,
    defaultAvatar: '/images/icons/avatar.png'
  },

  onLoad() {
    this.applyCategory('all')
  },

  onSelectSource(e) {
    const source = e.currentTarget.dataset.source
    const isValidSource = this.data.sourceTabs.some(item => item.key === source)
    if (!isValidSource || source === this.data.activeSource) return

    this.setData({ activeSource: source })
    // 首次切到耳友妙招时再拉取云端数据
    if (source === 'community' && !this.data.communitySkills.length) {
      this.loadCommunitySkills()
    }
  },

  onSelectCategory(e) {
    this.applyCategory(e.currentTarget.dataset.category)
  },

  applyCategory(category) {
    const filtered = category === 'all'
      ? SKILLS
      : SKILLS.filter(s => s.category === category)
    this.setData({
      activeCategory: category,
      developerSkills: filtered
    })
  },

  loadCommunitySkills() {
    this.setData({ communityLoading: true, communityError: false })
    callCommunity('listPosts', { tag: 'tip' })
      .then(list => {
        this.setData({
          communityLoading: false,
          communitySkills: list.map(p => ({ ...p, createTime: formatTime(p.createTime) }))
        })
      })
      .catch(() => {
        // 云函数未部署或环境异常时置空，展示空状态
        this.setData({ communityLoading: false, communitySkills: [], communityError: true })
      })
  },

  onPullDownRefresh() {
    const tasks = [this.applyCategory(this.data.activeCategory)]
    if (this.data.activeSource === 'community') {
      tasks.push(new Promise(resolve => {
        callCommunity('listPosts', { tag: 'tip' })
          .then(list => {
            this.setData({ communitySkills: list.map(p => ({ ...p, createTime: formatTime(p.createTime) })) })
            resolve()
          })
          .catch(() => resolve())
      }))
    }
    Promise.all(tasks).then(() => wx.stopPullDownRefresh())
  },

  onTapSkill(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/skill/detail?id=${id}` })
  },

  onTapCommunityPost(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/community/detail?id=${id}` })
  }
})
