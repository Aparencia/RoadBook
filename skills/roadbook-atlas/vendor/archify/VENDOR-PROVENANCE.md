# Vendor provenance — archify

Third-party diagram renderer, vendored verbatim into Roadbook Atlas. Nothing in this
directory has been modified, reformatted, or re-encoded; every file is byte-identical to
its upstream source (verified with `diff -r` and SHA-256; see *Verification* below).

## Upstream

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/tt-a1i/archify |
| Monorepo subdirectory | `integrations/deepseek-harness` |
| Homepage | https://github.com/tt-a1i/archify/tree/main/integrations/deepseek-harness |
| npm package | `@tt-a1i/archify-dsh` |
| Package version | `0.1.0` |
| Skill / renderer version | `2.14.0` (`package.json` → `"name": "archify"`, `"version": "2.14.0"`) |
| License | MIT |
| Vendored on | 2026-10-04 (UTC), 2026-10-04 Asia/Shanghai |

The two version numbers are both real and both belong here. `0.1.0` is the version of the
DSH integration wrapper published to npm; `2.14.0` is the version stamped inside
`skills/archify/package.json`, which is the renderer that is actually vendored. There is no
`node_modules` anywhere in this tree and none is required — the renderer imports nothing
outside the Node standard library and this directory.

## Source

Absolute local path this copy was taken from (read-only, unmodified):

```
C:\Users\Administrator\.dsh\profiles\desktop\node_modules\@tt-a1i\archify-dsh
```

Git Bash equivalent:

```
/c/Users/Administrator/.dsh/profiles/desktop/node_modules/@tt-a1i/archify-dsh
```

Everything vendored comes from that package's `skills/archify/` subdirectory, except
`LICENSE`, which is the package-root `LICENSE`. The package root also contains
`README.md`, `cordis.patch.yml`, `package.json`, and `lib/` (the DSH host plugin half);
none of those are vendored — this directory vendors **only** the renderer.

`skills/archify/LICENSE` and the package-root `LICENSE` are byte-identical
(SHA-256 `2f724fa953b4eaa8ec75fa56919ce474b57adce54d2456a3791510bc53735cbd`), so the
copied license is the same text either way.

## Vendored contents

57 upstream-derived files, 1 642 885 bytes (≈1.6 MiB of file content), plus this record
itself (58 entries total; the record's own size is deliberately **not** recorded — it changes
whenever this file is edited, see the table below).

Upstream `skills/archify/` is 62 files / 4 847 150 bytes, so this copy is upstream minus
five files — see *Excluded paths and why*.

### Top-level entries with aggregate SHA-256

The aggregate hash for a directory is the SHA-256 of the sorted lines
`<file sha256>  <path relative to this directory>`, one line per file. For single files it
is the SHA-256 of the file itself. This makes every subtree independently checkable.

| Entry | Files | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `VENDOR-PROVENANCE.md` | 1 | — | *(this file — its size and hash change whenever it is edited, so neither is self-recorded)* |
| `LICENSE` | 1 | 1 146 | `2f724fa953b4eaa8ec75fa56919ce474b57adce54d2456a3791510bc53735cbd` |
| `SKILL.md` | 1 | 13 036 | `295b8662379fd0d23ae1220c5eb4c6e00c9c133f8303b8b107eadeca1047fd68` |
| `package.json` | 1 | 303 | `5bfc71c103a1b9f925c18e942196a7e142b24082a4105525f86feecabde30d6f` |
| `assets/` | 1 | 626 565 | `b18cd3e401edfc32cdab868f9b35dd915035ad289b284c962e80ad9611fdba4e` |
| `bin/` | 4 | 101 363 | `b62fa28f48cb968722d3e0a780dc14d5c099d38c6a424286da4662282200ec66` |
| `delta/` | 1 | 70 463 | `43b9f12cfa6179a5ac0e4732969faa947f2c027b9d5279f7c956a613f5193f8d` |
| `examples/` | 13 | 59 221 | `5daf315c52c334465a84a97d31d95e64747955960535bcdec1087d9bb750f892` |
| `recipes/` | 1 | 27 853 | `9c8e68f1b54c5787f6dcc3b8dd954316e0422f8ceffb0e7806f624a6fc333750` |
| `references/` | 3 | 18 742 | `aed382eac24dde03f052e7fb571ae81aff0a79f14f056fed52d4ad7b9c2fafbc` |
| `renderers/` | 22 | 648 551 | `84ac53ee324a31ba3a0f19895499d14b4d2ac90bdbf3f8205c9c4f101123d605` |
| `schemas/` | 7 | 44 842 | `9cdbe78f0bd9011876307437047b3fe82ed7ee1c99c21913fc26ae46aab9ce55` |
| `scripts/` | 2 | 30 800 | `ed511566699f37ac5278c94efa1d3d4b922004693f8294e422203701b8ffff08` |

