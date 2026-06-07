import {
  fetchRoute,
  reverseGeocode,
  geocodeAddress,
  geocodeStructured,
} from './routing';

// Helper to build a fake fetch Response.
function fakeResponse(
  body: unknown,
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {},
): Partial<Response> {
  return {
    ok,
    status,
    json: async () => body,
  };
}

const mockFetch = jest.fn();

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('fetchRoute', () => {
  it('returns OSRM geometry converted from [lng,lat] to [lat,lng]', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeResponse({
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [
                [10, 20],
                [30, 40],
              ],
            },
          },
        ],
      }),
    );

    const result = await fetchRoute(20, 10, 40, 30);

    expect(result).toEqual([
      [20, 10],
      [40, 30],
    ]);
    // Sanity check the URL uses lng,lat ordering.
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/driving/10,20;30,40');
  });

  it('falls back to a straight line when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce(fakeResponse({}, { ok: false, status: 500 }));

    const result = await fetchRoute(1, 2, 3, 4);

    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('falls back to a straight line when data.code is not Ok', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeResponse({ code: 'NoRoute', routes: [] }),
    );

    const result = await fetchRoute(1, 2, 3, 4);

    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('falls back to a straight line when no routes are returned', async () => {
    mockFetch.mockResolvedValueOnce(fakeResponse({ code: 'Ok' }));

    const result = await fetchRoute(1, 2, 3, 4);

    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('falls back to a straight line when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const result = await fetchRoute(1, 2, 3, 4);

    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('reverseGeocode', () => {
  it('returns null for NaN coordinates without fetching', async () => {
    const result = await reverseGeocode(NaN, 10);

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns the trimmed display_name on success', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeResponse({ display_name: '  Calle Falsa 123, Pilar  ' }),
    );

    const result = await reverseGeocode(-34.6, -58.4);

    expect(result).toBe('Calle Falsa 123, Pilar');
  });

  it('returns null when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce(fakeResponse({}, { ok: false, status: 404 }));

    const result = await reverseGeocode(-34.6, -58.4);

    expect(result).toBeNull();
  });

  it('returns null when display_name is missing', async () => {
    mockFetch.mockResolvedValueOnce(fakeResponse({}));

    const result = await reverseGeocode(-34.6, -58.4);

    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));

    const result = await reverseGeocode(-34.6, -58.4);

    expect(result).toBeNull();
  });
});

describe('geocodeAddress', () => {
  it('returns null for an empty/whitespace address without fetching', async () => {
    const result = await geocodeAddress('   ');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('parses lat/lng on success', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeResponse([
        { lat: '-34.6037', lon: '-58.3816', display_name: 'Buenos Aires' },
      ]),
    );

    const result = await geocodeAddress('Buenos Aires');

    expect(result).toEqual({
      lat: -34.6037,
      lng: -58.3816,
      displayName: 'Buenos Aires',
    });
  });

  it('returns null for an empty results array', async () => {
    mockFetch.mockResolvedValueOnce(fakeResponse([]));

    const result = await geocodeAddress('Nowhere');

    expect(result).toBeNull();
  });

  it('returns null when the response is not ok', async () => {
    mockFetch.mockResolvedValueOnce(fakeResponse([], { ok: false, status: 500 }));

    const result = await geocodeAddress('Buenos Aires');

    expect(result).toBeNull();
  });

  it('returns null when parsed coordinates are NaN', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeResponse([{ lat: 'abc', lon: 'def', display_name: 'Bad' }]),
    );

    const result = await geocodeAddress('Buenos Aires');

    expect(result).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom'));

    const result = await geocodeAddress('Buenos Aires');

    expect(result).toBeNull();
  });
});

