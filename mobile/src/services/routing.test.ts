import { fetchRoute } from './routing';

const ORIGIN_LAT = -34.6;
const ORIGIN_LNG = -58.4;
const DEST_LAT = -34.9;
const DEST_LNG = -56.2;

const STRAIGHT_LINE = [
  { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG },
  { latitude: DEST_LAT, longitude: DEST_LNG },
];

describe('fetchRoute (OSRM)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = jest.fn();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('maps geojson [lng, lat] coordinates to { latitude, longitude }', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [
                [ORIGIN_LNG, ORIGIN_LAT],
                [-57.3, -34.75],
                [DEST_LNG, DEST_LAT],
              ],
            },
          },
        ],
      }),
    });

    const result = await fetchRoute(ORIGIN_LAT, ORIGIN_LNG, DEST_LAT, DEST_LNG);

    expect(result).toEqual([
      { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG },
      { latitude: -34.75, longitude: -57.3 },
      { latitude: DEST_LAT, longitude: DEST_LNG },
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('builds the OSRM url with origin/dest in lng,lat order', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ geometry: { coordinates: [] } }],
      }),
    });

    await fetchRoute(ORIGIN_LAT, ORIGIN_LNG, DEST_LAT, DEST_LNG);

    expect(global.fetch).toHaveBeenCalledWith(
      `https://router.project-osrm.org/route/v1/driving/${ORIGIN_LNG},${ORIGIN_LAT};${DEST_LNG},${DEST_LAT}?overview=full&geometries=geojson`,
    );
  });

  it('falls back to a straight line when response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const result = await fetchRoute(ORIGIN_LAT, ORIGIN_LNG, DEST_LAT, DEST_LNG);

    expect(result).toEqual(STRAIGHT_LINE);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to a straight line when code is not "Ok"', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'NoRoute', routes: [{ geometry: { coordinates: [] } }] }),
    });

    const result = await fetchRoute(ORIGIN_LAT, ORIGIN_LNG, DEST_LAT, DEST_LNG);

    expect(result).toEqual(STRAIGHT_LINE);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to a straight line when routes are missing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [] }),
    });

    const result = await fetchRoute(ORIGIN_LAT, ORIGIN_LNG, DEST_LAT, DEST_LNG);

    expect(result).toEqual(STRAIGHT_LINE);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to a straight line when fetch throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const result = await fetchRoute(ORIGIN_LAT, ORIGIN_LNG, DEST_LAT, DEST_LNG);

    expect(result).toEqual(STRAIGHT_LINE);
    expect(warnSpy).toHaveBeenCalled();
  });
});
