/**
 * 注入路径（`agent/pre-step`）—— D14 拆分自 index.js（批 6 收尾，TD-008）。
 *
 * 本文件是插件的主路径：用户在一个 git 项目里开口谈开发任务时，把 roadbook 技能正文按内置
 * 「用户显式调用」的同一形状注入当前回合，使流程卡不依赖模型自觉。
 *
 * 压缩感知：注入消息被上下文压缩 shadow 出可见面后，本插件会在下一次 agent/pre-step 重新注入
 * （判据 = session.surface 上还在不在，不是「历史上注入过没有」）—— 否则长会话被压缩一次，
 * 后半程就再也拿不到流程卡。
 *
 * 读不到就不猜：读不到可见面退回日志去重（保守），读不到 cwd / 技能 / 会话头一律只记跳过。
 */
import { alreadyInjected, buildNote, hasGesture, hasInjectedMessage, isSubagentHeader, matchIntent, pickUserText, shortDigest, surfaceInjectionState } from './trigger.js'
import { createUserMessage, isUserInvocable, renderSkillContent } from './autoload-host.js'
import { errorText, sessionIdOf } from './autoload-runtime.js'

/**
 * 建 pre-step 处理器：返回 `(event, next) => decision`，与拆分前的注册形状逐字一致。
 *
 * `next()` 先跑（瀑布式），本插件只在它之后追加消息；插件自身任何意外都不许打断会话
 * （兜底返回下游决策 = 失败即不注入）。
 */
