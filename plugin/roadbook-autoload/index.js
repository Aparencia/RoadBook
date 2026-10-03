/**
 * roadbook-autoload —— Roadbook V6 开发流程母版的自动加载插件（Host 半区）。
 *
 * 作用：用户在一个 git 项目里开口谈开发任务时，把 roadbook 技能正文按内置
 * 「用户显式调用」的同一形状注入当前回合，使流程卡不依赖模型自觉。
 *
 * 分工：门控与文案等纯逻辑在 ./trigger.js（不 import dsh 包，可离线单测）；
 * 本文件只做 Host 侧接线：读会话、查技能、注入消息、落观测。
 *
 * 依赖：@deepseek-ai/dsh-llm / dsh-skill / schemastery 由宿主提供，见 package.json
 * 的 peerDependencies —— 插件内不下载、不打包，宿主大版本升级后要重新核对。
 *
 * 观测：自进化 A 环默认开启 —— 每个分支（inject / skip / error）都往
 * <os.tmpdir()>/roadbook-autoload.jsonl 追加一行 JSONL；观测是旁路，写失败只吞自己，
 * 绝不影响会话（同理，渲染或建消息失败也只跳过该技能）。
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { isUserInvocable, renderSkillContent } from '@deepseek-ai/dsh-skill'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_KEYWORDS,
  DEFAULT_SUPPRESS,
  alreadyInjected,
  buildNote,
  hasGesture,
  hasInjectedMessage,
  isSubagentHeader,
  matchIntent,
  pickUserText,
  shortDigest,
} from './trigger.js'

export const name = 'roadbook-autoload'

/** skills 用来解析技能正文；agents 提供 agent/pre-step 事件。 */
export const inject = ['agents', 'skills']

/** 观测文件缺省名（放在 os.tmpdir() 下，任何系统都可写）。 */
const DEFAULT_REPORT_FILE = 'roadbook-autoload.jsonl'

export const Config = z.object({
  /** 要自动加载的技能名（按序取第一个能解析的）。 */
  skills: z.array(z.string()).default(['roadbook']),
  /** keyword：命中关键词注入；always：只要是 git 项目里的用户消息就注入；off：完全关闭。 */
  mode: z.union([z.const('keyword'), z.const('always'), z.const('off')]).default('keyword'),
  keywords: z.array(z.string()).default(DEFAULT_KEYWORDS),
  suppressKeywords: z.array(z.string()).default(DEFAULT_SUPPRESS),
  /** 子代理会话是否也注入，默认不注入。 */
  includeSubagents: z.boolean().default(false),
  /** 只在本会话位于 git 项目内时注入。 */
  requireGitRoot: z.boolean().default(true),
  /** 一次会话只注入一次。 */
  oncePerSession: z.boolean().default(true),
  /** 在技能正文后附一行透明说明（为什么加载、怎么关）。 */
  note: z.boolean().default(true),
  /** 自进化 A 环：观测是否落盘，默认开（注入/跳过/报错都记一行）。 */
  report: z.boolean().default(true),
  /** 自进化 A 环：观测记录（JSONL）落盘路径，空 = <os.tmpdir()>/roadbook-autoload.jsonl。 */
  reportPath: z.string().default(''),
  /** 自进化 B 环：SKILL.md 指纹基线，对不上就在说明里提示技能已更新。 */
  skillDigest: z.string().default(''),
})

