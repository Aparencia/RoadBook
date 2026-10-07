# RCA · 拆文件漏搬 import，被 `catch` 吞成"合法返回值"

> **AI 声明**：本文件由 agent（deepseek-flash，2026-10-07）依据**本机实跑命令输出**生成；只看「批 1 两次拆分失败并撤回」这一轴，不覆盖其他失败面。产物寿命：**持久**（进仓库）。
> 卡：6-2 根因分析 ｜ 定级：**P2**（工程效率与流程缺陷；两处改动已回退，无线上影响）｜ 关联：批 1 台账 #49 / #58、`test/d14-lines.test.mjs` 豁免清单、`docs/lessons/2026-09-11_测量载体脱钩.md`

## ① 现象（原文）

2026-10-07 批 1，两次拆分都在"逐字节无损"的自检通过之后仍然大面积变红：

| 拆分动作 | 结果 | 典型症状（当时记录） |
| :-- | :-- | :-- |
| `lib/update.js`（1006 行）→ 四个模块 + barrel | `test/update.test.mjs` **30 例红** | **同一个函数体，模块外调用正常、模块内恒返回 null**：`tls.getCACertificates('system')` 模块外 69 条，模块内的 `systemCaCertificates()` 返回 `null`，**进程零报错** |
| `test/client-contract.test.mjs`（1458 行）→ 四份 + 共享 harness | **5 例全红** | 模块级失败（import 阶段就红），同样"机制未定位" |

两次都按 C1 红灯三问撤回，原文件一字未动。

## ② 复现（最小，可重跑）

概念复现（两个临时文件，同一进程里对照；**这才是"我在模块内什么都没改却拿到 null"的最小形态**）：

```js
// m.mjs —— 故意不写 import { getCACertificates } from 'node:tls';
export function systemCaCertificates() {
  try { const list = getCACertificates('system'); return list?.length ?? null; } catch { return null; }
}
```

```js
import { getCACertificates } from 'node:tls';
const m = await import('./m.mjs');
console.log(getCACertificates('system').length); // 69
console.log(m.systemCaCertificates());           // null，且没有任何异常冒出来
```

仓库级复现（本轮真跑，`lib/` 整树复制到临时目录、**只删掉一行 import**，其余不动）：

```
① 模块外 tls.getCACertificates("system") = 69 条
② import 完整时 systemCaCertificates() = 69 条
③ 只少一行 import 时 = null（异常被 catch 吞掉，进程零报错）
```

⇒ **有能变红的命令**（③ 相对 ② 变红），第一阶段成立。修法验证同源：把 import 补齐后 `node --test test/update.test.mjs` = **41/41 绿**，`fail 0`。

## ③ 根因（五问法，5 层）

1. **为什么模块内返回 null？** → `lib/update.js:264` 的 `systemCaCertificates()` 是 `try { getCACertificates('system') } catch { return null }`；缺失的标识符在**运行到那一行**抛 `ReferenceError`，被这个 `catch` 吞掉，降级成"合法返回值 null"。
2. **为什么会有缺失的标识符？** → 拆出的新文件里没有 `import { getCACertificates } from 'node:tls'` —— import 语句在**文件头**，而当时的搬移单位是**声明块**，import 不在任何一个块里，于是它留在原文件（随后原文件被改写成 barrel），没跟着函数走。
3. **为什么没有一步重算 import？** → 当时的拆法是"按行区间把函数体搬到新文件 + 证明搬运逐字节无损"。**搬移单位与依赖单位不是同一个东西**：块是文本单位，import 闭包是依赖单位。
4. **为什么"逐字节无损"没拦住？** → 那台仪器量的是"**字节**有没有丢"，而缺陷是"**import 闭包**有没有丢"。两者不同源 ⇒ 仪器给了一个真读数，却指向另一个问题（**假安心**，不是假读数）。这正是 `docs/lessons/2026-09-11_测量载体脱钩.md` 家族的第 13 次复发。
5. **为什么这类缺陷在本仓特别贵？** → ESM 缺标识符**不报模块级错**（除非是命名导出缺失），只在执行到那一行时抛；而本仓多处防御性 `catch { return null }` / `catch {}` 会把它消化掉 ⇒ 红的是 30 个远端用例的**现象**，不是那一行 import，定位成本被放大一个数量级。

**修法（本轮已实测落地）**：搬移脚本**不许抄文件头的 import**，必须按"这个新文件实际用到了哪些顶层标识符"（词边界扫描）**重算** import 清单；并加一条无损自检：所有顶层文本必须被恰好分配给某一个新文件。`lib/update.js` 按此法拆成 6 模块 + barrel，对外导出面逐名不变，`test/update.test.mjs` 41/41 绿。

