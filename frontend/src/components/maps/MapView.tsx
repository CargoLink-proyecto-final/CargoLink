'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);

  // Store latest props in refs so the init effect can access current data
  const markersRef = useRef(markers);
  const routesRef = useRef(routes);
  markersRef.current = markers;
  routesRef.current = routes;

  // Initialize map once
  useEffect(() => {
    if (!wrapperRef.current) return;

    const mapDiv = document.createElement('div');
    mapDiv.style.height = '100%';
    mapDiv.style.width = '100%';
    wrapperRef.current.innerHTML = '';
    wrapperRef.current.appendChild(mapDiv);

    const map = L.map(mapDiv, {
      center: center as L.LatLngExpression,
      zoom,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    routesLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const timer = setTimeout(() => {
      if (mapRef.current) {
        map.invalidateSize();
        // Draw whatever data is available right now after size is correct
        drawMarkers(markersLayerRef.current!, markersRef.current);
        drawRoutes(routesLayerRef.current!, routesRef.current);
        fitBounds(map, markersRef.current, routesRef.current);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      routesLayerRef.current = null;
    };
  }, []);

  // Sync markers whenever they change
  useEffect(() => {
    if (!markersLayerRef.current) return;
    drawMarkers(markersLayerRef.current, markers);
  }, [markers]);

  // Sync routes whenever they change
  useEffect(() => {
    if (!routesLayerRef.current) return;
    drawRoutes(routesLayerRef.current, routes);
  }, [routes]);

  // Fit bounds whenever data changes
  useEffect(() => {
    if (!mapRef.current) return;
    fitBounds(mapRef.current, markers, routes);
  }, [markers, routes]);

  return <div ref={wrapperRef} style={{ height: '100%', width: '100%' }} />;
}

// --- Pure helper functions (no hooks, no refs) ---

function drawMarkers(layer: L.LayerGroup, markers: MapMarker[]) {
  layer.clearLayers();
  markers.forEach((m) => {
    const marker = L.marker([m.lat, m.lng], { icon: getIconForMarker(m) });
    marker.bindPopup(`<strong>${m.title}</strong>${m.status ? `<br/>${m.status}` : ''}`);
    layer.addLayer(marker);
  });
}

function drawRoutes(layer: L.LayerGroup, routes: RouteData[]) {
  layer.clearLayers();
  routes.forEach((route) => {
    if (route.coordinates.length < 2) return;
    L.polyline(route.coordinates, {
      color: route.color || '#3b82f6',
      weight: 4,
      opacity: 0.8,
    }).addTo(layer);
  });
}

function fitBounds(map: L.Map, markers: MapMarker[], routes: RouteData[]) {
  const points: L.LatLngExpression[] = [];
  markers.forEach((m) => points.push([m.lat, m.lng]));
  routes.forEach((r) => r.coordinates.forEach((c) => points.push(c)));
  if (points.length >= 2) {
    map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 14 });
  }
}
