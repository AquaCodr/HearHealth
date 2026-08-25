// 技能详情页 —— 渲染 data/skills.js 中的开发者整理文章
const { SKILLS } = require('../../data/skills')

const FAV_STORAGE_KEY = 'skill_favs'

Page({
  data: {
    skill: null,
    relatedSkills: [],
    faved: false,
    notFound: false
  },

  onLoad(options) {
    this.skillId = options.id || ''
    this.loadSkill(this.skillId)
  },

  loadSkill(id) {
    const skill = SKILLS.find(s => s.id === id)
    if (!skill) {
      this.setData({ notFound: true, skill: null })
      return
    }
    // 相关技能：同分类下其余文章，最多 3 篇
    const related = SKILLS.filter(s => s.category === skill.category && s.id !== skill.id).slice(0, 3)
    wx.setNavigationBarTitle({ title: skill.category })
    this.setData({
      skill,
      relatedSkills: related,
      faved: this.getFavs().indexOf(skill.id) >= 0
    })
  },

  getFavs() {
    try {
      return wx.getStorageSync(FAV_STORAGE_KEY) || []
    } catch (e) {
      return []
    }
  },

  onToggleFav() {
    const { skill, faved } = this.data
    if (!skill) return
    const favs = this.getFavs().filter(id => id !== skill.id)
    if (!faved) favs.push(skill.id)
    try {
      wx.setStorageSync(FAV_STORAGE_KEY, favs)
    } catch (e) {
      // 存储异常时仅保留本次会话内的状态
    }
    this.setData({ faved: !faved })
    wx.showToast({ title: faved ? '已取消收藏' : '已收藏', icon: 'none' })
  },

  // 点击相关技能：就地切换文章并回到顶部
  onTapRelated(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.skillId) return
    this.skillId = id
    this.loadSkill(id)
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  onShareAppMessage() {
    const { skill } = this.data
    return {
      title: skill ? `护耳技能：${skill.title}` : '护耳技能库',
      path: `/pages/skill/detail?id=${this.skillId}`
    }
  }
})