export function createPreStepHandler(env) {
  const { ctx, config, reporter, probes } = env
  const { reportSkip, reportError, writeReport } = reporter

  const handle = async ({ agent, messages, signal } = {}, decision, sessionId) => {
    if (decision?.kind === 'reject') {
      reportSkip('rejected', {}, sessionId)
      return decision
    }
    if (config.mode === 'off') {
      reportSkip('mode-off', { mode: config.mode }, sessionId)
      return decision
    }

    const session = agent?.session
    const header = session?.header
    if (header === undefined || header === null) {
      reportSkip('no-header', {}, sessionId)
      return decision
    }
    if (!config.includeSubagents && isSubagentHeader(header)) {
      reportSkip('subagent', { cwd: header.cwd }, sessionId)
      return decision
    }
    // 自进化 C 环：本会话若注入过，就顺路看一眼「到底有没有读卡」（只观测，不影响任何决策）
    probes.observeIdle(session, sessionId)
    // 压缩把之前注入的消息 shadow 出可见面之后，oncePerSession 不许再拦：拦了会话后半程就没有流程卡。
    // 判据问「模型还能不能看到」，不问「历史上有没有注入过」；只有读不到可见面时才退回旧的保守行为。
    const surface = surfaceInjectionState(session, config.skills)
    if (config.oncePerSession && surface === 'unavailable' && sessionId.length > 0 && probes.wasInjected(sessionId)) {
      reportSkip('once-per-session', { cwd: header.cwd, surface }, sessionId)
      return decision
    }

    const text = pickUserText(messages)
    if (text === undefined) {
      reportSkip('no-user-text', {}, sessionId)
      return decision
    }
    const hit = matchIntent(text, config)
    if (hit === undefined) {
      // 只记指纹与长度，不记原文：观测文件在共享临时目录、跨会话、永不清理，落原话等于把用户消息写在公共位置。
      reportSkip('no-hit', { textDigest: shortDigest(text), textLength: text.length }, sessionId)
      return decision
    }
    if (config.requireGitRoot && !probes.inGitProject(header.cwd)) {
      reportSkip('not-git', { cwd: header.cwd }, sessionId)
      return decision
    }
    // B10：开发会话顺路核一次 STATE.md 必填字段（只观测与告警，绝不改行为、绝不注入）
    probes.checkState(header.cwd, sessionId)

    const names = Array.isArray(config.skills) ? config.skills : []
    if (names.length === 0) {
      reportSkip('no-skill', { cwd: header.cwd, attempted: 0, mode: config.mode }, sessionId)
      return decision
    }
    if (hasGesture(text, names)) {
      reportSkip(
        'manual-gesture',
        { cwd: header.cwd, textDigest: shortDigest(text), textLength: text.length },
        sessionId,
      )
      return decision
    }

    let resolved = false
    let failed = false
    for (const skillName of names) {
      let skill
      try {
        skill = await ctx.skills.get(skillName, { cwd: header.cwd, signal, scope: agent })
      } catch (error) {
        failed = true
        reportError('skills.get', { skill: skillName, message: errorText(error) }, sessionId)
        continue
      }
      signal?.throwIfAborted?.()
      if (skill === undefined || skill === null || !isUserInvocable(skill)) continue
      resolved = true

      const skillSurface = surfaceInjectionState(session, skillName)
      const via = []
      if (hasInjectedMessage(decision.messages, skillName)) via.push('decision-messages')
      if (hasInjectedMessage(messages, skillName)) via.push('turn-messages')
      if (skillSurface === 'present') via.push('session-surface')
      // 日志兜底只在读不到可见面时生效：可见面已经说「被 shadow 掉了」时，日志里那条不算数。
      if (skillSurface === 'unavailable' && alreadyInjected(session, skillName)) via.push('session-log')
      if (via.length > 0) {
        probes.markInjected(sessionId)
        reportSkip('already-injected', { cwd: header.cwd, skill: skillName, via, surface: skillSurface }, sessionId)
        return decision
      }

      const digest = probes.digestOf(skill)
      let rendered
      try {
        rendered = renderSkillContent(skill)
      } catch (error) {
        // 渲染失败只跳过这个技能：不注入，也不打断会话。
        failed = true
        reportError('render', { skill: skillName, message: errorText(error) }, sessionId)
        continue
      }

      const content = [{ type: 'text', text: rendered }]
      if (config.note) {
        const note = buildNote({ skillName, hit, digest, expectedDigest: config.skillDigest })
        if (note.length > 0) content.push({ type: 'text', text: note })
      }

      let message
      try {
        message = createUserMessage({
          content,
          source: { kind: 'skill-invocation', name: skillName, form: 'instructions' },
        })
      } catch (error) {
        failed = true
        reportError('create-message', { skill: skillName, message: errorText(error) }, sessionId)
        continue
      }

      // 第二次及以后还能走到注入，只该有一种理由：上一次注入已不在可见面上（被压缩 shadow 掉）。
      const reinjected = skillSurface === 'absent' && sessionId.length > 0 && probes.wasInjected(sessionId)
      probes.markInjected(sessionId)
      // 起一个空转观察：从这一步开始数，看后面有没有真的读卡
      probes.startIdleWatch(sessionId)
      writeReport({
        event: 'inject',
        reason: reinjected ? 'reinject-shadowed' : 'first',
        surface: skillSurface,
        session: sessionId,
        cwd: header.cwd,
        skill: skillName,
        hit,
        digest,
        drift:
          typeof config.skillDigest === 'string' && config.skillDigest.length > 0 && config.skillDigest !== digest,
        note: config.note !== false,
        // 同上：观测里只留用户文本的指纹与长度，原文不出本进程。
        textDigest: shortDigest(text),
        textLength: text.length,
      })
      try {
        ctx.logger?.info?.(
          `[roadbook-autoload] 命中「${hit}」→ 已${reinjected ? '（压缩后）重新' : ''}加载 ${skillName}（会话 ${sessionId || '未知'}）`,
        )
      } catch {
        /* 日志是旁路 */
      }
      return {
        ...decision,
        messages: [...(decision.messages ?? []), message],
      }
    }

    // 已经记过 error 的，不再补一条会误导的 no-skill。
    if (!resolved && !failed) reportSkip('no-skill', { cwd: header.cwd, attempted: names.length, mode: config.mode }, sessionId)
    return decision
  }

  return async (event, next) => {
    const sessionId = sessionIdOf(event)
    let decision
    try {
      decision = await next()
    } catch (error) {
      reportError('next', { message: errorText(error) }, sessionId)
      throw error
    }
    try {
      return await handle(event ?? {}, decision, sessionId)
    } catch (error) {
      // 兜底：插件自身的任何意外都不许打断会话（失败即不注入）。
      reportError('handler', { message: errorText(error) }, sessionId)
      return decision
    }
  }
}
