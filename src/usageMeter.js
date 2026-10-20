import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'

/**
 * 模型调用记账：按天累计 token 与估算花费，落盘 data/usage.json。
 *
 * 计价单位是「元 / 百万 token」，按模型名匹配，未命中的型号用 default。
 * 这里的价格是本地估算值（方便看趋势），真实账单仍以 DeepSeek 后台为准。
 */
const PRICES = {
  default: { input: 2, output: 8, cacheRead: 0.5 },
  'deepseek-chat': { input: 2, output: 8, cacheRead: 0.5 },
  'deepseek-flash': { input: 0.5, output: 2, cacheRead: 0.1 },
  'deepseek-v4-flash': { input: 0.5, output: 2, cacheRead: 0.1 },
  'deepseek-v4-pro': { input: 4, output: 16, cacheRead: 1 },
}

const KEEP_DAYS = 30
const round = n => Math.round(n * 10000) / 10000

function dayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function createUsageMeter({ file, logger, prices = {} } = {}) {
  let store = { version: 1, days: {} }
  try {
    if (file && existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      if (parsed && typeof parsed === 'object' && parsed.days) store = parsed
    }
  } catch (err) {
    logger?.warn?.(`用量账本读取失败，按空账本继续：${err.message}`)
  }

  const priceFor = model => {
    const key = String(model ?? '').toLowerCase()
    return { ...PRICES.default, ...(PRICES[key] || {}), ...(prices[key] || {}) }
  }

  let saveTimer = null
  function save() {
    if (!file) return
    if (saveTimer) return
    // 合并短时间内的连续调用，避免每条回复都写盘
    saveTimer = setTimeout(() => {
      saveTimer = null
      try {
        mkdirSync(path.dirname(file), { recursive: true })
        const tmp = `${file}.tmp`
        writeFileSync(tmp, JSON.stringify(store, null, 2))
        renameSync(tmp, file)
      } catch (err) {
        logger?.warn?.(`用量账本写入失败：${err.message}`)
      }
    }, 1500)
    saveTimer.unref?.()
  }

  function record({ model, usage, label = '', provider = 'deepseek' } = {}) {
    if (!usage) return
    const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0
    const output = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0
    const cacheRead = Number(usage.prompt_cache_hit_tokens ?? usage.cache_read_input_tokens ?? 0) || 0
    if (input === 0 && output === 0) return
    const p = priceFor(model)
    const miss = Math.max(0, input - cacheRead)
    const cost = (miss * p.input + cacheRead * p.cacheRead + output * p.output) / 1e6

    const day = dayKey()
    const d = (store.days[day] ||= { date: day, calls: 0, input: 0, output: 0, cacheRead: 0, cost: 0, byModel: {} })
    const key = `${provider}:${model || 'unknown'}`
    const m = (d.byModel[key] ||= { calls: 0, input: 0, output: 0, cacheRead: 0, cost: 0, labels: {} })
    d.calls += 1; d.input += input; d.output += output; d.cacheRead += cacheRead; d.cost += cost
    m.calls += 1; m.input += input; m.output += output; m.cacheRead += cacheRead; m.cost += cost
    if (label) m.labels[label] = (m.labels[label] || 0) + 1

    // 只保留最近 KEEP_DAYS 天
    const keys = Object.keys(store.days).sort()
    while (keys.length > KEEP_DAYS) delete store.days[keys.shift()]

    save()
  }

  function today() {
    return store.days[dayKey()] || { date: dayKey(), calls: 0, input: 0, output: 0, cacheRead: 0, cost: 0, byModel: {} }
  }

  function summary(days = 7) {
    const all = Object.values(store.days).sort((a, b) => (a.date < b.date ? 1 : -1))
    const todayStat = today()
    const window = all.slice(0, days)
    return {
      today: {
        date: todayStat.date,
        calls: todayStat.calls,
        input: todayStat.input,
        output: todayStat.output,
        cacheRead: todayStat.cacheRead,
        cost: round(todayStat.cost),
      },
      days: window.map(d => ({ date: d.date, calls: d.calls, input: d.input, output: d.output, cost: round(d.cost) })),
      recentCost: round(window.reduce((sum, d) => sum + d.cost, 0)),
      byModel: Object.fromEntries(
        Object.entries(todayStat.byModel).map(([k, v]) => [k, { calls: v.calls, input: v.input, output: v.output, cost: round(v.cost) }]),
      ),
      note: '本地估算，按内置价格表折算；真实账单以服务商后台为准',
    }
  }

  return { record, summary, today, file }
}
