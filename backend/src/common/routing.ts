/**
 * Calcula la distancia de la ruta en auto (km) entre dos puntos usando OSRM
 * (Open Source Routing Machine) — el mismo servicio que el front usa para
 * dibujar la ruta en el mapa, así el número coincide con lo que ve el usuario.
 *
 * Es best-effort: devuelve null si OSRM no responde o no hay ruta. El caller
 * decide qué hacer con el null (en nuestro caso, guardar distancia desconocida).
 */
export async function fetchRouteDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<number | null> {
  try {
    // OSRM espera las coordenadas como lng,lat (invertidas respecto a lat,lng).
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{ distance?: number }>;
    };

    if (data.code !== 'Ok' || !data.routes?.[0]?.distance) return null;

    // OSRM devuelve la distancia en metros; la pasamos a km redondeada a 1 decimal.
    return Math.round((data.routes[0].distance / 1000) * 10) / 10;
  } catch {
    return null;
  }
}
