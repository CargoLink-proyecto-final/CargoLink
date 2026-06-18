'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { loadsApi } from '@/lib/api';
import { geocodeStructured, reverseGeocode, type NominatimAddressDetail } from '@/lib/routing';

// Leaflet touches window — load client-side only.
const LocationPicker = dynamic(() => import('@/components/maps/LocationPicker'), { ssr: false });

const CARGO_TYPES = [
  'Electrónica y tecnología',
  'Alimentos y bebidas',
  'Materiales de construcción',
  'Muebles y artículos del hogar',
  'Ropa y textiles',
  'Maquinaria e industria',
  'Mercadería general',
  'Otro',
] as const;

// Form dinámico (P6): las dimensiones del bulto aplican a cargas en
// bultos/unidades. Para mercadería a granel (alimentos, materiales de
// construcción) el volumen total es la métrica representativa, así que esos
// campos no se muestran ni se envían.
const BULK_CARGO_TYPES = new Set<string>(['Alimentos y bebidas', 'Materiales de construcción']);
function showsPackageDetails(cargoType: string | undefined): boolean {
  return !!cargoType && cargoType !== 'Otro' && !BULK_CARGO_TYPES.has(cargoType);
}

// Only chars valid in street names/numbers. Blocks <>{}&% etc.
const STREET_PATTERN = /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9\s.\-/'°]+$/;
// City, province, country: letters only (no digits).
const PLACE_PATTERN = /^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s.\-']+$/;
const STREET_MSG = 'Solo letras, números y caracteres comunes de dirección';
const PLACE_MSG = 'Solo letras';

type VerificationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; displayName: string }
  | { status: 'mismatch'; displayName: string; mismatches: string[] }
  | { status: 'error' };

// Normalize string: lowercase + remove accents for loose comparisons.
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Known abbreviations that Nominatim returns as full names.
const PLACE_ALIASES: Record<string, string[]> = {
  caba: ['ciudad autonoma de buenos aires', 'ciudad de buenos aires'],
  bsas: ['buenos aires'],
  cba: ['cordoba'],
  mdz: ['mendoza'],
};

function looseMatch(userInput: string, nominatimValue: string, displayName: string): boolean {
  const na = normalize(userInput);
  const nb = normalize(nominatimValue);
  const nd = normalize(displayName);
  if (nb.includes(na) || na.includes(nb) || nd.includes(na)) return true;
  return (PLACE_ALIASES[na] ?? []).some((alias) => nb.includes(alias) || nd.includes(alias));
}

// Stricter than looseMatch: compares ONLY against the resolved locality value,
// never the full display name. The display name carries administrative
// subdivisions (e.g. "Pedanía Pilar") that would otherwise let a typed city
// like "Pilar" falsely match a result whose actual locality is "Laguna Larga".
function strictPlaceMatch(userInput: string, nominatimValue: string): boolean {
  const na = normalize(userInput);
  const nb = normalize(nominatimValue);
  if (!na || !nb) return false;
  if (nb.includes(na) || na.includes(nb)) return true;
  return (PLACE_ALIASES[na] ?? []).some((alias) => nb.includes(alias));
}

// Cross-checks the entered address against the geocoded result and returns a
// human-readable list of inconsistencies (empty if everything lines up).
// Shared by the manual "Verificar dirección" button and the submit-time guard.
function computeMismatches(
  parts: { city?: string; state?: string; country?: string; postalCode?: string },
  result: { displayName: string; address: NominatimAddressDetail },
): string[] {
  const mismatches: string[] = [];
  const addr = result.address;
  const { city, state, country, postalCode } = parts;

  // Country cross-validation
  const nominatimCountry = addr.country ?? '';
  if (country?.trim() && nominatimCountry && !looseMatch(country, nominatimCountry, result.displayName)) {
    mismatches.push(`País: ingresaste "${country}" pero la dirección pertenece a "${nominatimCountry}"`);
  }

  // Province/state cross-validation
  const nominatimState = addr.state ?? addr.province ?? '';
  if (state?.trim() && nominatimState && !looseMatch(state, nominatimState, result.displayName)) {
    mismatches.push(`Provincia: ingresaste "${state}" pero se encontró "${nominatimState}"`);
  }

  // City cross-validation — Nominatim uses city/town/village/hamlet depending on settlement size.
  // Use the strict matcher: the typed city must match the actual locality, not an
  // administrative subdivision that merely appears in the display name.
  const nominatimCity = addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.municipality ?? addr.suburb ?? '';
  if (city?.trim() && nominatimCity && !strictPlaceMatch(city, nominatimCity)) {
    mismatches.push(`Ciudad: ingresaste "${city}" pero se encontró "${nominatimCity}"`);
  }

  // Postal code cross-validation: compare the 4-digit numeric core
  const nominatimCP = addr.postcode?.trim() ?? '';
  if (postalCode?.trim() && nominatimCP) {
    const userDigits = /\d{4}/.exec(postalCode.trim())?.[0] ?? '';
    const nominatimDigits = /\d{4}/.exec(nominatimCP)?.[0] ?? '';
    if (userDigits && nominatimDigits && userDigits !== nominatimDigits) {
      mismatches.push(`Código postal: ingresaste "${postalCode.trim()}" pero se encontró "${nominatimCP}"`);
    }
  }

  return mismatches;
}