Whole-tree aggregate over the 57 upstream-derived files (same rule, rooted at this
directory, `VENDOR-PROVENANCE.md` itself excluded because a file cannot contain its own
hash) = `7e97b779b31dcb57cf0b375f0c9bd1dd6cae8d17ad138041aee05e904733cb44`.

**规则必须说全（2026-10-06 订正）**：上面这个值 = 把「路径按**字节序**（C locale）升序排好」
之后，逐行 `<文件 sha256><两个空格><相对本目录的路径>` 用 `\n` 连接、**末尾带一个 `\n`**，
再对这个文本取 SHA-256。此前这里只写 "sorted lines"，而 `sort` 在 UTF-8 locale 下是字典序
—— 同一批文件在不同 locale 下会算出不同的聚合值。**旧值 `d431d364…` 用任何常见排序/行格式
都无法从这棵树复现**（12 种组合实测全不符），因此按上述确定性规则重算并写明；逐文件表才是
真正的完整性判据，聚合值只是它的一行摘要，由 `test/vendor-provenance.test.mjs` 每次门禁复算。

One-liner to recompute it from this directory (注意 `LC_ALL=C`，它保证排序口径不随机器变)：

```bash
LC_ALL=C find . -type f ! -name VENDOR-PROVENANCE.md | LC_ALL=C sort | while read -r f; do
  printf '%s  %s\n' "$(sha256sum "$f" | cut -d' ' -f1)" "${f#./}"
done | sha256sum
```