describe('geocodeStructured', () => {
  it('returns null when all parts are empty', async () => {
    const result = await geocodeStructured({
      street: '  ',
      city: '',
      state: undefined,
      postalcode: 'no-digits',
    });

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Layer 1: returns coords + address on an exact structured hit', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeResponse([
        {
          lat: '-31.68',
          lon: '-63.88',
          display_name: 'José Hernández 706, Pilar',
          address: { city: 'Pilar', state: 'Córdoba' },
        },
      ]),
    );

    const result = await geocodeStructured({
      street: 'José Hernández 706',
      city: 'Pilar',
      state: 'Córdoba',
      postalcode: 'X5972',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      lat: -31.68,
      lng: -63.88,
      displayName: 'José Hernández 706, Pilar',
      address: { city: 'Pilar', state: 'Córdoba' },
    });

    // Verify Layer 1 params include street + the 4-digit postal core.
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('street=');
    expect(url).toContain('postalcode=5972');
    expect(url).toContain('city=Pilar');
  });

  it('pickBest prefers the candidate whose locality matches the typed city', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeResponse([
        {
          lat: '-31.0',
          lon: '-63.0',
          display_name: 'José Hernández 706, Laguna Larga',
          address: { city: 'Laguna Larga' },
        },
        {
          lat: '-31.68',
          lon: '-63.88',
          display_name: 'José Hernández 706, Pilar',
          address: { city: 'Pilar' },
        },
      ]),
    );

    const result = await geocodeStructured({
      street: 'José Hernández 706',
      city: 'Pilar',
    });

    expect(result?.lat).toBe(-31.68);
    expect(result?.displayName).toContain('Pilar');
  });

  it('falls through Layer 1 (empty) → Layer 2 free-text', async () => {
    jest.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(fakeResponse([])) // Layer 1 empty
        .mockResolvedValueOnce(
          fakeResponse([
            {
              lat: '-31.68',
              lon: '-63.88',
              display_name: 'Free text hit, Pilar',
              address: { city: 'Pilar' },
            },
          ]),
        ); // Layer 2 hit

      const promise = geocodeStructured({
        street: 'Calle Inexistente 999',
        city: 'Pilar',
        state: 'Córdoba',
      });

      // Advance past the RATE_LIMIT_MS sleep before Layer 2.
      await jest.advanceTimersByTimeAsync(1200);

      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const url2 = mockFetch.mock.calls[1][0] as string;
      // Layer 2 is a free-text query (q=...) including "Argentina".
      expect(url2).toContain('q=');
      expect(decodeURIComponent(url2)).toContain('Argentina');
      expect(result?.displayName).toBe('Free text hit, Pilar');
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls through Layers 1+2 (empty) → Layer 3 street-level with house number dropped', async () => {
    jest.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(fakeResponse([])) // Layer 1 empty
        .mockResolvedValueOnce(fakeResponse([])) // Layer 2 empty
        .mockResolvedValueOnce(
          fakeResponse([
            {
              lat: '-31.68',
              lon: '-63.88',
              display_name: 'José Hernández, Pilar',
              address: { city: 'Pilar' },
            },
          ]),
        ); // Layer 3 hit

      const promise = geocodeStructured({
        street: 'José Hernández 706',
        city: 'Pilar',
      });

      // Two sleeps (before Layer 2 and Layer 3).
      await jest.advanceTimersByTimeAsync(1200);
      await jest.advanceTimersByTimeAsync(1200);

      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
      const url3 = mockFetch.mock.calls[2][0] as string;
      // URLSearchParams encodes spaces as '+'; decode the rest.
      const decoded3 = decodeURIComponent(url3).replace(/\+/g, ' ');
      // Layer 3 uses street name without the trailing house number.
      expect(decoded3).toContain('street=José Hernández');
      expect(decoded3).not.toContain('706');
      expect(result?.displayName).toBe('José Hernández, Pilar');
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns null when every layer comes back empty', async () => {
    jest.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(fakeResponse([]))
        .mockResolvedValueOnce(fakeResponse([]))
        .mockResolvedValueOnce(fakeResponse([]));

      const promise = geocodeStructured({
        street: 'José Hernández 706',
        city: 'Pilar',
      });

      await jest.advanceTimersByTimeAsync(1200);
      await jest.advanceTimersByTimeAsync(1200);

      const result = await promise;

      expect(result).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns null when the best candidate has unparseable coordinates', async () => {
    mockFetch.mockResolvedValueOnce(
      fakeResponse([
        { lat: 'xxx', lon: 'yyy', display_name: 'Bad', address: {} },
      ]),
    );

    const result = await geocodeStructured({ street: 'Foo 1', city: 'Pilar' });

    expect(result).toBeNull();
  });
});
