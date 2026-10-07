# Windows 侧写出的 JSON/文本必带 BOM，下游解析器直接拒绝；命令行传 JSON 也会被 PS 吃引号
复发次数: 1
作用域: 全局（所有读 JSON/文本数据文件的入口：CLI 事实文件、配置、清单、探针输入）
最近复发: 2026-10-07
现象：按卡里的样例命令写事实文件 → `node skills/roadbook/bin/route.mjs --chain --facts-file <path>` 报 `事实非法：JSON 解析失败（Unexpected token '﻿', "﻿{"greenfi"... is not valid JSON）`，报错指向"JSON 非法"，**与真正的元凶（文件头三个字节）毫无关系**；换成命令行内联 `--facts '{"a":1}'` 也失败，报 `Expected property name or '}'` 且原文里双引号**全没了**（`{greenfield:existing,…}`）。
根因：① Windows PowerShell 5.1 的 `Set-Content -Encoding UTF8` / `Out-File -Encoding utf8` 写的是 **UTF-8 带 BOM**，而 `JSON.parse` 按规范拒收前置 U+FEFF ⇒ 文件内容合法、字节不合法。② PS 5.1 传原生参数时按自己的规则剥引号，内联 JSON 过不来 —— 两条路一起坏，症状都伪装成"数据有问题"。
修法（实测）：消费侧**剥 BOM 再解析**（`JSON.parse(text.replace(/^\uFEFF/, ''))`，一行 + 一条回归断言）；文档/卡里给的写法一律走**文件**而不是命令行内联 JSON；需要无 BOM 落盘时用 `[IO.File]::WriteAllText($p, $json)` 或让 Node 写。
下次定位：解析器报"JSON 非法"而人肉看文件明明合法、或报错原文里引号凭空消失 → 先看前三字节与参数的传法，别去改数据。
证据：2026-10-07 实测两条报错原文如上；修后 `node --test test/route-cli.test.mjs` 的 `A15g` 判绿（29 项全绿）；**证伪**：把剥 BOM 那一行撤掉 ⇒ `A15g` 恰好红在那条断言、退出码 1，还原后 `route.mjs` 的 sha256 `C219CB30E0DF2FE6F666BD2D77CC7F66DED50D628E48E1F6920CD82CB321720F` 逐字节一致。
来源：2026-10-07 · 批 6 落地台账 #10（0-1 卡开机报告加"链序下一张 = route 复算"）时，样例命令第一跑就撞上
最近确认：2026-10-07