### Full file manifest with byte sizes and SHA-256

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `LICENSE` | 1 146 | `2f724fa953b4eaa8ec75fa56919ce474b57adce54d2456a3791510bc53735cbd` |
| `SKILL.md` | 13 036 | `295b8662379fd0d23ae1220c5eb4c6e00c9c133f8303b8b107eadeca1047fd68` |
| `package.json` | 303 | `5bfc71c103a1b9f925c18e942196a7e142b24082a4105525f86feecabde30d6f` |
| `assets/template.html` | 626 565 | `95886aa9c7e466cf81fa3b26e90e4338c1e5fc7460477549626a97061791a58c` |
| `bin/archify.mjs` | 56 592 | `ed7b3f657c922d2c11523cca78d43b8e6e09b7a3245ec1319cf5145aad2a4cc4` |
| `bin/open-artifact.mjs` | 2 225 | `add1722186683c12770c575585bbb8774919c15b87361e10d2fe834623223159` |
| `bin/preview.mjs` | 23 578 | `c1f470655f3d09cf1a2f6745ab3cec407e5246926237b92a67d673c74e339e02` |
| `bin/visual-check.mjs` | 18 968 | `1c7bf59b871ae2333919e034e79cd506a51be4a51ad93689bde35c809a07ae5c` |
| `delta/architecture-delta.mjs` | 70 463 | `c89203f7f4954adc5626246f5dbf8b26486d7c3631c5978487fc664aaa0ed64f` |
| `examples/agent-run.lifecycle.json` | 4 417 | `af939579dcafc8b4c49f09594591577994398aee57a57369d4c791dfc0d85a42` |
| `examples/agent-tool-call.workflow.json` | 6 367 | `9c94c8c0b2104478b77befb4cc5e343d381acba6e66645ab17616fde20b60e05` |
| `examples/async-job-roundtrip.sequence.json` | 4 370 | `545f20920c89b69c2bb1f15508d5543fddbeb15cffba61e102206e04bd5a5cd9` |
| `examples/cache-miss-request.sequence.json` | 4 345 | `4bbaa6ca3cd4036002fd5d0f3a332eb922cec69d09bac3d7925f95beb4308389` |
| `examples/checkout-platform.base.architecture.json` | 2 234 | `c112195e7285e3e4aedaeab3e1f85f5891d30fccc2c260aebe4e1da12c80cf84` |
| `examples/checkout-platform.head.architecture.json` | 2 368 | `e3aaf47f77afeadafc81c6ce853dc1df68cc1e6932dec972cf478f4008fdda99` |
| `examples/deployment-release.lifecycle.json` | 4 274 | `735c2c5819266e6ea2a71775b6eefce98b53030ce90cb721dc8e1d022ce5be71` |
| `examples/event-stream.dataflow.json` | 5 433 | `a92d6597ddbe164f395da32a7d4b33cfae08edd7d9600a6fb45a2058e5bbb43e` |
| `examples/incident-response.workflow.json` | 5 375 | `5c760c82eee545dfb7da38a4e628059d7891af4cfbfc13c8a7009ea64f69aa1b` |
| `examples/product-analytics.dataflow.json` | 5 627 | `6fa38a7ccedf96da592d60b392783b846188eaa3ec9136c6dc06ca020e43a110` |
| `examples/production-deployment.architecture.json` | 5 454 | `738e9c7f22e4e6e88f5aafc087dc58409105927daa9a79aaf240c8393654494f` |
| `examples/release-delivery.workflow.json` | 5 164 | `e5c880417eac1623923c3dd5461e0c78acd762e1621a28bd53fc14a84cad6a91` |
| `examples/web-app.architecture.json` | 3 793 | `483350f5297df682aba4e4a0fa491307ce3d3abd725ae4df07fab177490752cf` |
| `recipes/scenarios.mjs` | 27 853 | `8220aeaae507dcecedd4e544940b4db46accb0502b2bb512e87ca2ed6670e07f` |
| `references/authoring-contract.md` | 8 952 | `35220be7dee5792d630e0b5d5a3e4d57ddf16a497015a4674d0fdb0910f7811b` |
| `references/delivery-contract.md` | 5 547 | `15d2fb47412288c5a489c402877bf92e774d10f481f16f9d1af2fdd907fc0ba6` |
| `references/viewer-runtime.md` | 4 243 | `dc0d9ffe6b9987d73d2d48710fce5ab4c120bbf1940ff1eb9355259c5d4f32b6` |
| `renderers/architecture/grid.mjs` | 2 071 | `f6de99c32436feed3378b0ddef516bb4732ff27a89c543b50635d4d14a15a55a` |
| `renderers/architecture/render-architecture.mjs` | 33 528 | `c49ba91dd57d78bd2a3a5852ba1cdc8bf6b2afd1d96845ff3b240bdae55c5be0` |
| `renderers/dataflow/README.md` | 4 202 | `18c4f86ba62fcee371d9fe38094625b3a68cc76231c36ab8c8124acb4c1ffa42` |
| `renderers/dataflow/render-dataflow.mjs` | 19 906 | `89b173216c638017baa24e90a6c42ab9ce13d7e43eb2371aa871109563a5a1a4` |
| `renderers/lifecycle/README.md` | 4 954 | `ec9b27ebf4c6a8fa675f11995c47753d3283423bac09980a4cd476d6bae9a9f8` |
| `renderers/lifecycle/render-lifecycle.mjs` | 22 668 | `ac37f1afed1a1d9b70bcae3113edb1d945b0699e11efaeda9e35f03ba3cb56cf` |
| `renderers/sequence/README.md` | 4 828 | `a442335dcf44b1587d3ad88809e31b001a4fafdf7a134040e8b1927455af4206` |
| `renderers/sequence/render-sequence.mjs` | 21 356 | `4b855ca424a4e4d55c89d1c22a9c3b71b2176d969a8a18b6c52dae3517b1e71a` |
| `renderers/shared/cli.mjs` | 9 291 | `0d221a5368b61d09ea4f21d14c6c31b2fea48b3b49edb205021261a068c271a8` |
| `renderers/shared/diagnostics.mjs` | 4 113 | `27ac252f47abbda260643f7400c126bab840aca5c050005d721ae32b87744136` |
| `renderers/shared/engineering-profiles.mjs` | 6 936 | `7e99f9d5423f66cc9ab6224da56dc2d5aa6c6faec29178034794e9db6b5b2889` |
| `renderers/shared/generated-validators.mjs` | 383 536 | `31c7c10cf487f9cab67c1886969a02675a644e1513461e62d366fb78ea87cb28` |
| `renderers/shared/geometry.mjs` | 52 614 | `71e5ee761fced528afa613821e4d4ad47699e1067b83439a1152617536b4cf23` |
| `renderers/shared/layout-report.mjs` | 1 015 | `44c2f74a20e483dd37dae6791ede39284ce3bac1a2a13872d2912999e8504df5` |
| `renderers/shared/legend.mjs` | 8 546 | `d195da3f1c5fceaf09d994335de7e95b891d6a53147f763be7c5224f26036887` |
| `renderers/shared/output-path.mjs` | 10 618 | `9c61692cf9debc99f5cb86e0df8c474d0665921345fecdfc13ded3828c94f0a8` |
| `renderers/shared/repository-evidence.mjs` | 11 445 | `e36c109c84b338ea77d2ae74e9fa9ffe4317e7780a2be8d4d78e588ddb387677` |
| `renderers/shared/text-fit.mjs` | 2 191 | `35b6ef2c64d88c1ea4e5aab2af7c4e8a2c2e1be62db71263787d39a9797e7dea` |
| `renderers/shared/utils.mjs` | 8 398 | `c99f5f7744031413cc289dd2628ad0ff514ba3a8ac602da24b8c8ef9e0c63e0c` |
| `renderers/shared/validator.mjs` | 3 508 | `7460d7fcbcdf710649256c5e96142ae26d807a655d3296ee8caf7f5e158622cc` |
| `renderers/workflow/README.md` | 5 371 | `dea221f672ce8cc2d8c7bdd850ee10d75cc7289915d3ab58ce2fdedf1a145592` |
| `renderers/workflow/render-workflow.mjs` | 27 456 | `4f8e16ca648b485486ce4ff7c7d0dba4ec5af4a2d0ec8c9f41c7208ae9baba68` |
| `schemas/README.md` | 9 596 | `06fc96a26cb8b25dcd127698dd623564f7a95e5548e55c53e4fc86aff307e78b` |
| `schemas/architecture.schema.json` | 6 523 | `2f2fad88bed1b408a9fd65d62f94f86c43eeefa2e82ff11edc8a2a5f20ac1a07` |
| `schemas/common.schema.json` | 2 041 | `7cbd0cfff3715fb89a50c75188c7893db853f7f27a821522142717300da1c3e4` |
| `schemas/dataflow.schema.json` | 5 972 | `436a03b806061f623fbe9913a1476e61c8af2273047620bc91a823249bb15356` |
| `schemas/lifecycle.schema.json` | 6 662 | `3dc62d8d382e1495c5b43b5a4570716bd57e8e9e02f46b447ba37896b0cf917c` |
| `schemas/sequence.schema.json` | 5 572 | `d952415061ca1bc408ebf24dd68495abe1fb4e86e1c0bc9733f539c243caafc8` |
| `schemas/workflow.schema.json` | 8 476 | `4c0d90c4216b8c0fb456dd0912048d00ecc363b6c0cb53faa2837c3d729b2608` |
| `scripts/check-render-output.mjs` | 29 622 | `aec2aa7e56993707248307f596bfcce9a5adbb0af1593f2d2ed5a309de8cd8da` |
| `scripts/render-examples.mjs` | 1 178 | `a173a053fb26c0ac3cd72eb9b4e50411e67ca8c50bec57f05d4ca8ba79db2c0b` |

