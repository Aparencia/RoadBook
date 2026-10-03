/** @deepseek-ai/dsh-llm 的测试桩：只保留插件用到的那一个工厂函数。 */
export const createUserMessage = ({ content, source } = {}) => ({ role: 'user', source, content })
