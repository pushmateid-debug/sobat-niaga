const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

// Helper: Hitung jarak Haversine antara dua koordinat (dalam km)
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Estimasi durasi berdasarkan jarak (asumsi rata-rata 30 km/jam di kota)
const estimateDurationFromDistance = (distanceKm) => {
  const avgSpeedKmh = 30;
  return Math.ceil((distanceKm / avgSpeedKmh) * 60);
};

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

  // Coba OSRM dengan timeout 8 detik
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `${OSRM_ROUTE_URL}/${startLng},${startLat};${endLng},${endLat}?overview=false&steps=false`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) throw new Error('OSRM tidak merespon dengan baik.');

    const result = await response.json();
    const route = result.code === 'Ok' && Array.isArray(result.routes) ? result.routes[0] : null;
    if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      throw new Error('Rute OSRM tidak ditemukan.');
    }

    return {
      distanceKm: route.distance / 1000,
      durationMinutes: Math.ceil(route.duration / 60)
    };
  } catch (error) {
    // Fallback: Gunakan Haversine + multiplier 1.3 untuk estimasi jalan darat
    const straightDistance = haversineDistance(startLat, startLng, endLat, endLng);
    const estimatedRoadDistance = straightDistance * 1.3;
    const estimatedDuration = estimateDurationFromDistance(estimatedRoadDistance);

    console.warn('OSRM gagal, menggunakan estimasi Haversine:', error.message);

    return {
      distanceKm: Number(estimatedRoadDistance.toFixed(2)),
      durationMinutes: estimatedDuration,
      isEstimated: true
    };
  } finally {
    clearTimeout(timeout);
  }
};