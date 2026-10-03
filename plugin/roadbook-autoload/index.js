/**
 * roadbook-autoload —— Roadbook V6 开发流程母版的自动加载插件（Host 半区）。
 *
 * 作用：用户在一个 git 项目里开口谈开发任务时，把 roadbook 技能正文按内置
 * 「用户显式调用」的同一形状注入当前回合，使流程卡不依赖模型自觉。
 *
 * 分工：门控与文案等纯逻辑在 ./trigger.js（不 import dsh 包，可离线单测）；
 * 本文件只做 Host 侧接线：读会话、查技能、注入消息、落观测。
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
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
  /** 自进化 A 环：命中记录落盘路径（JSONL），默认空 = 不落盘。 */
  reportPath: z.string().default(''),
  /** 自进化 B 环：SKILL.md 指纹基线，对不上就在说明里提示技能已更新。 */
  skillDigest: z.string().default(''),
})

export function apply(ctx, config) {
  const injectedSessions = new Set()
  const gitRoots = new Map()
  const digests = new Map()

  const inGitProject = (cwd) => {
    if (typeof cwd !== 'string' || cwd.length === 0) return false
    if (gitRoots.has(cwd)) return gitRoots.get(cwd)
    let found = false
    let dir = cwd
    for (;;) {
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

  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const decision = await next()
    if (decision?.kind === 'reject') return decision
    if (config.mode === 'off') return decision

    const session = agent?.session
    const header = session?.header
    if (header === undefined || header === null) return decision
    if (!config.includeSubagents && isSubagentHeader(header)) return decision
    const sessionId = typeof header.id === 'string' ? header.id : ''
    if (config.oncePerSession && sessionId.length > 0 && injectedSessions.has(sessionId)) return decision

    const text = pickUserText(messages)
    if (text === undefined) return decision
    const hit = matchIntent(text, config)
    if (hit === undefined) return decision
    if (config.requireGitRoot && !inGitProject(header.cwd)) return decision

    const names = Array.isArray(config.skills) ? config.skills : []
    if (hasGesture(text, names)) return decision

    for (const skillName of names) {
      let skill
      try {
        skill = await ctx.skills.get(skillName, { cwd: header.cwd, signal, scope: agent })
      } catch {
        skill = undefined
      }
      signal?.throwIfAborted?.()
      if (skill === undefined || skill === null || !isUserInvocable(skill)) continue
      if (
        hasInjectedMessage(decision.messages, skillName) ||
        hasInjectedMessage(messages, skillName) ||
        alreadyInjected(session, skillName)
      ) {
        if (sessionId.length > 0) injectedSessions.add(sessionId)
        return decision
      }

      const digest = digestOf(skill)
      const content = [{ type: 'text', text: renderSkillContent(skill) }]
      if (config.note) {
        const note = buildNote({ skillName, hit, digest, expectedDigest: config.skillDigest })
        if (note.length > 0) content.push({ type: 'text', text: note })
      }
      if (sessionId.length > 0) injectedSessions.add(sessionId)
      writeReport(config, {
        session: sessionId,
        cwd: header.cwd,
        skill: skillName,
        hit,
        digest,
        drift: config.skillDigest.length > 0 && config.skillDigest !== digest,
        text: text.slice(0, 80),
      })
      ctx.logger?.info?.(`[roadbook-autoload] 命中「${hit}」→ 已加载 ${skillName}（会话 ${sessionId || '未知'}）`)
      return {
        ...decision,
        messages: [
          ...(decision.messages ?? []),
          createUserMessage({
            content,
            source: { kind: 'skill-invocation', name: skillName, form: 'instructions' },
          }),
        ],
      }
    }
    return decision
  })
}

/** 自进化 A 环：只记事实（命中/技能/指纹/摘要），观测失败不影响主流程。 */
function writeReport(config, entry) {
  if (typeof config.reportPath !== 'string' || config.reportPath.length === 0) return
  try {
    appendFileSync(config.reportPath, `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`, 'utf8')
  } catch {
    /* 观测是旁路，失败即忽略 */
  }
}
