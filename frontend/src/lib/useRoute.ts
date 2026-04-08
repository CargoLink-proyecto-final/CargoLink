'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchRoute } from './routing';

/**
 * Hook to fetch an OSRM route between two points.
 * Uses React Query for caching, retries, and state management.
 */
export function useRoute(
  originLat?: number,
  originLng?: number,
  destLat?: number,
  destLng?: number,
) {
  const enabled = originLat != null && originLng != null && destLat != null && destLng != null;

  const { data: routeCoords = [] } = useQuery({
    queryKey: ['osrm-route', originLat, originLng, destLat, destLng],
    queryFn: () => fetchRoute(originLat!, originLng!, destLat!, destLng!),
    enabled,
    staleTime: Infinity, // Route doesn't change — cache forever
    retry: 2,
    retryDelay: 1500,
  });

  const routes = routeCoords.length > 0
    ? [{ coordinates: routeCoords, color: '#3b82f6' }]
    : [];

  return routes;
}
