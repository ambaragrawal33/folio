import { describe, it, expect, vi } from 'vitest';
import { instrumentMaster } from '../src/models/instrument-master.ts';
import {
  InstrumentDiscovery,
  catalogueSearch,
  verifiedRegistry,
  gatedDiscovery,
} from '../src/providers/discovery.ts';
import type { DiscoveryAdapter } from '../src/providers/discovery.ts';
const a = instrumentMaster.find((i) => i.id === 'AAPL:US')!;
const ids = (q: string, limit = 30) =>
  catalogueSearch(instrumentMaster, q, limit).instruments.map((i) => i.id);
describe('verified canonical discovery', () => {
  it('searches exact symbol/name/partial/case/canonical and provider aliases deterministically', () => {
    expect(ids('AAPL')).toEqual(['AAPL:US']);
    expect(ids('apple inc.')).toEqual(['AAPL:US']);
    expect(ids('  aApL  ')).toEqual(['AAPL:US']);
    expect(ids('INFY')).toEqual(['INFY:BSE', 'INFY:NSE']);
    expect(ids('infosys')).toEqual(['INFY:BSE', 'INFY:NSE']);
    expect(ids('infy.ns')).toEqual(['INFY:NSE']);
    expect(ids('yahoo:INFY.NS')).toEqual(['INFY:NSE']);
    expect(ids('tcs:nse')[0]).toBe('TCS:NSE');
    expect(ids('532540')).toEqual(['TCS:BSE']);
    expect(ids('bitcoin')).toEqual(['BTC:CRYPTO']);
    expect(ids('solana')).toEqual(['SOL:CRYPTO']);
    expect(ids('NSE INR')).toEqual(['INFY:NSE', 'TCS:NSE']);
    expect(ids('.*')).toEqual([]);
    expect(catalogueSearch([...instrumentMaster].reverse(), 'tcs', 1)).toEqual(
      catalogueSearch(instrumentMaster, 'tcs', 1),
    );
    expect(catalogueSearch(instrumentMaster, '', 2)).toMatchObject({
      instruments: [{ id: 'AAPL:US' }, { id: 'BTC:CRYPTO' }],
      truncated: true,
    });
    expect(ids('unsupported')).toEqual([]);
  });
  it('preserves exact verified currencies, original semantics, primary aliases and rejects conflicting registry input', () => {
    expect(instrumentMaster).toHaveLength(13);
    expect(instrumentMaster.every((i) => i.sector === 'Unknown' && i.metadataSource)).toBe(true);
    for (const i of instrumentMaster)
      expect(i.currency).toBe(['NSE', 'BSE'].includes(i.exchange) ? 'INR' : 'USD');
    expect(verifiedRegistry([a, a])).toEqual([a]);
    expect(() => verifiedRegistry([a, { ...a, currency: 'INR' }])).toThrow();
    expect(() => verifiedRegistry([a, { ...a, name: 'conflicting' }])).toThrow('Conflicting');
    expect(() => verifiedRegistry([a, { ...a, id: 'OTHER:US' }])).toThrow('provider alias');
    expect(() =>
      verifiedRegistry([a, { ...a, id: 'OTHER:US', providerId: 'OTHER', aliases: ['AAPL'] }]),
    ).toThrow('provider alias');
    expect(() => verifiedRegistry([{ ...a, id: 'wrong' }])).toThrow();
    expect(() => verifiedRegistry([{ ...a, assetClass: 'crypto' }])).toThrow();
  });
  it('never activates unauthorized/capability/key/coverage providers and strictly caps inputs', async () => {
    const call = vi.fn(async () => [a]);
    for (const field of [
      'search',
      'entitlementVerified',
      'coverageVerified',
      'credentialsVerified',
    ] as const) {
      const adapter: DiscoveryAdapter = {
        provider: 'test',
        capabilities: {
          search: true,
          entitlementVerified: true,
          coverageVerified: true,
          credentialsVerified: true,
          [field]: false,
        },
        unavailableReason: 'Unavailable by verification gate',
        search: call,
      };
      expect(
        (await new InstrumentDiscovery([adapter]).search(instrumentMaster, { q: 'aapl' }))
          .providers[0]?.status,
      ).toBe('capability-unavailable');
    }
    expect(call).not.toHaveBeenCalled();
    expect((await gatedDiscovery().search(instrumentMaster, { q: 'INFY' })).providers).toHaveLength(
      2,
    );
    for (const input of [
      { q: 'x'.repeat(101) },
      { q: '\u0000' },
      { q: 'x', limit: 0 },
      { q: 'x', limit: 31 },
      { q: 'x', owner: 'injected' },
    ])
      await expect(gatedDiscovery().search(instrumentMaster, input)).rejects.toThrow();
    expect(
      () =>
        new InstrumentDiscovery(
          Array.from({ length: 6 }, () => ({
            provider: 'duplicate',
            capabilities: {
              search: false,
              entitlementVerified: false,
              coverageVerified: false,
              credentialsVerified: false,
            },
            unavailableReason: 'no',
            search: call,
          })),
        ),
    ).toThrow();
    expect(
      () =>
        new InstrumentDiscovery([
          {
            provider: 'same',
            capabilities: {
              search: false,
              entitlementVerified: false,
              coverageVerified: false,
              credentialsVerified: false,
            },
            unavailableReason: 'no',
            search: call,
          },
          {
            provider: 'same',
            capabilities: {
              search: false,
              entitlementVerified: false,
              coverageVerified: false,
              credentialsVerified: false,
            },
            unavailableReason: 'no',
            search: call,
          },
        ]),
    ).toThrow();
  });
  it('rejects malformed/unknown/conflicting provider identities and falls back only to permitted adapters', async () => {
    const capabilities = {
      search: true,
      entitlementVerified: true,
      coverageVerified: true,
      credentialsVerified: true,
    };
    for (const response of [
      { bad: true },
      Array(31).fill(a),
      [{ ...a, currency: 'INR' }],
      [{ ...a, id: 'UNKNOWN:US' }],
      [{ ...a, name: 'Unverified name' }],
    ]) {
      const r = await new InstrumentDiscovery([
        { provider: 'first', capabilities, unavailableReason: '', search: async () => response },
      ]).search(instrumentMaster, { q: 'aapl' });
      expect(r.providers[0]?.status).toBe('invalid-response');
      expect(r.instruments).toEqual([a]);
    }
    const forbidden = vi.fn(async () => [a]),
      fallback = vi.fn(async () => [a]);
    const r = await new InstrumentDiscovery([
      {
        provider: 'outage',
        capabilities,
        unavailableReason: '',
        search: async () => {
          throw Error('offline');
        },
      },
      {
        provider: 'forbidden',
        capabilities: { ...capabilities, entitlementVerified: false },
        unavailableReason: 'No rights',
        search: forbidden,
      },
      { provider: 'permitted', capabilities, unavailableReason: '', search: fallback },
    ]).search(instrumentMaster, { q: 'AAPL' });
    expect(r.providers.map((p) => p.status)).toEqual([
      'unavailable',
      'capability-unavailable',
      'available',
    ]);
    expect(forbidden).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith('AAPL', 20);
    expect(
      (
        await new InstrumentDiscovery([
          { provider: 'permitted', capabilities, unavailableReason: '', search: fallback },
        ]).search(instrumentMaster, { q: '' })
      ).providers,
    ).toEqual([]);
  });
  it('bounds provider timeouts without changing the verified catalogue', async () => {
    vi.useFakeTimers();
    try {
      const p = new InstrumentDiscovery([
        {
          provider: 'timeout',
          capabilities: {
            search: true,
            entitlementVerified: true,
            coverageVerified: true,
            credentialsVerified: true,
          },
          unavailableReason: '',
          search: () => new Promise(() => {}),
        },
      ]).search(instrumentMaster, { q: 'aapl' });
      await vi.advanceTimersByTimeAsync(3001);
      expect((await p).providers[0]?.status).toBe('unavailable');
      expect((await p).instruments).toEqual([a]);
    } finally {
      vi.useRealTimers();
    }
  });
});
