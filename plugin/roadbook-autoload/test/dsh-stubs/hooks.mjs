/**
 * 测试用 ESM loader 钩子：把宿主提供的 peerDependencies 换成同目录下的桩。
 *
 * 真实运行时这三个包由 DSH 宿主注入（见 package.json 的 peerDependencies），
 * 插件内不下载、不打包；母版仓库里解析不到它们，所以离线单测必须自己顶上。
 */
const STUBS = {
  '@deepseek-ai/dsh-llm': new URL('./dsh-llm.mjs', import.meta.url).href,
  '@deepseek-ai/dsh-skill': new URL('./dsh-skill.mjs', import.meta.url).href,
  '@deepseek-ai/schemastery': new URL('./schemastery.mjs', import.meta.url).href,
}

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS[specifier]
  if (stub !== undefined) return { url: stub, shortCircuit: true }
  return nextResolve(specifier, context)
}
