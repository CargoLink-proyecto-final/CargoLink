'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Crosshair } from 'lucide-react';

// LocationPicker toca window (Leaflet) → import dinámico sin SSR.
const LocationPicker = dynamic(() => import('./LocationPicker'), { ssr: false });

// Centro por defecto cuando el transportista todavía no fijó zona (Córdoba
// capital, punto central de la red vial argentina).
const DEFAULT_CENTER = { lat: -31.4201, lng: -64.1888 };

interface ZonePickerProps {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  onChange: (zone: { lat: number; lng: number; radiusKm: number }) => void;
}

/**
 * Selector de la zona de influencia del transportista (P12): un mapa con pin
 * arrastrable para el centro + un radio en km. Como LocationPicker acota el
 * paneo a una caja de 10 km alrededor del centro, ofrecemos un botón de
 * geolocalización para reposicionar ese centro a la ubicación real del usuario.
 */
export default function ZonePicker({ lat, lng, radiusKm, onChange }: ZonePickerProps) {
  const [center, setCenter] = useState({
    lat: lat ?? DEFAULT_CENTER.lat,
    lng: lng ?? DEFAULT_CENTER.lng,
  });
  const radius = radiusKm ?? 50;
  const [locating, setLocating] = useState(false);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(next);
        onChange({ ...next, radiusKm: radius });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800 disabled:opacity-50"
      >
        <Crosshair size={14} /> {locating ? 'Ubicando…' : 'Usar mi ubicación actual'}
      </button>
      <div className="h-56 rounded-lg overflow-hidden border border-gray-200">
        <LocationPicker
          lat={center.lat}
          lng={center.lng}
          color="#3b82f6"
          onChange={(la, ln) => {
            setCenter({ lat: la, lng: ln });
            onChange({ lat: la, lng: ln, radiusKm: radius });
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 whitespace-nowrap">Radio (km)</label>
        <input
          type="number"
          min={1}
          step={1}
          value={radius}
          onChange={(e) =>
            onChange({ lat: center.lat, lng: center.lng, radiusKm: Number(e.target.value) })
          }
          className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        />
      </div>
      <p className="text-xs text-gray-500">
        Fijá el centro de tu zona habitual (arrastrá el pin o usá tu ubicación). Las cargas con
        origen cercano se priorizan en tu listado.
      </p>
    </div>
  );
}