interface LoadForm {
  title: string;
  description?: string;

  originStreet?: string;
  originStreetNumber?: string;
  originCity?: string;
  originState?: string;
  originCountry?: string;
  originPostalCode?: string;
  originLat?: number;
  originLng?: number;
  originCoordsLabel?: string;

  destStreet?: string;
  destStreetNumber?: string;
  destCity?: string;
  destState?: string;
  destCountry?: string;
  destPostalCode?: string;
  destLat?: number;
  destLng?: number;
  destCoordsLabel?: string;

  cargoType: string;
  weight: number;
  volume?: number;
  packageCount?: number;
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
  pickupDate: string;
  deliveryDate?: string;
  price: number;
  maxBudget?: number;
}

type LocationMode = 'address' | 'coords';

interface AddressParts {
  street?: string;
  streetNumber?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

function formatAddress(parts: AddressParts): string {
  const streetFull = [parts.street, parts.streetNumber].filter(Boolean).join(' ');
  const base = [streetFull, parts.city, parts.state, parts.country]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(', ');
  const cp = parts.postalCode?.trim();
  return cp ? `${base} (CP ${cp})` : base;
}

function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function NewLoadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [originMode, setOriginMode] = useState<LocationMode>('address');
  const [destMode, setDestMode] = useState<LocationMode>('address');
  const [originVerification, setOriginVerification] = useState<VerificationState>({ status: 'idle' });
  const [destVerification, setDestVerification] = useState<VerificationState>({ status: 'idle' });
  // Pin coords from the map picker. Set after a successful "Verificar dirección"
  // (starts at the geocoded point) and overridden when the user drags the pin.
  // When set, these win over the raw geocode at submit — letting the user nail
  // the exact spot even where OSM has no house-number data.
  const [originPin, setOriginPin] = useState<{ lat: number; lng: number } | null>(null);
  const [destPin, setDestPin] = useState<{ lat: number; lng: number } | null>(null);
  // Mismatches surfaced at submit time. They hard-block creation: pressing
  // "Crear" with any mismatch opens a modal asking the user to fix the address.
  const [submitMismatches, setSubmitMismatches] = useState<string[]>([]);
  const [showMismatchModal, setShowMismatchModal] = useState(false);

  const minPickup = useMemo(() => toLocalDatetimeString(new Date()), []);

  const { register, handleSubmit, watch, getValues, formState: { errors } } = useForm<LoadForm>();

  const pickupDateValue = watch('pickupDate');
  const cargoTypeValue = watch('cargoType');

  const verifyAddress = async (
    prefix: 'origin' | 'dest',
    setVerification: React.Dispatch<React.SetStateAction<VerificationState>>,
    setPin: React.Dispatch<React.SetStateAction<{ lat: number; lng: number } | null>>,
  ) => {
    const v = getValues();
    const isOrigin = prefix === 'origin';
    const street = isOrigin ? v.originStreet : v.destStreet;
    const streetNumber = isOrigin ? v.originStreetNumber : v.destStreetNumber;
    const city = isOrigin ? v.originCity : v.destCity;
    const state = isOrigin ? v.originState : v.destState;
    const country = isOrigin ? v.originCountry : v.destCountry;
    const postalCode = isOrigin ? v.originPostalCode : v.destPostalCode;

    if (!street?.trim() || !city?.trim() || !postalCode?.trim()) {
      setVerification({ status: 'error' });
      setPin(null);
      return;
    }
    setVerification({ status: 'loading' });
    const streetFull = [street, streetNumber].filter(Boolean).join(' ');
    try {
      const result = await geocodeStructured({ street: streetFull, city, state, postalcode: postalCode });
      if (!result) { setVerification({ status: 'error' }); setPin(null); return; }

      const mismatches = computeMismatches({ city, state, country, postalCode }, result);

      if (mismatches.length > 0) {
        setVerification({ status: 'mismatch', displayName: result.displayName, mismatches });
      } else {
        setVerification({ status: 'ok', displayName: result.displayName });
      }
      // Drop the pin at the geocoded point; the user can drag it to be exact.
      setPin({ lat: result.lat, lng: result.lng });
    } catch {
      setVerification({ status: 'error' });
      setPin(null);
    }
  };

