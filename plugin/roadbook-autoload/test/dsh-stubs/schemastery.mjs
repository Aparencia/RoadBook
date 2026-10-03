/**
 * @deepseek-ai/schemastery 的测试桩：任意链式调用都返回新的可调用桩，
 * 末端的 `.default(value)` 直接回值。测试只关心 Config 存在，不校验 schema 语义。
 */
const make = () =>
  new Proxy(function () {}, {
    get: (_target, property) => {
      if (property === 'default') return (value) => value
      if (property === 'toString' || property === Symbol.toPrimitive) return () => '[schemastery-stub]'
      return make()
    },
    apply: () => make(),
  })

const z = make()

export default z
