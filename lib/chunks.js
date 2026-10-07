/**
 * 客户端分块（chunk）的宿主半 —— `GET /roadbook/bundle/<名>.js`。
 *
 * 为什么必须自建这条路由：DSH 官方的 `/plugins/<id>/client.js` 只服务插件入口那一个文件名，
 * 服务不了任意分块名；而 ModuleLoader 的 `import()` 只解析 seed words / shell-own modules /
 * registered factories / boot graph rows —— 分块 id 一个都不在里面。⇒ 想按需取分块，
 * **路由与注入都只能自建**。
 * 契约来源是**读**出来的，不是猜的：本机已装的 `dsh-better-sidebar@0.24.1` 的
 * `src/bundle-route.ts`（129 行）+ `src/client/chunk-loader.ts`。本文件是它的 RoadBook 版，
 * 差异点与理由写在 `design/vnext-2026-10-07.md` §11.2。
 *
 * 安全边界（三条，缺一条就成了开放文件服务）：
 *   ① 名字白名单：路径必须逐字命中 `/roadbook/bundle/<名>.js`，且 `<名>` ∈ `CHUNK_NAMES`；
 *   ② 目录固定：只从**本模块所在目录**读 `client-<名>.js`，请求里没有任何一段能影响目录
 *      （先白名单后拼路径，不做「拼完再校验」——后者正是路径穿越的经典写法）；
 *   ③ 同源守卫：与 `/roadbook/update/*` 共用同一条 `trustedLocalRequest`（DNS rebinding 防线）。
 *
 * 缓存契约：`cache-control: no-cache` + 内容哈希 ETag（按 mtime/size 记忆化）+ 认 `If-None-Match`。
 * 浏览器每次都要复验，但没改过的分块回 304，而不是重下整份脚本。
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headerOf, trustedLocalRequest } from './update-transport.js';

/** 分块路由前缀。客户端半 `lib/client.js` 里的同名常量必须与本行逐字一致（有测试钉住）。 */
export const CHUNK_ROUTE_PREFIX = '/roadbook/bundle';
/**
 * 允许服务的分块名 —— **唯一事实源**。
 * 新增一个分块 = 先落 `lib/client-<名>.js`，再把名字登记到这里；漏登记的后果是响亮 404，
 * 不是静默 200（`test/chunks.test.mjs` 断言「磁盘上的分块文件 ⊆ 本清单」）。
 */
export const CHUNK_NAMES = ['evolve'];
/** 分块文件所在目录（本模块在 lib/ 下，分块与它同级）。 */
export const CHUNK_DIR = dirname(fileURLToPath(import.meta.url));
/** 分块 URL 的形状：一段小写名 + `.js`，没有子路径、没有点、没有百分号转义。 */
export const CHUNK_URL_RE = /^\/roadbook\/bundle\/([a-z0-9-]{1,64})\.js$/;
export const CHUNK_CONTENT_TYPE = 'text/javascript; charset=utf-8';

/** 从 pathname 取分块名；形状不对或不在白名单一律 `null`（路由要能对垃圾输入回 404，不抛错）。 */
export function chunkNameOf(pathname, allow = CHUNK_NAMES) {
  const match = CHUNK_URL_RE.exec(String(pathname ?? ''));
  if (match === null) return null;
  return allow.includes(match[1]) ? match[1] : null;
}

/** 从请求 URL 取分块名（只取 pathname：查询串与哈希都不参与判定）。 */
export function chunkNameFromUrl(url, allow = CHUNK_NAMES) {
  let pathname;
  try {
    pathname = new URL(String(url ?? '/'), 'http://dsh.internal').pathname;
  } catch {
    return null;
  }
  return chunkNameOf(pathname, allow);
}

/** 分块文件的绝对路径。名字已过白名单 ⇒ 调用方无法用请求内容把它指到别处。 */
export function chunkFileOf(name, dir = CHUNK_DIR) {
  return join(dir, `client-${name}.js`);
}

