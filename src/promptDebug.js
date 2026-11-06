/**
 * 提示词调试：把某一句话的"最终系统提示词"按段落拼出来，
 * 也可以付费试跑一次（只调用模型，不发送 QQ 消息）。
 *
 * 用途：改人格/语言习惯/规则后，先看拼出来的原文与字数，再决定要不要上线。
 */
import { createChatPromptBuilder } from './chatPrompt.js'
import { conversationRules } from './conversationRules.js'
import {
  planReply, shapeHint, decorationHint, shapeReply, measureText,
  asksForQuestion, asksForAnalysis,
} from './replyShape.js'
import { stickerHint } from './stickers.js'
import { shouldRecall, buildRecallNote } from './contextRecall.js'
import { isBookTopic } from './bookTopics.js'

export function createPromptDebugger({ config, longMemory, todayNote = () => '', recall = null, stickers = [], llm = null, logger }) {
  const buildPrompt = createChatPromptBuilder({ config, longMemory, todayNote })

  function sectionsFor({ chatKey = '', text = '' } = {}) {
    const plan = planReply({
      incomingLen: measureText(text),
      backlogLen: 0,
      maxLines: config.replyMaxLines,
      lineMaxChars: config.replyLineMaxChars,
      matchEnabled: config.replyLengthMatch,
      longForm: /背(?:一首|首|诗|课文|一段)|念(?:一首|首诗|诗)|朗诵|来一首|写一首|逐条|一条一条|完整地?(?:说|讲|列)/.test(text),
      analysis: asksForAnalysis(text),
      question: asksForQuestion(text),
      direct: true,
    })
    const base = buildPrompt({ chatKey, query: text })
    const rules = conversationRules(config)
    const shape = shapeHint(plan)
    const deco = decorationHint(false)
    const sticker = config.stickerEnabled ? stickerHint(stickers) : ''
    const bookHint = !String(chatKey).startsWith('p') && isBookTopic(text)
      ? '\n\n【本条是书籍/文学话题】群友在聊书、作家、诗或小说：可以自然地提一句你记得的细节或感受（像随口聊起），别列书单、别科普、别抢话。语气照旧，一条一条慢慢说。'
      : ''
    const atHint = config.atEnabled && String(chatKey).startsWith('g')
      ? '\n\n【@ 人（可选）】群里想具体叫某个人时，可以在回复开头写 [at:对方]（指刚才说话的人）或 [at:名字]；系统会换成真 @。别滥用、别 @ 全体，@ 了就要真的在跟对方说话。'
      : ''
    let recallNote = ''
    let recallFound = []
    try {
      if (recall && chatKey.startsWith('g') && config.recallEnabled && shouldRecall(text)) {
        recallFound = recall({ groupKey: chatKey, text, limit: config.recallMaxItems || 4, excludeNames: [config.botName] }) || []
        if (recallFound.length) recallNote = buildRecallNote(recallFound)
      }
    } catch (err) {
      logger?.warn?.(`提示词预览：旧事检索失败：${err.message}`)
    }
    const sections = [
      { name: '人格 + 语言习惯 + 长期记忆 + 今日备注 + 聊天附加说明', text: base },
      { name: '对话规则（安全/边界）', text: rules },
      { name: '本次形态要求（行数/字数）', text: shape },
      { name: '装饰符号说明', text: deco },
      { name: '表情包说明', text: sticker },
      { name: '@ 人说明', text: atHint },
      { name: '书籍话题说明', text: bookHint },
      { name: '旧事检索注入', text: recallNote },
    ].filter((s) => s.text)
    const prompt = sections.map((s) => s.text).join('')
    return {
      plan,
      sections: sections.map((s) => ({ name: s.name, chars: s.text.length, text: s.text })),
      chars: prompt.length,
      approxTokens: Math.round(prompt.length / 1.6),
      recallCount: recallFound.length,
      prompt,
    }
  }

  async function tryReply({ chatKey = '', text = '' } = {}) {
    if (!llm) throw Error('试跑需要模型客户端')
    const built = sectionsFor({ chatKey, text })
    const started = Date.now()
    const raw = await llm.chat(built.prompt, [{ role: 'user', content: text }], { maxTokens: config.maxTokens })
    const shaped = shapeReply(raw, built.plan)
    return {
      ...built,
      raw,
      shaped,
      elapsedMs: Date.now() - started,
      note: '这是一次真实模型调用（会产生费用），没有发送到 QQ。',
    }
  }

  return { sectionsFor, tryReply }
}
