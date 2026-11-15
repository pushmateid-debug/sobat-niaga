import { getNiagaGoFare, getOsrmRoute } from './niagaGoPricing';

describe('getNiagaGoFare', () => {
  test.each([
    [0, 8000],
    [3, 8000],
    [3.01, 10000],
    [5, 10000],
    [5.01, 12000],
    [8, 12000],
    [8.01, 14000],
    [10, 14000],
    [10.01, 15000],
    [12, 15000],
    [12.01, 18000],
    [15, 18000],
    [15.01, 23000],
    [20, 23000],
    [20.01, 28000],
    [25, 28000],
    [25.01, 33000],
    [30, 33000],
    [30.01, null]
  ])('charges the configured fare at %s route km', (distanceKm, expectedFare) => {
    expect(getNiagaGoFare(distanceKm)).toBe(expectedFare);
  });

  test.each([NaN, Infinity, -1])('rejects invalid route distance %s', (distanceKm) => {
    expect(getNiagaGoFare(distanceKm)).toBeNull();
  });
});

describe('getOsrmRoute', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (originalFetch) global.fetch = originalFetch;
    else delete global.fetch;
  });

  test('uses routed distance and duration from OSRM', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ distance: 6200, duration: 900 }]
      })
    });

    await expect(getOsrmRoute(
      { lat: -6.2, lng: 106.8 },
      { lat: -6.3, lng: 106.9 }
    )).resolves.toEqual({ distanceKm: 6.2, durationMinutes: 15 });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/106.8,-6.2;106.9,-6.3?'),
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  test('rejects invalid coordinates before requesting a route', async () => {
    await expect(getOsrmRoute(null, { lat: 1, lng: 2 })).rejects.toThrow('Koordinat');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not replace a failed route lookup with a straight-line estimate', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'NoRoute', routes: [] })
    });

    await expect(getOsrmRoute(
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 }
    )).rejects.toThrow('Rute jalan');
  });
});