  const resolveLocation = async (
    mode: LocationMode,
    parts: AddressParts,
    lat: number | undefined,
    lng: number | undefined,
    coordsLabel?: string,
    pinOverride?: { lat: number; lng: number } | null,
  ): Promise<{ address: string; lat: number; lng: number; mismatches: string[] } | { error: string }> => {
    if (mode === 'coords') {
      const latN = Number(lat);
      const lngN = Number(lng);
      if (lat === undefined || lng === undefined || Number.isNaN(latN) || Number.isNaN(lngN)) {
        return { error: 'Latitud y longitud son obligatorias en modo Coordenadas' };
      }
      const resolved = await reverseGeocode(latN, lngN);
      const label = coordsLabel?.trim();
      return { address: label ?? resolved ?? `Coordenadas: ${latN}, ${lngN}`, lat: latN, lng: lngN, mismatches: [] };
    }
    if (!parts.street?.trim() || !parts.city?.trim()) {
      return { error: 'Calle y Ciudad son obligatorias en modo Dirección' };
    }
    if (!parts.state?.trim()) return { error: 'Provincia es obligatoria en modo Dirección' };
    if (!parts.country?.trim()) return { error: 'País es obligatorio en modo Dirección' };
    if (!parts.postalCode?.trim()) return { error: 'Código Postal es obligatorio en modo Dirección' };

    const streetFull = [parts.street, parts.streetNumber].filter(Boolean).join(' ');
    const result = await geocodeStructured({ street: streetFull, city: parts.city, state: parts.state, postalcode: parts.postalCode });
    if (!result) {
      return { error: `No se pudo resolver "${formatAddress(parts)}". Verificá los campos o cambiá a modo Coordenadas.` };
    }
    const mismatches = computeMismatches(
      { city: parts.city, state: parts.state, country: parts.country, postalCode: parts.postalCode },
      result,
    );
    // A dragged pin takes precedence over the geocoded point for exactness.
    const coords = pinOverride ?? { lat: result.lat, lng: result.lng };
    return { address: formatAddress(parts), lat: coords.lat, lng: coords.lng, mismatches };
  };

