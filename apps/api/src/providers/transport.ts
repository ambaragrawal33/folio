export class ProviderUnavailable extends Error {
  readonly code: string;
  constructor(code: string) {
    super('Market provider is unavailable.');
    this.code = code;
  }
}
const allowed = new Map([
  ['api.frankfurter.dev', /^\/v2\/rates$/],
  ['api.coingecko.com', /^\/api\/v3\/coins\/(markets|[^/]+\/market_chart)$/],
  ['query1.finance.yahoo.com', /^\/v8\/finance\/chart\/[^/]+$/],
  ['query2.finance.yahoo.com', /^\/v8\/finance\/chart\/[^/]+$/],
]);
export class ProviderTransport {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  constructor(fetcher: typeof fetch = fetch, timeoutMs = 5000, maxBytes = 2 * 1024 * 1024) {
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
  }
  async text(address: string, headers: HeadersInit = {}) {
    const url = new URL(address);
    const path = allowed.get(url.hostname);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !path?.test(url.pathname)
    )
      throw new ProviderUnavailable('HOST_REJECTED');
    const response = await this.fetcher(url, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok)
      throw new ProviderUnavailable(response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR');
    if (Number(response.headers.get('content-length') ?? '0') > this.maxBytes)
      throw new ProviderUnavailable('RESPONSE_TOO_LARGE');
    const reader = response.body?.getReader();
    if (!reader) throw new ProviderUnavailable('EMPTY_RESPONSE');
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > this.maxBytes) throw new ProviderUnavailable('RESPONSE_TOO_LARGE');
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
    }
    return text;
  }
}
