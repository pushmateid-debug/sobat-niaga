const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

export const getNiagaGoFare = (distanceKm) => {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;

  const billableKm = Math.ceil(distanceKm);
  if (billableKm <= 3) return 8000;
  if (billableKm <= 5) return 10000;
  if (billableKm <= 8) return 12000;
  if (billableKm <= 10) return 14000;
  if (billableKm <= 12) return 15000;
  if (billableKm <= 15) return 18000;
  if (billableKm <= 20) return 23000;
  if (billableKm <= 25) return 28000;
  if (billableKm <= 30) return 33000;
  return null;
};

export const getOsrmRoute = async (start, end) => {
  if (!start || !end ||
      start.lat == null || start.lng == null || end.lat == null || end.lng == null ||
      start.lat === '' || start.lng === '' || end.lat === '' || end.lng === '') {
    throw new Error('Koordinat penjemputan dan tujuan tidak valid.');
  }

  const values = [start?.lat, start?.lng, end?.lat, end?.lng].map(Number);
  const [startLat, startLng, endLat, endLng] = values;
  if (!values.every(Number.isFinite) ||
      Math.abs(startLat) > 90 || Math.abs(endLat) > 90 ||
      Math.abs(startLng) > 180 || Math.abs(endLng) > 180) {
    throw new Error('Koordinat penjemputan dan tujuan tidak valid.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const url = `${OSRM_ROUTE_URL}/${startLng},${startLat};${endLng},${endLat}?overview=false&steps=false`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Layanan rute tidak dapat menghitung perjalanan saat ini.');

    const result = await response.json();
    const route = result.code === 'Ok' && Array.isArray(result.routes) ? result.routes[0] : null;
    if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      throw new Error('Rute jalan untuk lokasi tersebut tidak ditemukan.');
    }

    return {
      distanceKm: route.distance / 1000,
      durationMinutes: Math.ceil(route.duration / 60)
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Permintaan rute terlalu lama. Periksa koneksi lalu coba lagi.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