  const onSubmit = async (data: LoadForm) => {
    setLoading(true);
    setError('');
    try {
      const origin = await resolveLocation(
        originMode,
        { street: data.originStreet, streetNumber: data.originStreetNumber, city: data.originCity, state: data.originState, country: data.originCountry, postalCode: data.originPostalCode },
        data.originLat, data.originLng, data.originCoordsLabel, originPin,
      );
      if ('error' in origin) { setError(`Origen: ${origin.error}`); return; }

      const dest = await resolveLocation(
        destMode,
        { street: data.destStreet, streetNumber: data.destStreetNumber, city: data.destCity, state: data.destState, country: data.destCountry, postalCode: data.destPostalCode },
        data.destLat, data.destLng, data.destCoordsLabel, destPin,
      );
      if ('error' in dest) { setError(`Destino: ${dest.error}`); return; }

      if (
        Math.abs(origin.lat - dest.lat) < 0.0001 &&
        Math.abs(origin.lng - dest.lng) < 0.0001
      ) {
        setError('El origen y el destino no pueden ser el mismo lugar');
        return;
      }

      // Hard block: if the resolved location disagrees with what the user typed,
      // surface the inconsistencies in a modal and refuse to create the load.
      const allMismatches = [
        ...origin.mismatches.map((m) => `Origen — ${m}`),
        ...dest.mismatches.map((m) => `Destino — ${m}`),
      ];
      if (allMismatches.length > 0) {
        setSubmitMismatches(allMismatches);
        setShowMismatchModal(true);
        return;
      }

      const pkg = showsPackageDetails(data.cargoType);
      await loadsApi.create({
        title: data.title,
        description: data.description,
        cargoType: data.cargoType,
        weight: Number(data.weight),
        volume: data.volume ? Number(data.volume) : undefined,
        // Solo enviamos info del bulto para los tipos que la muestran (P6),
        // evitando datos obsoletos si el usuario cambió de tipo de carga.
        packageCount: pkg && data.packageCount ? Number(data.packageCount) : undefined,
        heightCm: pkg && data.heightCm ? Number(data.heightCm) : undefined,
        widthCm: pkg && data.widthCm ? Number(data.widthCm) : undefined,
        lengthCm: pkg && data.lengthCm ? Number(data.lengthCm) : undefined,
        pickupDate: data.pickupDate,
        deliveryDate: data.deliveryDate,
        price: Number(data.price),
        maxBudget: data.maxBudget ? Number(data.maxBudget) : undefined,
        originAddress: origin.address,
        originLat: origin.lat,
        originLng: origin.lng,
        destAddress: dest.address,
        destLat: dest.lat,
        destLng: dest.lng,
      });
      router.push('/dashboard/shipper');
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Error al crear la carga');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none';

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Crear Nueva Carga</h1>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}

        {submitMismatches.length > 0 && (
          <div className="bg-amber-50 text-amber-700 p-3 rounded-lg mb-4 text-sm space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle size={16} className="shrink-0" />
              La ubicación encontrada no coincide con lo que ingresaste:
            </div>
            <ul className="pl-6 list-disc space-y-0.5">
              {submitMismatches.map((m) => <li key={m}>{m}</li>)}
            </ul>
            <p className="text-xs text-amber-600 pt-1">
              Corregí la dirección para poder crear la carga.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Detalles */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">Detalles de la Carga</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titulo <span className="text-red-500">*</span></label>
              <input {...register('title', { required: 'Requerido' })} className={inputClass} placeholder="Ej., Electrónica a Córdoba" />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea {...register('description')} className={inputClass} rows={3} placeholder="Detalles adicionales sobre la carga" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Carga <span className="text-red-500">*</span></label>
                <select {...register('cargoType', { required: 'Requerido' })} className={inputClass}>
                  <option value="">Seleccioná un tipo</option>
                  {CARGO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {errors.cargoType && <p className="text-red-500 text-xs mt-1">{errors.cargoType.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Peso (kg) <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" {...register('weight', { required: 'Requerido', min: { value: 0, message: 'No puede ser negativo' } })} className={inputClass} />
                {errors.weight && <p className="text-red-500 text-xs mt-1">{errors.weight.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Volumen (m³, opcional)</label>
                <input type="number" step="0.1" {...register('volume', { min: { value: 0, message: 'No puede ser negativo' } })} className={inputClass} />
                {errors.volume && <p className="text-red-500 text-xs mt-1">{errors.volume.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio (ARS) <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" {...register('price', { required: 'Requerido', min: { value: 0, message: 'No puede ser negativo' } })} className={inputClass} />
                {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto máximo (ARS, opcional)</label>
              <input type="number" step="0.01" {...register('maxBudget', { min: { value: 0, message: 'No puede ser negativo' } })} className={inputClass} />
              <p className="text-gray-500 text-xs mt-1">Monto máximo que estás dispuesto a pagar; visible para los transportistas.</p>
              {errors.maxBudget && <p className="text-red-500 text-xs mt-1">{errors.maxBudget.message}</p>}
            </div>

            {/* Form dinámico (P6): la info del bulto solo se pide para cargas en
                bultos/unidades; para mercadería a granel el volumen alcanza. */}
            {showsPackageDetails(cargoTypeValue) && (
              <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-700">Información del bulto (opcional)</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de bultos</label>
                  <input type="number" step="1" {...register('packageCount', { min: { value: 1, message: 'Debe ser al menos 1' } })} className={inputClass} />
                  {errors.packageCount && <p className="text-red-500 text-xs mt-1">{errors.packageCount.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dimensiones del bulto (cm)</label>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <input type="number" step="0.1" placeholder="Alto" {...register('heightCm', { min: { value: 0, message: 'No puede ser negativo' } })} className={inputClass} />
                      {errors.heightCm && <p className="text-red-500 text-xs mt-1">{errors.heightCm.message}</p>}
                    </div>
                    <div>
                      <input type="number" step="0.1" placeholder="Ancho" {...register('widthCm', { min: { value: 0, message: 'No puede ser negativo' } })} className={inputClass} />
                      {errors.widthCm && <p className="text-red-500 text-xs mt-1">{errors.widthCm.message}</p>}
                    </div>
                    <div>
                      <input type="number" step="0.1" placeholder="Largo" {...register('lengthCm', { min: { value: 0, message: 'No puede ser negativo' } })} className={inputClass} />
                      {errors.lengthCm && <p className="text-red-500 text-xs mt-1">{errors.lengthCm.message}</p>}
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs mt-1">Ayuda a evaluar la compatibilidad con otras cargas para compartir un mismo viaje.</p>
                </div>
              </div>
            )}
          </div>

          {/* Origen */}
          <LocationCard
            title="Origen"
            mode={originMode}
            onModeChange={(m) => { setOriginMode(m); setOriginVerification({ status: 'idle' }); setOriginPin(null); setSubmitMismatches([]); }}
            verification={originVerification}
            onVerify={() => verifyAddress('origin', setOriginVerification, setOriginPin)}
            onFieldChange={() => { setOriginVerification({ status: 'idle' }); setOriginPin(null); setSubmitMismatches([]); }}
            pin={originPin}
            pinColor="#22c55e"
            onPinChange={(lat, lng) => setOriginPin({ lat, lng })}
            streetInput={<input {...register('originStreet', { pattern: { value: STREET_PATTERN, message: STREET_MSG } })} className={inputClass} placeholder="Ej., Av. Corrientes" />}
            streetError={errors.originStreet?.message}
            streetNumberInput={<input {...register('originStreetNumber', { pattern: { value: /^[a-zA-Z0-9\-/]+$/, message: 'Solo letras y números' } })} className={inputClass} placeholder="Ej., 1234" />}
            streetNumberError={errors.originStreetNumber?.message}
            cityInput={<input {...register('originCity', { pattern: { value: PLACE_PATTERN, message: PLACE_MSG } })} className={inputClass} placeholder="Ej., Buenos Aires" />}
            cityError={errors.originCity?.message}
            stateInput={<input {...register('originState', { pattern: { value: PLACE_PATTERN, message: PLACE_MSG } })} className={inputClass} placeholder="Ej., CABA" />}
            stateError={errors.originState?.message}
            countryInput={<input {...register('originCountry', { pattern: { value: PLACE_PATTERN, message: PLACE_MSG } })} className={inputClass} placeholder="Ej., Argentina" />}
            countryError={errors.originCountry?.message}
            postalCodeInput={<input {...register('originPostalCode', { required: 'Requerido', pattern: { value: /^[A-Za-z]?\d{4}([A-Za-z]{3})?$/, message: 'Formato inválido. Ej: 1043 o C1043AAU' } })} className={inputClass} placeholder="Ej., 1043 o C1043AAU" />}
            postalCodeError={errors.originPostalCode?.message}
            latInput={<input type="number" step="any" {...register('originLat')} className={inputClass} placeholder="-34.6037" />}
            lngInput={<input type="number" step="any" {...register('originLng')} className={inputClass} placeholder="-58.3816" />}
            coordsLabelInput={<input {...register('originCoordsLabel')} className={inputClass} placeholder="Ej., Depósito central, Planta industrial..." />}
          />

          {/* Destino */}
          <LocationCard
            title="Destino"
            mode={destMode}
            onModeChange={(m) => { setDestMode(m); setDestVerification({ status: 'idle' }); setDestPin(null); setSubmitMismatches([]); }}
            verification={destVerification}
            onVerify={() => verifyAddress('dest', setDestVerification, setDestPin)}
            onFieldChange={() => { setDestVerification({ status: 'idle' }); setDestPin(null); setSubmitMismatches([]); }}
            pin={destPin}
            pinColor="#ef4444"
            onPinChange={(lat, lng) => setDestPin({ lat, lng })}
            streetInput={<input {...register('destStreet', { pattern: { value: STREET_PATTERN, message: STREET_MSG } })} className={inputClass} placeholder="Ej., Av. San Martín" />}
            streetError={errors.destStreet?.message}
            streetNumberInput={<input {...register('destStreetNumber', { pattern: { value: /^[a-zA-Z0-9\-/]+$/, message: 'Solo letras y números' } })} className={inputClass} placeholder="Ej., 567" />}
            streetNumberError={errors.destStreetNumber?.message}
            cityInput={<input {...register('destCity', { pattern: { value: PLACE_PATTERN, message: PLACE_MSG } })} className={inputClass} placeholder="Ej., Córdoba" />}
            cityError={errors.destCity?.message}
            stateInput={<input {...register('destState', { pattern: { value: PLACE_PATTERN, message: PLACE_MSG } })} className={inputClass} placeholder="Ej., Córdoba" />}
            stateError={errors.destState?.message}
            countryInput={<input {...register('destCountry', { pattern: { value: PLACE_PATTERN, message: PLACE_MSG } })} className={inputClass} placeholder="Ej., Argentina" />}
            countryError={errors.destCountry?.message}
            postalCodeInput={<input {...register('destPostalCode', { required: 'Requerido', pattern: { value: /^[A-Za-z]?\d{4}([A-Za-z]{3})?$/, message: 'Formato inválido. Ej: 5000 o X5000AAA' } })} className={inputClass} placeholder="Ej., 5000 o X5000AAA" />}
            postalCodeError={errors.destPostalCode?.message}
            latInput={<input type="number" step="any" {...register('destLat')} className={inputClass} placeholder="-31.4201" />}
            lngInput={<input type="number" step="any" {...register('destLng')} className={inputClass} placeholder="-64.1888" />}
            coordsLabelInput={<input {...register('destCoordsLabel')} className={inputClass} placeholder="Ej., Centro de distribución, Cliente final..." />}
          />

          {/* Fechas */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">Fechas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Recogida <span className="text-red-500">*</span></label>
                <input
                  type="datetime-local"
                  min={minPickup}
                  {...register('pickupDate', {
                    required: 'Requerido',
                    validate: (v) => v >= minPickup || 'No puede ser anterior a hoy',
                  })}
                  className={inputClass}
                />
                {errors.pickupDate && <p className="text-red-500 text-xs mt-1">{errors.pickupDate.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha deseada de entrega <span className="text-red-500">*</span></label>
                <input
                  type="datetime-local"
                  min={pickupDateValue || minPickup}
                  {...register('deliveryDate', {
                    required: 'Requerido',
                    validate: (v) => {
                      if (!v || !pickupDateValue) return true;
                      return v > pickupDateValue || 'Debe ser posterior a la recogida';
                    },
                  })}
                  className={inputClass}
                />
                {errors.deliveryDate && <p className="text-red-500 text-xs mt-1">{errors.deliveryDate.message}</p>}
                <p className="text-gray-500 text-xs mt-1">Fecha estimativa solicitada; no es la fecha definitiva de realización del viaje.</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Creando...' : 'Crear Carga'}
          </button>
        </form>
      </div>

      {showMismatchModal && (
        <div
          // z above Leaflet's panes/controls (~1000) so the modal isn't covered by the map.
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mismatch-modal-title"
        >
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle size={20} className="shrink-0" />
              <h2 id="mismatch-modal-title" className="font-semibold text-lg text-gray-800">
                Corregí la dirección
              </h2>
            </div>
            <p className="text-sm text-gray-600">
              La ubicación encontrada no coincide con los datos que ingresaste. Revisá y corregí
              los siguientes campos antes de crear la carga:
            </p>
            <ul className="pl-5 list-disc space-y-1 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
              {submitMismatches.map((m) => <li key={m}>{m}</li>)}
            </ul>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowMismatchModal(false)}
                className="bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-2 rounded-lg transition"
              >
                Corregir dirección
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function LocationCard({
  title, mode, onModeChange,
  verification, onVerify, onFieldChange,
  pin, pinColor, onPinChange,
  streetInput, streetError,
  streetNumberInput, streetNumberError,
  cityInput, cityError,
  stateInput, stateError,
  countryInput, countryError,
  postalCodeInput, postalCodeError,
  latInput, lngInput, coordsLabelInput,
}: {
  title: string;
  mode: LocationMode;
  onModeChange: (m: LocationMode) => void;
  verification: VerificationState;
  onVerify: () => void;
  onFieldChange: () => void;
  pin: { lat: number; lng: number } | null;
  pinColor: string;
  onPinChange: (lat: number, lng: number) => void;
  streetInput: React.ReactNode;
  streetError?: string;
  streetNumberInput: React.ReactNode;
  streetNumberError?: string;
  cityInput: React.ReactNode;
  cityError?: string;
  stateInput: React.ReactNode;
  stateError?: string;
  countryInput: React.ReactNode;
  countryError?: string;
  postalCodeInput: React.ReactNode;
  postalCodeError?: string;
  latInput: React.ReactNode;
  lngInput: React.ReactNode;
  coordsLabelInput: React.ReactNode;
}) {
  const tabClass = (active: boolean) =>
    `flex-1 text-sm py-2 rounded-md transition ${active ? 'bg-white text-primary-700 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold text-gray-700">{title}</h2>
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1" role="tablist" aria-label={`Modo de entrada de ${title}`}>
          <button type="button" role="tab" aria-selected={mode === 'address'} className={tabClass(mode === 'address')} onClick={() => onModeChange('address')}>Dirección</button>
          <button type="button" role="tab" aria-selected={mode === 'coords'} className={tabClass(mode === 'coords')} onClick={() => onModeChange('coords')}>Coordenadas</button>
        </div>
      </div>

      {/* Address mode */}
      <div className="space-y-3" style={{ display: mode === 'address' ? 'block' : 'none' }} onInput={onFieldChange}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Calle <span className="text-red-500">*</span></label>
            {streetInput}
            {streetError && <p className="text-red-500 text-xs mt-1">{streetError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
            {streetNumberInput}
            {streetNumberError && <p className="text-red-500 text-xs mt-1">{streetNumberError}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad <span className="text-red-500">*</span></label>
            {cityInput}
            {cityError && <p className="text-red-500 text-xs mt-1">{cityError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provincia <span className="text-red-500">*</span></label>
            {stateInput}
            {stateError && <p className="text-red-500 text-xs mt-1">{stateError}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">País <span className="text-red-500">*</span></label>
            {countryInput}
            {countryError && <p className="text-red-500 text-xs mt-1">{countryError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código Postal <span className="text-red-500">*</span></label>
            {postalCodeInput}
            {postalCodeError && <p className="text-red-500 text-xs mt-1">{postalCodeError}</p>}
          </div>
        </div>

        {/* Verification */}
        <div className="pt-1">
          <button
            type="button"
            onClick={onVerify}
            disabled={verification.status === 'loading'}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-primary-300 text-primary-700 hover:bg-primary-50 transition disabled:opacity-50"
          >
            {verification.status === 'loading' && <Loader2 size={14} className="animate-spin" />}
            Verificar dirección
          </button>

          {verification.status === 'ok' && (
            <div className="mt-2 flex items-start gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircle size={16} className="mt-0.5 shrink-0" />
              <span><span className="font-medium">Dirección verificada:</span> {verification.displayName}</span>
            </div>
          )}
          {verification.status === 'mismatch' && (
            <div className="mt-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle size={16} className="shrink-0" />
                Dirección encontrada pero hay inconsistencias:
              </div>
              <ul className="pl-6 list-disc space-y-0.5">
                {verification.mismatches.map((m) => <li key={m}>{m}</li>)}
              </ul>
              <p className="text-xs text-amber-600 pt-1">Dirección encontrada: {verification.displayName}</p>
            </div>
          )}
          {verification.status === 'error' && (
            <div className="mt-2 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <XCircle size={16} className="shrink-0" />
              No se encontró la dirección. Revisá los campos o usá modo Coordenadas.
            </div>
          )}
          {verification.status === 'idle' && (
            <p className="mt-1 text-xs text-gray-500">
              Verificá para confirmar que la dirección, ciudad, provincia y CP corresponden.
            </p>
          )}
        </div>

        {/* Map picker — appears once geocoding lands a point. Lets the user
            drag the pin to the exact spot when the address is only approximate. */}
        {pin && (
          <div className="pt-1 space-y-1">
            <p className="text-xs text-gray-500">
              Arrastrá el pin o tocá el mapa para ajustar la ubicación exacta.
            </p>
            <LocationPicker lat={pin.lat} lng={pin.lng} color={pinColor} onChange={onPinChange} />
          </div>
        )}
      </div>

      {/* Coords mode */}
      <div className="space-y-3" style={{ display: mode === 'coords' ? 'block' : 'none' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Latitud <span className="text-red-500">*</span></label>
            {latInput}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Longitud <span className="text-red-500">*</span></label>
            {lngInput}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción de la ubicación (opcional)</label>
          {coordsLabelInput}
        </div>
      </div>
    </div>
  );
}
