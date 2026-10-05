import { Instrument, InstrumentSearchQuery, InstrumentSearchResponse } from '@folio/shared';
import type { z } from 'zod';

export interface DiscoveryAdapter {
  readonly provider: string;
  readonly capabilities: {
    search: boolean;
    entitlementVerified: boolean;
    coverageVerified: boolean;
    credentialsVerified: boolean;
  };
  readonly unavailableReason: string;
  // Candidates are untrusted; they cannot create or change canonical instruments.
  search(query: string, limit: number): Promise<unknown>;
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const normalize = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function verifiedRegistry(values: readonly z.infer<typeof Instrument>[]) {
  const ids = new Map<string, z.infer<typeof Instrument>>(),
    aliases = new Map<string, string>();
  for (const input of values) {
    const i = Instrument.parse(input);
    if (
      !/^[A-Z0-9.&-]+:(NSE|BSE|US|CRYPTO)$/.test(i.id) ||
      !i.id.endsWith(':' + i.exchange) ||
      i.currency !== (['NSE', 'BSE'].includes(i.exchange) ? 'INR' : 'USD') ||
      (i.assetClass === 'crypto') !== (i.exchange === 'CRYPTO')
    )
      throw new Error('Instrument identity/currency convention is invalid');
    const previous = ids.get(i.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(i))
      throw new Error('Conflicting canonical identity');
    for (const value of [i.providerId, ...(i.aliases ?? [])]) {
      const alias = normalize(i.provider + ':' + value);
      if (aliases.has(alias) && aliases.get(alias) !== i.id)
        throw new Error('Conflicting provider alias');
      aliases.set(alias, i.id);
    }
    ids.set(i.id, i);
  }
  return [...ids.values()].sort((a, b) => compare(a.id, b.id));
}
export function catalogueSearch(
  master: readonly z.infer<typeof Instrument>[],
  raw: string,
  limit: number,
) {
  const query = normalize(raw);
  const ranked = verifiedRegistry(master)
    .map((i) => {
      const symbol = normalize(i.symbol),
        name = normalize(i.name),
        aliases = [i.providerId, i.provider + ':' + i.providerId, ...(i.aliases ?? [])].map(
          normalize,
        );
      const text = [
        i.id,
        i.symbol,
        i.name,
        i.exchange,
        i.currency,
        i.providerId,
        i.provider + ':' + i.providerId,
        ...(i.aliases ?? []),
      ]
        .map(normalize)
        .join(' ');
      const match = !query || query.split(' ').every((t) => text.includes(t));
      const rank =
        normalize(i.id) === query
          ? 0
          : aliases.includes(query)
            ? 1
            : symbol === query
              ? 2
              : name === query
                ? 3
                : symbol.startsWith(query)
                  ? 4
                  : 5;
      return { i, rank, match };
    })
    .filter((x) => x.match)
    .sort((a, b) => a.rank - b.rank || compare(a.i.symbol, b.i.symbol) || compare(a.i.id, b.i.id));
  return { instruments: ranked.slice(0, limit).map((x) => x.i), truncated: ranked.length > limit };
}
export class InstrumentDiscovery {
  private readonly adapters: readonly DiscoveryAdapter[];
  constructor(adapters: readonly DiscoveryAdapter[] = []) {
    this.adapters = adapters;
    if (adapters.length > 5 || new Set(adapters.map((a) => a.provider)).size !== adapters.length)
      throw new Error('Invalid discovery adapter registry');
  }
  async search(
    master: readonly z.infer<typeof Instrument>[],
    input: z.input<typeof InstrumentSearchQuery>,
  ) {
    const { q, limit } = InstrumentSearchQuery.parse(input);
    const catalogue = verifiedRegistry(master),
      providers: z.infer<typeof InstrumentSearchResponse>['providers'] = [];
    for (const adapter of this.adapters) {
      const c = adapter.capabilities;
      if (!c.search || !c.entitlementVerified || !c.coverageVerified || !c.credentialsVerified) {
        providers.push({
          provider: adapter.provider,
          status: 'capability-unavailable',
          reason: adapter.unavailableReason,
        });
        continue;
      }
      if (!q) continue;
      try {
        // Bound a permitted search adapter. Timeout never changes the identity catalogue.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const rows = await Promise.race([
          adapter.search(q, limit),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Discovery timeout')), 3000);
          }),
        ]).finally(() => clearTimeout(timer));
        const parsed = Instrument.array().max(30).safeParse(rows);
        if (
          !parsed.success ||
          parsed.data.some(
            (candidate) =>
              !catalogue.some(
                (i) =>
                  i.id === candidate.id &&
                  i.provider === candidate.provider &&
                  i.providerId === candidate.providerId &&
                  i.currency === candidate.currency &&
                  i.exchange === candidate.exchange &&
                  i.assetClass === candidate.assetClass &&
                  i.symbol === candidate.symbol &&
                  i.name === candidate.name,
              ),
          )
        ) {
          providers.push({
            provider: adapter.provider,
            status: 'invalid-response',
            reason: 'Provider identity could not be verified against the canonical catalogue.',
          });
          continue;
        }
        providers.push({
          provider: adapter.provider,
          status: 'available',
          reason: 'Provider candidates validated against the existing verified catalogue.',
        });
        break;
      } catch {
        providers.push({
          provider: adapter.provider,
          status: 'unavailable',
          reason: 'Provider search is unavailable. The verified catalogue remains searchable.',
        });
      }
    }
    return InstrumentSearchResponse.parse({
      ...catalogueSearch(catalogue, q, limit),
      limit,
      source: 'verified-catalogue',
      providers,
    });
  }
}
export function gatedDiscovery() {
  return new InstrumentDiscovery(
    ['yahoo', 'coingecko'].map((provider) => ({
      provider,
      capabilities: {
        search: false,
        entitlementVerified: false,
        coverageVerified: false,
        credentialsVerified: false,
      },
      unavailableReason:
        provider === 'yahoo'
          ? 'Live Yahoo discovery is unavailable: search/display entitlement is not verified.'
          : 'Live CoinGecko discovery is unavailable: keyed search entitlement and smoke verification are pending.',
      search: async () => {
        throw new Error('Unverified provider discovery must never run');
      },
    })),
  );
}
