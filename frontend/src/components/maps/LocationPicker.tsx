'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

// Teardrop pin so it reads as a draggable marker (vs. MapView's static dots).
function createPinIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background: ${color};
      width: 20px;
      height: 20px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      cursor: grab;
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 20],
  });
}

interface LocationPickerProps {
  lat: number;
  lng: number;
  /** Marker color — origin green / dest red, matching MapView. */
  color?: string;
  /** Fired on drag-end or map click with the new pin position. */
  onChange: (lat: number, lng: number) => void;
}

/**
 * Interactive map with a single draggable marker. Used in the load form to let
 * the user pin the exact location after geocoding lands on an approximate
 * (street-level) point — OSM lacks house-number data for many Argentine towns.
 *
 * Imperative Leaflet (no react-leaflet), mirroring MapView. Must be imported
 * via next/dynamic with ssr:false (Leaflet touches window).
 */
export default function LocationPicker({ lat, lng, color = '#22c55e', onChange }: LocationPickerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Latest callback in a ref so the init effect can stay run-once.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Tracks the last position WE emitted, so the recenter effect below can tell
  // a user drag (skip recenter — they aimed it) from an external geocode update.
  const lastEmitted = useRef<{ lat: number; lng: number } | null>(null);

  // Initialize map once.
  useEffect(() => {
    if (!wrapperRef.current) return;

    const mapDiv = document.createElement('div');
    mapDiv.style.height = '100%';
    mapDiv.style.width = '100%';
    wrapperRef.current.innerHTML = '';
    wrapperRef.current.appendChild(mapDiv);

    const map = L.map(mapDiv, {
      center: [lat, lng],
      zoom: 16,
      // Hard stop at maxBounds (set right below).
      maxBoundsViscosity: 1.0,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // 10 km square box around the pin so the user can refine within the
    // city but not wander to another province while picking the location.
    const initBounds = L.latLng(lat, lng).toBounds(10000);
    map.setMaxBounds(initBounds);
    map.setMinZoom(map.getBoundsZoom(initBounds));

    const marker = L.marker([lat, lng], { icon: createPinIcon(color), draggable: true }).addTo(map);

    const emit = (latlng: L.LatLng) => {
      lastEmitted.current = { lat: latlng.lat, lng: latlng.lng };
      onChangeRef.current(latlng.lat, latlng.lng);
    };
    marker.on('dragend', () => emit(marker.getLatLng()));
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      emit(e.latlng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    // Leaflet mis-sizes when the container animates open; recompute after layout.
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; lat/lng/color handled below
  }, []);

  // Recenter on an external coord change (e.g. a fresh "Verificar dirección"),
  // but not when the change echoes back our own drag/click.
  useEffect(() => {
    const le = lastEmitted.current;
    // Tolerancia 1e-6 (~10 cm): el formulario redondea a 6 decimales lo que el
    // pin emite, así que el valor que vuelve nunca es idéntico al emitido.
    // Con una tolerancia más fina el mapa se recentraba tras cada arrastre.
    if (le && Math.abs(le.lat - lat) < 1e-6 && Math.abs(le.lng - lng) < 1e-6) return;
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], 16);
    // Re-anchor the 10 km box on the new point so the user can't pan to
    // wherever the previous geocode landed.
    const bounds = L.latLng(lat, lng).toBounds(10000);
    mapRef.current.setMaxBounds(bounds);
    mapRef.current.setMinZoom(mapRef.current.getBoundsZoom(bounds));
  }, [lat, lng]);

  return (
    <div
      ref={wrapperRef}
      style={{ height: 240, width: '100%' }}
      className="rounded-lg overflow-hidden border border-gray-200"
    />
  );
}
