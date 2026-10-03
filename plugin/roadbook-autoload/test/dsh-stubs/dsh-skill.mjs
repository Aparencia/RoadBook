/** @deepseek-ai/dsh-skill 的测试桩：可判定「能不能调用」与「怎么渲染」，并可注入渲染失败。 */
export const isUserInvocable = (skill) => Boolean(skill) && skill.userInvocable !== false

export const renderSkillContent = (skill) => {
  if (skill?.__renderThrows === true) throw new Error('renderSkillContent failed (stub)')
  return typeof skill?.__content === 'string' ? skill.__content : `# ${skill?.name ?? 'skill'}`
}