/** 内容哈希 ETag：引号包裹的 sha1 前 12 位（与宿主 client-modules 的 rev 同形状）。 */
export function etagOf(body) {
  return `"${createHash('sha1').update(body).digest('hex').slice(0, 12)}"`;
}

/** 写一个不带头部的简单响应（分块路由的错误分支只用得到这一种）。 */
function sendText(response, status, text) {
  try {
    response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end(text);
  } catch {
    try {
      response.end();
    } catch {
      /* 响应写不出去就到此为止 */
    }
  }
}

/**
 * 造分块路由的 handler。`dir` / `read` / `stat` / `fence` / `allow` 全可注入
 * （测试用临时目录 + 假文件系统；生产用默认值，接线层不传参数）。
 *
 * @returns {(request: object, response: object) => Promise<void>} 直接返回 promise 的 handler
 */
export function createChunkHandler(options = {}) {
  const dir = options.dir ?? CHUNK_DIR;
  const read = options.read ?? readFile;
  const statOf = options.stat ?? stat;
  const fence = options.fence ?? trustedLocalRequest;
  const allow = options.allow ?? CHUNK_NAMES;
  // 记忆化：只有 mtime 或 size 变了才重算哈希 —— 每个请求都哈希几十 KB 纯属浪费。
  const memo = new Map();

  /** 分块的元信息（ETag + 内容）；文件读不到返回 undefined（= 响亮 404，不是静默空脚本）。 */
  const metaFor = async (name) => {
    const path = chunkFileOf(name, dir);
    const key = `${dir}:${name}`;
    try {
      const info = await statOf(path);
      const hit = memo.get(key);
      if (hit !== undefined && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit;
      const body = await read(path);
      const meta = { mtimeMs: info.mtimeMs, size: info.size, etag: etagOf(body), body };
      memo.set(key, meta);
      return meta;
    } catch {
      return undefined;
    }
  };

  return async (request, response) => {
    if (!fence(request)) {
      sendText(response, 403, 'forbidden');
      return;
    }
    const method = String(request?.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      sendText(response, 405, 'method not allowed');
      return;
    }
    const name = chunkNameFromUrl(request?.url, allow);
    if (name === null) {
      sendText(response, 404, 'not found');
      return;
    }
    // 记忆里存的是「ETag + 内容」：只记 ETag 的话，每个请求仍要再读一遍文件才能送体，
    // 而这一层的全部意义就是「没变就别重复干活」。命中时只剩一次 stat。
    const meta = await metaFor(name);
    if (meta === undefined) {
      // 名字在白名单里、文件却读不到（还没落盘 / 被删 / stat 与 read 之间被换）—— 响亮 404，别回空脚本。
      sendText(response, 404, 'not found');
      return;
    }
    const headers = { 'content-type': CHUNK_CONTENT_TYPE, 'cache-control': 'no-cache', etag: meta.etag };
    if (headerOf(request, 'if-none-match') === meta.etag) {
      // 复验命中：内容没变，回 304 不带体（刷新页面 / HMR 重激活时省掉重下）。
      try {
        response.writeHead(304, { 'cache-control': 'no-cache', etag: meta.etag });
        response.end();
      } catch {
        /* 响应写不出去就到此为止 */
      }
      return;
    }
    // HEAD 只回报头部：与 GET 同一套头，但不写体（Node 的 res.end(body) 对 HEAD 会把体丢掉，
    // 与其依赖那层隐式行为，不如在这里显式分开——契约测试能直接钉住这一点）。
    try {
      response.writeHead(200, headers);
      response.end(method === 'HEAD' ? undefined : meta.body);
    } catch {
      /* 同上 */
    }
  };
}

/** 把分块路由挂到宿主 `webServer` 上；返回撤销函数（与其它路由同一套 disposer 口径）。 */
export function registerChunkRoutes(webServer, options = {}) {
  return webServer.register({
    kind: 'prefix',
    path: CHUNK_ROUTE_PREFIX,
    handler: createChunkHandler(options),
  });
}
