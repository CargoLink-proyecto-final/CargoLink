import { fetchRouteDistanceKm } from './routing';

describe('fetchRouteDistanceKm', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const mockFetch = (impl: jest.Mock) => {
    global.fetch = impl as unknown as typeof fetch;
  };

  it('returns the distance in km rounded to 1 decimal for a valid OSRM response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 12345 }] }),
    });
    mockFetch(fetchMock);

    const result = await fetchRouteDistanceKm(-34.6, -58.4, -31.4, -64.2);

    // 12345 m -> 12.345 km -> rounded to 12.3
    expect(result).toBe(12.3);
  });

  it('builds the OSRM url with lng,lat ordering and overview=false', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 1000 }] }),
    });
    mockFetch(fetchMock);

    await fetchRouteDistanceKm(10, 20, 30, 40);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    // origin: lat=10,lng=20 -> "20,10"; dest: lat=30,lng=40 -> "40,30"
    expect(calledUrl).toContain('/driving/20,10;40,30');
    expect(calledUrl).toContain('overview=false');
  });

  it('passes an abort signal so a stalled OSRM cannot hang the caller', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 1000 }] }),
    });
    mockFetch(fetchMock);

    await fetchRouteDistanceKm(10, 20, 30, 40);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns null when the HTTP response is not ok', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await fetchRouteDistanceKm(1, 2, 3, 4)).toBeNull();
  });

  it('returns null when OSRM code is not "Ok"', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'NoRoute', routes: [] }),
      }),
    );
    expect(await fetchRouteDistanceKm(1, 2, 3, 4)).toBeNull();
  });

  it('returns null when there are no routes', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'Ok', routes: [] }),
      }),
    );
    expect(await fetchRouteDistanceKm(1, 2, 3, 4)).toBeNull();
  });

  it('returns null when the first route has no distance', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'Ok', routes: [{}] }),
      }),
    );
    expect(await fetchRouteDistanceKm(1, 2, 3, 4)).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error('network down')));
    expect(await fetchRouteDistanceKm(1, 2, 3, 4)).toBeNull();
  });

  it('returns null when json parsing throws', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('bad json');
        },
      }),
    );
    expect(await fetchRouteDistanceKm(1, 2, 3, 4)).toBeNull();
  });
});