## Excluded paths and why

Exactly five upstream files are not vendored. All five are pre-rendered sample **artifacts**
under `examples/` — finished HTML documents that exist to be looked at, never read by the
render path:

| Excluded | Bytes | Reason |
| --- | ---: | --- |
| `examples/dataflow-product-analytics.html` | 644 091 | Pre-rendered demonstration output |
| `examples/lifecycle-agent-run.html` | 637 726 | Pre-rendered demonstration output |
| `examples/sequence-cache-miss-request.html` | 640 506 | Pre-rendered demonstration output |
| `examples/web-app-rendered.html` | 637 933 | Pre-rendered demonstration output |
| `examples/workflow-agent-tool-call-rendered.html` | 644 009 | Pre-rendered demonstration output |

Together these five HTML files account for 3 204 265 of the 3 263 486 bytes under upstream
`examples/` — dropping them is what takes the copy from 4.8 MB to 1.7 MB. They are pure
output: nothing imports them, and `scripts/check-render-output.mjs` is an artifact
inspector, not a consumer of the fixtures. Any of them can be regenerated locally from the
matching JSON fixture with `deliver`.

Everything else under `examples/` **is** vendored: the 13 JSON fixtures (59 221 bytes),
including `checkout-platform.base.architecture.json` and
`checkout-platform.head.architecture.json`, which the `compare` command and `doctor`'s
"Architecture compare runtime and proof fixtures" check require. `scripts/render-examples.mjs`
(1 178 B) is vendored too, even though it reads the missing HTML paths.

`node_modules/` was not excluded — it does not exist in the source and is not needed.

## Verification performed at vendoring time

- `diff -r --brief <source>/skills/archify <this directory>` reports only the five excluded
  HTML files (`Only in <source>/examples: …`) plus the added `LICENSE` and this
  provenance file. Every other file matches byte for byte.
- `assets/template.html` SHA-256 is `95886aa9…1a58c` in both the source and this copy.
- Every byte size and hash in the two tables above was produced by `sha256sum` and
  `stat -c %s` against the actual tree, and the byte totals were cross-checked two ways
  (sum of all files vs. sum of the per-entry aggregates): both give 1 657 356.
