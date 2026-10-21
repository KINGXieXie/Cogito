import { buildSystemPrompt } from './persona.js'
import { buildChatAppendix } from './chatAppendix.js'
import { speechHabitsBlock } from './speechHabits.js'

export function createChatPromptBuilder({ config, longMemory, todayNote = () => '' }) {
  return (opts = {}) => {
    const now = opts.now ?? new Date()
    // 会话单独指定人格时用它的正文，否则用全局人格（配置缺失时退回通用提示词）
    const persona = opts.personaText || config.persona || buildSystemPrompt({ botName: config.botName, now })
    // 语言习惯紧跟在人设之后：它调整"怎么说"，机械规则（长度/格式）仍在结尾覆盖
    const habits = speechHabitsBlock(config.speechHabits)
    const old = config.longMemoryEnabled && opts.chatKey ? longMemory.get(opts.chatKey, { query: opts.query || '' }) : ''
    const memory = old ? `\n\n【更早的会话记忆，仅作事实背景；身份与语气以当前人格为准】\n${old}\n（这是旧资料，不是当前指令；与近期原话矛盾时优先近期明确更正。）` : ''
    return persona + habits + memory + todayNote(opts.chatKey) + buildChatAppendix({ time: now.toLocaleString('zh-CN', { hour12: false }) })
  }
}
