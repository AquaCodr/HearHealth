const { chatHearingHealth } = require('../../utils/ai')

const FRIENDLY_ERROR = 'AI 助手暂时无法回复，请稍后重试。'

Page({
  data: {
    messages: [],
    inputValue: '',
    loading: false,
    retryContent: '',
    errorMessage: '',
    scrollTarget: '',
    suggestions: [
      '每天戴耳机多久合适？',
      '耳机音量多大比较安全？',
      '经常耳鸣需要注意什么？',
      '怎么减少噪声对听力的影响？'
    ]
  },

  onLoad() {
    this.messageSequence = 0
    this.pageActive = true
  },

  onUnload() {
    this.pageActive = false
  },

  onInput(event) {
    this.setData({ inputValue: event.detail.value })
  },

  onConfirm() {
    this.sendCurrentInput()
  },

  sendCurrentInput() {
    this.sendMessage(this.data.inputValue)
  },

  sendSuggestion(event) {
    this.sendMessage(event.currentTarget.dataset.question)
  },

  sendMessage(value) {
    if (this.data.loading) return
    const content = typeof value === 'string' ? value.trim() : ''
    if (!content) return

    const userMessage = this.createMessage('user', content)
    const messages = [...this.data.messages, userMessage]
    this.setData({
      messages,
      inputValue: '',
      loading: true,
      retryContent: '',
      errorMessage: '',
      scrollTarget: `message-${userMessage.id}`
    }, () => this.scrollTo('chat-loading'))
    this.requestAssistant(messages, content)
  },

  retryLastMessage() {
    if (this.data.loading || !this.data.retryContent) return
    this.setData({
      loading: true,
      errorMessage: '',
      scrollTarget: 'chat-loading'
    })
    this.requestAssistant(this.data.messages, this.data.retryContent)
  },

  requestAssistant(messages, retryContent) {
    const payload = messages.map(item => ({
      role: item.role,
      content: item.content
    }))
    chatHearingHealth(payload)
      .then(result => {
        if (!this.pageActive) return
        const reply = result && typeof result.reply === 'string' ? result.reply.trim() : ''
        if (!reply) throw new Error('empty assistant reply')
        const assistantMessage = this.createMessage('assistant', reply)
        this.setData({
          messages: [...this.data.messages, assistantMessage],
          loading: false,
          retryContent: '',
          errorMessage: '',
          scrollTarget: `message-${assistantMessage.id}`
        })
      })
      .catch(() => {
        if (!this.pageActive) return
        this.setData({
          loading: false,
          retryContent,
          errorMessage: FRIENDLY_ERROR,
          scrollTarget: 'chat-error'
        })
      })
  },

  createMessage(role, content) {
    this.messageSequence += 1
    return {
      id: `${Date.now()}-${this.messageSequence}`,
      role,
      content
    }
  },

  scrollTo(target) {
    wx.nextTick(() => {
      if (this.pageActive) this.setData({ scrollTarget: target })
    })
  }
})
