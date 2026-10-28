/**
 * 风控自保（"熔断器"）：QQ 对自动化账号的风控通常先表现为
 * "发送失败 / 频率限制 / 操作过于频繁" 这类错误。连续出现时继续硬发最容易升级成封禁，
 * 所以这里做三件事：
 *   1) 统计近期发送失败（按时间窗口），识别风控类错误；
 *   2) 达到阈值就**主动停发一段时间**（指数退避，最长 1 小时）；
 *   3) 把状态暴露给控制台，并支持手动解除。
 *
 * 注意：这不是"绕过检测"，也保证不了不封号；它只是让机器人别在已经被限流时继续加码，
 * 把"一次限流"控制在"一次限流"。
 */

const RISK_RE = /风控|风险控制|频率|发送过快|操作频繁|过于频繁|限制|敏感|违规|禁言|封禁|冻结|发送失败|retcode=12\d\d|retcode=1[0-9]{3}/i

export function isRiskError(message) {
  return RISK_RE.test(String(message ?? ''))
}

export function createRiskGuard({ config = {}, logger, now = Date.now } = {}) {
  const enabled = config.riskGuardEnabled !== false
  const windowMs = Math.max(60_000, config.riskWindowMs || 10 * 60_000)
  const threshold = Math.max(1, config.riskFailThreshold || 3)
  const basePauseMs = Math.max(60_000, config.riskPauseMs || 15 * 60_000)
  const maxPauseMs = Math.max(basePauseMs, config.riskMaxPauseMs || 60 * 60_000)

  let events = [] // { at, risk: boolean, message }
  let pausedUntil = 0
  let pauseCount = 0
  let totalSent = 0
  let totalFailed = 0
  let lastError = ''
  let lastPauseReason = ''

  function prune(t = now()) {
    events = events.filter((e) => t - e.at <= windowMs)
  }

  function recent() {
    prune()
    return events
  }

  function noteSuccess() {
    totalSent++
    // 成功一次就把风险计数减半：偶发失败不该一直累计成熔断
    const risk = events.filter((e) => e.risk)
    if (risk.length > 0) {
      let half = Math.floor(risk.length / 2)
      events = events.filter((e) => !e.risk || half-- <= 0)
    }
  }

  function noteFailure(err) {
    const message = String(err?.message || err || '发送失败')
    totalFailed++
    lastError = message.slice(0, 200)
    const risk = isRiskError(message)
    events.push({ at: now(), risk, message: lastError })
    prune()

    const list = events
    const riskCount = list.filter((e) => e.risk).length
    const failCount = list.length
    if (!enabled) return { paused: false }
    if (riskCount < threshold && failCount < threshold * 2) return { paused: false }

    // 连续触发就逐步拉长暂停时间，避免刚恢复又撞墙
    pauseCount += 1
    const duration = Math.min(maxPauseMs, basePauseMs * 2 ** (pauseCount - 1))
    pausedUntil = now() + duration
    lastPauseReason = risk
      ? `风控类错误 ${riskCount} 次：${lastError}`
      : `发送失败 ${failCount} 次：${lastError}`
    logger?.warn?.(`[风控自保] 暂停发送 ${Math.round(duration / 60000)} 分钟（${lastPauseReason}）`)
    events = []
    return { paused: true, duration, reason: lastPauseReason }
  }

  function paused() {
    return enabled && now() < pausedUntil
  }

  function remainingMs() {
    return Math.max(0, pausedUntil - now())
  }

  /** 恢复后重新计数，但保留"已经触发过几次"用于退避（success 不会重置 pauseCount） */
  function reset({ full = false } = {}) {
    events = []
    pausedUntil = 0
    if (full) { pauseCount = 0; totalFailed = 0; totalSent = 0; lastError = ''; lastPauseReason = '' }
  }

  function state() {
    const list = recent()
    return {
      enabled,
      paused: paused(),
      pauseUntil: pausedUntil || null,
      remainingMs: remainingMs(),
      pauseCount,
      windowMs,
      threshold,
      recentFailures: list.length,
      recentRisk: list.filter((e) => e.risk).length,
      totalSent,
      totalFailed,
      lastError,
      lastPauseReason,
    }
  }

  return { enabled, noteSuccess, noteFailure, paused, remainingMs, reset, state, isRiskError }
}