export function apply(ctx, config = {}, runtime = {}) {
  const injectedSessions = new Set()
  const gitRoots = new Map()
  const digests = new Map()
  const reportedSkips = new Set()
  const home = typeof runtime?.home === 'string' && runtime.home.length > 0 ? runtime.home : homedir()
  const reportEnabled = config?.report !== false
  const reportFile =
    typeof config?.reportPath === 'string' && config.reportPath.trim().length > 0
      ? config.reportPath.trim()
      : join(tmpdir(), DEFAULT_REPORT_FILE)
  let advertised = false

  /** 观测是旁路：任何失败都只吞自己，绝不打断会话。 */
  const writeReport = (entry) => {
    if (!reportEnabled) return
    try {
      appendFileSync(reportFile, `${JSON.stringify({ time: new Date().toISOString(), file: reportFile, ...entry })}\n`, 'utf8')
    } catch {
      return
    }
    if (advertised) return
    advertised = true
    try {
      ctx.logger?.info?.(`[roadbook-autoload] 观测记录 → ${reportFile}`)
    } catch {
      /* 日志同样是旁路 */
    }
  }

  /** 跳过类事件按「会话 + 理由」去重：pre-step 每步都触发，不去重会刷屏。 */
  const reportSkip = (reason, meta, sessionId) => {
    const key = `${sessionId}|${reason}`
    if (reportedSkips.has(key)) return
    reportedSkips.add(key)
    writeReport({ event: 'skip', reason, session: sessionId, ...meta })
  }

  const reportError = (reason, meta, sessionId) => {
    writeReport({ event: 'error', reason, session: sessionId, ...meta })
  }

  const inGitProject = (cwd) => {
    if (typeof cwd !== 'string' || cwd.length === 0) return false
    if (gitRoots.has(cwd)) return gitRoots.get(cwd)
    const homeKey = normalizePath(home)
    let found = false
    let dir = cwd
    for (;;) {
      // 家目录自身常被初始化成 git 仓库（dotfiles）——它不算项目根，也不越过它继续向上找：
      // 否则家目录/临时目录里一个无关的 .git 会让「项目内」判定整体失效。
      if (normalizePath(dir) === homeKey) break
      if (existsSync(join(dir, '.git'))) {
        found = true
        break
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    gitRoots.set(cwd, found)
    return found
  }

  const digestOf = (skill) => {
    const base = skill?.resourceBase
    if (base?.kind !== 'directory' || typeof base.path !== 'string') return ''
    if (digests.has(base.path)) return digests.get(base.path)
    let value = ''
    try {
      value = shortDigest(readFileSync(join(base.path, 'SKILL.md'), 'utf8'))
    } catch {
      value = ''
    }
    digests.set(base.path, value)
    return value
  }

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
    if (config.oncePerSession && sessionId.length > 0 && injectedSessions.has(sessionId)) {
      reportSkip('once-per-session', {}, sessionId)
      return decision
    }

    const text = pickUserText(messages)
    if (text === undefined) {
      reportSkip('no-user-text', {}, sessionId)
      return decision
    }
    const hit = matchIntent(text, config)
    if (hit === undefined) {
      reportSkip('no-hit', { text: text.slice(0, 80) }, sessionId)
      return decision
    }
    if (config.requireGitRoot && !inGitProject(header.cwd)) {
      reportSkip('not-git', { cwd: header.cwd }, sessionId)
      return decision
    }

    const names = Array.isArray(config.skills) ? config.skills : []
    if (names.length === 0) {
      reportSkip('no-skill', { cwd: header.cwd, attempted: 0, mode: config.mode }, sessionId)
      return decision
    }
    if (hasGesture(text, names)) {
      reportSkip('manual-gesture', { cwd: header.cwd, text: text.slice(0, 80) }, sessionId)
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

      const via = []
      if (hasInjectedMessage(decision.messages, skillName)) via.push('decision-messages')
      if (hasInjectedMessage(messages, skillName)) via.push('turn-messages')
      if (alreadyInjected(session, skillName)) via.push('session-log')
      if (via.length > 0) {
        if (sessionId.length > 0) injectedSessions.add(sessionId)
        reportSkip(
          'already-injected',
          {
            cwd: header.cwd,
            skill: skillName,
            via,
            // alreadyInjected 只认 { events[].data.message.source } 形状：形状变了就明说「未知」，不静默。
            sessionLog: Array.isArray(session?.events) ? 'present' : 'unknown',
          },
          sessionId,
        )
        return decision
      }

      const digest = digestOf(skill)
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

      if (sessionId.length > 0) injectedSessions.add(sessionId)
      writeReport({
        event: 'inject',
        session: sessionId,
        cwd: header.cwd,
        skill: skillName,
        hit,
        digest,
        drift:
          typeof config.skillDigest === 'string' && config.skillDigest.length > 0 && config.skillDigest !== digest,
        note: config.note !== false,
        text: text.slice(0, 80),
      })
      try {
        ctx.logger?.info?.(`[roadbook-autoload] 命中「${hit}」→ 已加载 ${skillName}（会话 ${sessionId || '未知'}）`)
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

  ctx.on('agent/pre-step', async (event, next) => {
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
  })
}

function sessionIdOf(event) {
  const id = event?.agent?.session?.header?.id
  return typeof id === 'string' ? id : ''
}

function errorText(error) {
  const text = error instanceof Error ? error.message : String(error ?? '')
  return text.slice(0, 200)
}

/** 路径比较用：统一分隔符、去尾部斜杠、忽略大小写（Windows 盘符与 `/` 混用）。 */
function normalizePath(value) {
  return String(value ?? '')
    .replace(/[\\/]+$/, '')
    .replace(/\\/g, '/')
    .toLowerCase()
}