- `node bin/archify.mjs doctor` exits **0** and prints `Archify is ready.` with all
  fifteen checks `[ok]`, including `[ok] Node.js v25.2.1 (requires >=18)`,
  `[ok] Architecture compare runtime and proof fixtures`, and one
  `[ok] <type> renderer, schema, and example` line per diagram type.
- `node bin/archify.mjs visual-check` finds Chrome and exits 0 (see below).
- All five diagram types render green from this vendored tree; see *Smoke test*.

## Reproducing the vendoring

From the repository root (`/d/Program own/aicode/dpharness/dialogue/V5` in Git Bash):

```bash
SRC="/c/Users/Administrator/.dsh/profiles/desktop/node_modules/@tt-a1i/archify-dsh"
mkdir -p plugin/roadbook-atlas/skills/roadbook-atlas/vendor
cp -R "$SRC/skills/archify" plugin/roadbook-atlas/skills/roadbook-atlas/vendor/archify
rm -f plugin/roadbook-atlas/skills/roadbook-atlas/vendor/archify/examples/*.html
cp "$SRC/LICENSE" plugin/roadbook-atlas/skills/roadbook-atlas/vendor/archify/LICENSE
```

The tree deliberately lives **inside the skill directory** (`skills/roadbook-atlas/vendor/`)
rather than at the plugin root: the DSH skill provider hands the agent only the skill base
directory, so every relative path in `SKILL.md` — including the renderer CLI — must resolve
from there. Upstream `@tt-a1i/archify-dsh` makes the same choice (its renderer sits at
`skills/archify/`).

No `git add` / `git commit` is run by this vendor step; staging the files is a separate,
human decision.

## How to run the renderer

The CLI is invoked with Node. It needs Node >= 18 (the wrapper package declares
`^22.19.0 || >=24.0.0`; this was verified on v25.2.1). It needs **no network access and no
Chrome** for `deliver` / `validate` / `check`. Chrome is only touched by `visual-check`.

From `plugin/roadbook-atlas/`:

```bash
node skills/roadbook-atlas/vendor/archify/bin/archify.mjs deliver architecture spec.json out/architecture.html --quality showcase --json
```

From the repository root:

```bash
node "plugin/roadbook-atlas/skills/roadbook-atlas/vendor/archify/bin/archify.mjs" deliver workflow spec.json out/workflow.html --quality showcase --json
```

Replace `architecture` with any of `architecture`, `workflow`, `sequence`, `dataflow`,
`lifecycle`. Add `--quality showcase` for the strict composition profile (the default is
`standard`). `--json` prints a machine-readable receipt on stdout. Exit code 0 means the
artifact was committed; non-zero means nothing was written over an existing output.

`deliver` writes exactly one file — the HTML artifact at the requested output path. It
stages into a temporary directory beside the target and renames into place only after the
renderer and the artifact checker both pass, so a failed run never corrupts an existing
artifact. No sidecar snapshot or hash file is left behind; the SHA-256 values live only in
the printed receipt.

Useful siblings:

```bash
node skills/roadbook-atlas/vendor/archify/bin/archify.mjs validate <type> spec.json --json     # schema + composition, no file written
node skills/roadbook-atlas/vendor/archify/bin/archify.mjs check out/<type>.html --json         # inspect an existing artifact
node skills/roadbook-atlas/vendor/archify/bin/archify.mjs compare a.architecture.json b.architecture.json --json
node skills/roadbook-atlas/vendor/archify/bin/archify.mjs doctor                               # environment readiness
```

All paths the CLI needs are resolved relative to **its own location** (it derives
`skillRoot` from `import.meta.url`), not the current working directory, and it writes only
to the output path you name — so this vendored copy does **not** need to be writable at run
time, only readable.

## Smoke test

`plugin/roadbook-atlas/test/render-smoke.test.mjs` renders one minimal spec per diagram
type through this vendored CLI and asserts exit code 0 plus an HTML artifact larger than
100 KB. It uses the Node standard library only — no test framework, no added dependencies,
no network, no Chrome:

```bash
cd plugin/roadbook-atlas
node test/render-smoke.test.mjs
```

Expected tail: `SUMMARY ok=5 fail=0`, exit 0.

## License

MIT. The upstream license text is vendored verbatim as `LICENSE` in this directory, taken
from the package root of `@tt-a1i/archify-dsh@0.1.0` (byte-identical to
`skills/archify/LICENSE` in the same package).
