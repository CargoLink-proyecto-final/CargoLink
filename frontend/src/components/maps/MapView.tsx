'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

// Custom colored icons for origin (green), destination (red), truck (blue)
function createColorIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background: ${color};
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const originIcon = createColorIcon('#22c55e');
const destIcon = createColorIcon('#ef4444');
const truckIcon = createColorIcon('#3b82f6');

function getIconForMarker(marker: MapMarker) {
  if (marker.id === 'origin' || marker.id.endsWith('-origin')) return originIcon;
  if (marker.id === 'dest' || marker.id.endsWith('-dest')) return destIcon;
  if (marker.id === 'truck' || marker.id === 'current') return truckIcon;
  return defaultIcon;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  status?: string;
}

export interface RouteData {
  coordinates: [number, number][];
  color?: string;
}

interface MapViewProps {
  markers?: MapMarker[];
  routes?: RouteData[];
  center?: [number, number];
  zoom?: number;
}

export default function MapView({
  markers = [],
  routes = [],
  center = [-34.6037, -58.3816],
  zoom = 6,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: center as L.LatLngExpression,
      zoom,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    routesLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    // Fix rendering in dynamic containers
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      routesLayerRef.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], { icon: getIconForMarker(m) });
      marker.bindPopup(`<strong>${m.title}</strong>${m.status ? `<br/>${m.status}` : ''}`);
      layer.addLayer(marker);
    });
  }, [markers]);

  // Update routes (with serialization to avoid redundant redraws)
  const prevRouteKeyRef = useRef('');
  useEffect(() => {
    const map = mapRef.current;
    const layer = routesLayerRef.current;
    if (!map || !layer) return;

    // Build stable key to detect actual data changes
    const key = routes.map((r) => `${r.coordinates.length}:${r.color}`).join('|');
    if (key === prevRouteKeyRef.current) return;
    prevRouteKeyRef.current = key;

    layer.clearLayers();

    routes.forEach((route) => {
      if (route.coordinates.length < 2) return;
      const polyline = L.polyline(route.coordinates, {
        color: route.color || '#3b82f6',
        weight: 4,
        opacity: 0.8,
      });
      layer.addLayer(polyline);
    });
  }, [routes]);

  // Fit bounds when markers or routes change (with stable key to prevent thrashing)
  const prevBoundsKeyRef = useRef('');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const points: L.LatLngExpression[] = [];
    markers.forEach((m) => points.push([m.lat, m.lng]));
    routes.forEach((r) => r.coordinates.forEach((c) => points.push(c)));

    if (points.length < 2) return;

    const key = `${points.length}-${JSON.stringify(points[0])}-${JSON.stringify(points[points.length - 1])}`;
    if (key === prevBoundsKeyRef.current) return;
    prevBoundsKeyRef.current = key;

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }, [markers, routes]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
}
