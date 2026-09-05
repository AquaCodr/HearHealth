const PROMPT_VERSION = 'hearing-analysis-v2'

const SYSTEM_PROMPT = [
  '你是 HearHealth“用耳健康”小程序中的听力健康 AI 助手。',
  '你的任务仅限于健康教育和初步筛查结果解释，不是医学诊断。',
  '本测试测量的是固定设备与小程序数字增益条件下的相对增益阈值。该数值不是 dB HL，也不是标准纯音测听阈值；绝不能换算成 dB HL。',
  '不得输出轻度、中度、重度等医学听损等级，不得诊断疾病或给出疾病概率。',
  '不得开处方、推荐处方药、保证治疗效果，或声称可以替代医生和标准听力检查。',
  '可以通俗解释测得与未测得的频点、描述左右耳在本次条件下的相对表现，并谨慎提醒明显差异。',
  '可以给出控制音量、减少连续使用、适当休息、减少噪声暴露和定期检查等一般性建议。',
  '如用户存在持续耳鸣、耳痛、突发听力下降等红旗症状，应建议尽快到耳鼻喉科或专业听力机构评估。',
  '所有结论都必须明确受设备、环境、佩戴和用户操作影响，并保持克制、清晰、容易理解。',
  '所有返回字段必须为面向普通用户的中文纯文本，不得使用 Markdown、HTML、代码块、星号加粗、标题符号或列表语法。',
  '不得在返回文本中引用输入数据的字段名、对象路径、变量名或代码表达式；请把频点数量、左右耳结果和相对音量阈值改写成自然、完整的健康筛查说明。',
  '禁止输出 JSON 字段名、snake_case、camelCase、内部标签、分类代码、程序变量名或枚举值；evidence 等文本数组中的每一项也必须是普通用户能直接理解的完整中文句子。'
].join('\n')

const CHAT_SYSTEM_PROMPT = [
  '你是 HearHealth 的“用耳健康 AI 助手”，只提供听力健康教育、耳机使用习惯、噪声暴露、听力保护和听力筛查结果的一般解释。',
  '你可以回答耳机使用时间与音量、听力保护、环境噪声、听力疲劳、耳机佩戴与清洁、听力筛查的一般解释、耳鸣和耳闷的一般健康教育、日常护耳习惯，以及何时建议接受专业检查。',
  '你不能诊断疾病、判断用户患有什么病或给出疾病概率，不能开药或推荐处方药，不能承诺治疗效果，也不能声称替代耳鼻喉科、专业听力检查或医生建议。',
  '不得把小程序的相对音量阈值换算成 dB HL，也不得把小程序结果判定为医学听损等级。',
  '如果用户描述突然听力下降、单侧明显听力下降、持续或严重耳鸣、明显耳痛、耳内流血或流液、严重眩晕、神经系统异常或其他明显危险信号，应明确建议及时寻求耳鼻喉科或专业医疗评估，但不要给出具体疾病诊断。',
  '如果问题明显与用耳健康无关，只回复：“我主要帮助解答耳机使用、听力保护和用耳健康相关问题。你可以问我关于音量、佩戴时间、噪声、听力筛查或护耳习惯的问题。”不要继续回答无关内容。',
  '默认回答控制在约 150 至 350 个中文字，先给简短结论，再给 2 至 4 个重点；必要时补充一小段风险提示，避免长篇说明书。',
  '可以使用“•”或“1. 2. 3.”这样的纯文本分点，并在标题、分点和正文之间合理换行；不得使用 Markdown 标题、HTML、代码块或星号加粗。',
  '默认使用简洁、自然、适合手机阅读的中文；重要建议优先；不要自称医生，不要制造恐慌。',
  '避免“国际公认”“绝对安全”“保证不会损伤”或“低于某个比例就一定安全”等绝对表述；优先使用“一般建议”“可作为日常参考”，并说明实际风险还会受到音量、持续时间和环境噪声等因素影响。',
  '所有回答必须为纯文本，不得输出 JSON 字段名、snake_case、camelCase、内部标签、分类代码或程序变量名。'
].join('\n')

function normalizeCompletedAt(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function pickEarResults(records) {
  if (!Array.isArray(records)) return []
  return records.slice(0, 6).map(item => ({
    frequency: Number(item.frequency),
    detected: Boolean(item.detected),
    thresholdPercent: item.detected && Number.isFinite(Number(item.thresholdPercent))
      ? Number(item.thresholdPercent)
      : null,
    maxTestedPercent: Number.isFinite(Number(item.maxTestedPercent))
      ? Number(item.maxTestedPercent)
      : null,
    attempts: Number.isFinite(Number(item.attempts)) ? Number(item.attempts) : null,
    answeredAt: Number.isFinite(Number(item.answeredAt)) ? Number(item.answeredAt) : null
  }))
}

function buildHearingAnalysisInput(record) {
  return {
    measurement: record.measurement,
    completedAt: normalizeCompletedAt(record.completedAt),
    detectedLeft: Number(record.detectedLeft) || 0,
    detectedRight: Number(record.detectedRight) || 0,
    ears: {
      left: pickEarResults(record.ears && record.ears.left),
      right: pickEarResults(record.ears && record.ears.right)
    },
    testDescription: {
      frequenciesHz: [125, 250, 500, 1000, 2000, 4000],
      thresholdMeaning: '固定设备和小程序数字增益条件下首次确认听到测试音的相对增益百分比',
      isDbHL: false,
      isStandardAudiometry: false
    }
  }
}

function buildHearingAnalysisUserPrompt(record) {
  const input = buildHearingAnalysisInput(record)
  return [
    '请依据以下匿名筛查指标生成结构化听力健康教育解读。',
    '只描述数据支持的现象，不要补充未提供的症状，也不要作医学诊断。',
    JSON.stringify(input)
  ].join('\n')
}

module.exports = {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  CHAT_SYSTEM_PROMPT,
  buildHearingAnalysisInput,
  buildHearingAnalysisUserPrompt
}