## ④ 影响面

- 批 1 的 #58（`lib/update.js`）与 #49（`test/client-contract.test.mjs`）各失败一次并回退，两次拆分的工时全部作废。
- `test/d14-lines.test.mjs` 的 `EXEMPT` 清单因此长期挂着两条"先定位再拆"的存量（`lib/update.js` 1006 行、`test/client-contract` 1457 行），使 D14 闸的豁免面比实际需要的大。
- 未触及线上行为：两次都在提交前回退，`lib/update.js` 与 `test/client-contract.test.mjs` 当时逐字节未变。

## ⑤ 修复方案建议（按序）

1. **已落**：本条修法写进拆分脚本的默认行为（import 按使用重算 + 顶层文本分配自检），并在批 1 的 `lib/update.js` 拆分上验证。
2. **待落（批 2 及以后复用）**：`lib/client.js`（2772 行，批 2 要拆）与 `test/client-contract.test.mjs` 的拆分一律走同一套规则；拆完立刻跑**该文件的直接测试套件**，不许只跑 `node --check`（语法检查看不见缺失标识符）。
3. **待落（批 5，6-2 卡）**：把"搬移代码必须重算 import 闭包"写进 6-2 卡的定位动作与 4-2 代码审查卡的检查项 —— 具体落点见下方升格提案。

## ⑥ 升格提案（**交用户裁决**，本卡不自行改规则）

命中已有教训卡 ⇒ 按 6-2 动作 2.4 起草升格提案。落点具体到文件 + 条目：

| 提案 | 落到哪 | 具体条目 |
| :-- | :-- | :-- |
| 教训升格为审查项 | `playbook/4-2-代码审查.md` + EN 对照 | 检查项加一条：**本次若有"移动/拆分代码"，逐新文件核对"它用到的顶层标识符是否都在本文件 import 或定义"**；只证明"字节没丢"不算过 |
| 教训升格为定位动作 | `playbook/6-2-根因分析.md` + EN 对照 | 定位动作加一条：**"函数体一个字没改却恒返回同一异常值" ⇒ 先查缺失标识符 + 宽 `catch`**（差集命令：新文件用到的标识符 − 本文件定义/import 的标识符） |
| 教训卡更新 | `docs/lessons/2026-09-11_测量载体脱钩.md` | 复发次数 +1、最近复发 2026-10-07，现象行补"逐字节无损 ≠ 依赖闭包无损" |

**为什么不自作主张现在改**：这三条都落在受 A6/C3 保护的判据正文（卡与宪法）上，且批 5 的工作域正是 `playbook/{6-6,6-2}` + `AGENTS.md`；提前改会与批 5 撞车（D6 禁越范围）。

## ⑦ 追加（同日批 1 #55 分块）：同一类缺陷在**客户端 bundle** 上的第二次形态

搬「自进化」整段（412 行）进分块 `lib/client-evolve.js` 时又踩到一次同类，但**形态与后果都不同**，值得照 §⑤ 的规则补记：

| | 上一次（宿主半 ESM） | 这一次（客户端手写 bundle） |
| :-- | :-- | :-- |
| 依赖通道 | 文件头的 `import` 语句 | 没有 import：靠核心注入的宿主件（`require("roadbook/host")`） |
| 漏搬的东西 | `import { getCACertificates } from 'node:tls'` | 宿主件里少给一个键 `PLUGIN_VERSION` |
| 为什么漏 | 搬移单位（声明块）不含文件头 | 扫描只找 **`名字(` 调用形态**，而它是**当值用**的（`"v" + PLUGIN_VERSION`） |
| 后果 | 被 `catch { return null }` 吞成合法返回值，**进程零报错** | `ReferenceError` 直接抛出，契约测试**当场红**（因为测试真的驱动了那一帧） |

⇒ 两条可复用的动作，与 §⑤ 第 2 条同源、但把口径说严：

1. **核依赖按标识符本体，不按调用形态**：差集 = 「新文件里出现的标识符」−「本文件声明的」−「语言内置」；`名字(` 这种扫法会系统性漏掉常量、类名、被当值传的函数。
2. **裸标识符会被对象字面量的键污染**（本例扫出 60 个"自由标识符"，其中 59 个是 `style` / `color` / `d` 这类键名）：**静态扫描只用来提示候选，最终判据是"真的跑一次那个函数"** —— 本次正是 `evolveFrame` 被契约测试驱动才暴露的。静默的 `catch` 会让静态扫描的漏网之鱼变成假绿，跑一次不会。

