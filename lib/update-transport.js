/**
 * lib/update-transport.js —— `lib/update.js` 按关注点切出的一块（D14 第 1 条：单文件 ≤500 行）。
 *
 * 切法 = 按「纯逻辑 / 副作用的边界」切：本文件只装它自己那类关注点，跨文件的依赖走显式 import，
 * 不留隐式全局。barrel 仍是 `lib/update.js`，对外导出面与原文件逐名一致。
 */
import { join } from 'node:path';
import { getCACertificates } from 'node:tls';
import { DEFAULT_TIMEOUT_MS, DEFAULT_BODY_MAX_BYTES, DEFAULT_MAX_REDIRECTS } from './update-constants.js';
import { checkForUpdate } from './update-plan.js';

/** Node 是否支持读系统 CA（`tls.getCACertificates('system')`，Node 23.2+/22.15+）。 */
export function systemCaCertificates() {
  try {
    const list = getCACertificates('system');
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

/** 这个错误是不是「证书链验不过」——只有它才值得换一条传输再试。 */
export function isCertificateError(error) {
  const text = [
    error instanceof Error ? error.message : String(error ?? ''),
    error?.cause instanceof Error ? error.cause.message : String(error?.cause ?? ''),
    error?.cause?.code ?? '',
    error?.code ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return (
    text.includes('certificate') ||
    text.includes('unable to verify') ||
    text.includes('self signed') ||
    text.includes('self-signed') ||
    text.includes('cert_') ||
    text.includes('unable_to_verify')
  );
}

/**
 * 用 `node:https` 取一份文本（第二级传输）。返回与 `fetch` 同形的 `{ ok, status, text() }`，
 * 这样 `checkForUpdate` 不需要知道自己走的是哪一级。
 *
 * 三条与第一级对齐的行为（此前只有 `fetch` 有，于是「专门为 TLS 拦截机器准备的那一级」
 * 反而更弱）：① **总时限**——`timeout` 选项只是 socket 空闲超时，慢速滴答的服务器能拖到任意长，
 * 这里用 `setTimeout` 硬销毁；② 最多跟 5 跳 3xx（fetch 默认就跟，仓库改名后这一级不能变成永久 unknown）；
 * ③ 响应体上限，别把一份巨型响应读进内存。
 */
export function httpsGetText(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const ca = options.ca === undefined ? systemCaCertificates() : options.ca;
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_BODY_MAX_BYTES;
  const maxHops = Number.isFinite(options.maxHops) ? options.maxHops : DEFAULT_MAX_REDIRECTS;
  const attempt = (target, hops) =>
    new Promise((resolve, reject) => {
      const settings = { timeout: timeoutMs };
      if (Array.isArray(ca) && ca.length > 0) settings.ca = ca;
      const request = httpsRequest(target, settings, (response) => {
        const status = Number(response.statusCode);
        const location = response.headers?.location;
        if (status >= 300 && status < 400 && typeof location === 'string' && location !== '') {
          response.resume(); // 丢掉这一跳的响应体，否则 socket 不会释放
          if (hops >= maxHops) {
            reject(new Error(`redirect 次数超过 ${maxHops}：${target}`));
            return;
          }
          let next = null;
          try {
            next = new URL(location, target).toString();
          } catch {
            next = null;
          }
          if (next === null) {
            reject(new Error(`302 的 Location 读不懂：${location}`));
            return;
          }
          resolve(attempt(next, hops + 1));
          return;
        }
        let text = '';
        let bytes = 0;
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          bytes += Buffer.byteLength(chunk, 'utf8');
          if (bytes > maxBytes) {
            request.destroy(new Error(`响应体超过 ${maxBytes} 字节`));
            return;
          }
          text += chunk;
        });
        response.on('end', () => resolve({ ok: status >= 200 && status < 300, status, text: async () => text }));
        response.on('error', reject);
      });
      const deadline = setTimeout(() => request.destroy(new Error('timeout')), timeoutMs);
      if (typeof deadline.unref === 'function') deadline.unref();
      const done = () => clearTimeout(deadline);
      request.on('timeout', () => request.destroy(new Error('timeout')));
      request.on('error', (error) => {
        done();
        reject(error);
      });
      request.on('close', done);
      request.end();
    });
  return attempt(url, 0);
}

/**
 * 造一个「先 fetch、证书类错误再换系统 CA」的清单读取器。
 *
 * 返回的 `transport()` 是**证据**：这次判定是靠哪一级拿到的（写进观测文件与状态路由的 `transport` 字段），
 * 免得日后有人看到 `unknown` 分不清是「没网」还是「CA 不对」。
 */
export function createManifestFetcher(options = {}) {
  const baseFetch = typeof options.fetchImpl === 'function' ? options.fetchImpl : null;
  const fallback = typeof options.httpsImpl === 'function' ? options.httpsImpl : httpsGetText;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const allowSystemCa = options.systemCa !== false;
  const state = { transport: 'fetch', fallbacks: 0 };
  const fetchFn = async (url, init) => {
    if (baseFetch === null) throw new Error('fetch 不可用');
    try {
      const response = await baseFetch(url, init);
      state.transport = 'fetch';
      return response;
    } catch (error) {
      if (allowSystemCa !== true || !isCertificateError(error)) throw error;
      const response = await fallback(url, { timeoutMs, ca: systemCaCertificates() });
      state.transport = 'system-ca';
      state.fallbacks += 1;
      return response;
    }
  };
  return { fetch: fetchFn, transport: () => state.transport, fallbacks: () => state.fallbacks };
}

// ── 检查 ─────────────────────────────────────────────────────────────────────

/** Host 头（忽略端口）是不是 loopback：`127.0.0.1` / `localhost` / `[::1]`。 */
export function loopbackAuthority(host) {
  if (typeof host !== 'string' || host.trim() === '') return false;
  const lower = host.trim().toLowerCase();
  const name = lower.startsWith('[') ? lower.slice(0, lower.indexOf(']') + 1) : lower.split(':')[0];
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
}

/** 取请求头（Node 的平对象 / 标准 Headers 两种形状都认）。 */
export function headerOf(request, name) {
  const headers = request?.headers;
  if (headers === null || headers === undefined) return undefined;
  if (typeof headers.get === 'function') {
    const value = headers.get(name);
    return typeof value === 'string' ? value : undefined;
  }
  const value = headers[name.toLowerCase()] ?? headers[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * 本机请求守卫（DNS rebinding 防线，语义对齐 dshmarket 的 `sameOrigin`）。
 *
 * 为什么必须有：本插件的 `POST /roadbook/update/apply` 会**执行安装命令**。一个恶意页面可以把
 * `evil.com` 解析到 127.0.0.1，浏览器连到本机时 `Origin` 与 `Host` 都是 `evil.com` —— 只比这两个相等的
 * 守卫看不出来。**Host 是它伪造不了的那个头**，所以只有 Host 缺失（非浏览器客户端 / 桌面代理会剥掉）
 * 或明确是 loopback 时才放行；`Origin` 出现时必须与 Host 同 authority。
 */
export function trustedLocalRequest(request) {
  const host = headerOf(request, 'host');
  if (host !== undefined && !loopbackAuthority(host)) return false;
  if (headerOf(request, 'sec-fetch-site') === 'cross-site') return false;
  const origin = headerOf(request, 'origin');
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 收口错误文本（观测与日志里只留一行、有上限）。 */
export function errorText(error) {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return text.slice(0, 200);
}
