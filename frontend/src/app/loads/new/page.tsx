'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { loadsApi } from '@/lib/api';
import { geocodeStructured, reverseGeocode } from '@/lib/routing';

interface LoadForm {
  title: string;
  description?: string;

  originStreet?: string;
  originCity?: string;
  originState?: string;
  originPostalCode?: string;
  originLat?: number;
  originLng?: number;

  destStreet?: string;
  destCity?: string;
  destState?: string;
  destPostalCode?: string;
  destLat?: number;
  destLng?: number;

  cargoType: string;
  weight: number;
  volume?: number;
  pickupDate: string;
  deliveryDate?: string;
  price: number;
}

type LocationMode = 'address' | 'coords';

interface AddressParts {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

function formatAddress(parts: AddressParts): string {
  const base = [parts.street, parts.city, parts.state].map((v) => v?.trim()).filter(Boolean).join(', ');
  const cp = parts.postalCode?.trim();
  return cp ? `${base} (CP ${cp})` : base;
}

export default function NewLoadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [originMode, setOriginMode] = useState<LocationMode>('address');
  const [destMode, setDestMode] = useState<LocationMode>('address');

  const { register, handleSubmit, formState: { errors } } = useForm<LoadForm>();

  const resolveLocation = async (
    mode: LocationMode,
    parts: AddressParts,
    lat: number | undefined,
    lng: number | undefined,
  ): Promise<{ address: string; lat: number; lng: number } | { error: string }> => {
    if (mode === 'coords') {
      const latN = Number(lat);
      const lngN = Number(lng);
      if (lat === undefined || lng === undefined || Number.isNaN(latN) || Number.isNaN(lngN)) {
        return { error: 'Latitud y longitud son obligatorias en modo Coordenadas' };
      }
      const resolved = await reverseGeocode(latN, lngN);
      return {
        address: resolved ?? `Coordenadas: ${latN}, ${lngN}`,
        lat: latN,
        lng: lngN,
      };
    }
    if (!parts.street?.trim() || !parts.city?.trim()) {
      return { error: 'Calle y Ciudad son obligatorias en modo Dirección' };
    }
    const result = await geocodeStructured({
      street: parts.street,
      city: parts.city,
      state: parts.state,
      postalcode: parts.postalCode,
    });
    if (!result) {
      return {
        error: `No se pudo resolver "${formatAddress(parts)}". Probá afinar los campos o cambiá a modo Coordenadas.`,
      };
    }
    return { address: formatAddress(parts), lat: result.lat, lng: result.lng };
  };

  const onSubmit = async (data: LoadForm) => {
    setLoading(true);
    setError('');
    try {
      const origin = await resolveLocation(
        originMode,
        { street: data.originStreet, city: data.originCity, state: data.originState, postalCode: data.originPostalCode },
        data.originLat,
        data.originLng,
      );
      if ('error' in origin) {
        setError(`Origen: ${origin.error}`);
        return;
      }
      const dest = await resolveLocation(
        destMode,
        { street: data.destStreet, city: data.destCity, state: data.destState, postalCode: data.destPostalCode },
        data.destLat,
        data.destLng,
      );
      if ('error' in dest) {
        setError(`Destino: ${dest.error}`);
        return;
      }
      await loadsApi.create({
        title: data.title,
        description: data.description,
        cargoType: data.cargoType,
        weight: Number(data.weight),
        volume: data.volume ? Number(data.volume) : undefined,
        pickupDate: data.pickupDate,
        deliveryDate: data.deliveryDate,
        price: Number(data.price),
        originAddress: origin.address,
        originLat: origin.lat,
        originLng: origin.lng,
        destAddress: dest.address,
        destLat: dest.lat,
        destLng: dest.lng,
      });
      router.push('/dashboard/shipper');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear la carga');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none';

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Crear Nueva Carga</h1>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Carga <span className="text-red-500">*</span></label>
                <input {...register('cargoType', { required: 'Requerido' })} className={inputClass} placeholder="Ej., Electrónica" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Peso (kg) <span className="text-red-500">*</span></label>
                <input type="number" {...register('weight', { required: 'Requerido' })} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Volumen (m3, opcional)</label>
                <input type="number" step="0.1" {...register('volume')} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio (ARS) <span className="text-red-500">*</span></label>
                <input type="number" {...register('price', { required: 'Requerido' })} className={inputClass} />
              </div>
            </div>
          </div>

          <LocationCard
            title="Origen"
            mode={originMode}
            onModeChange={setOriginMode}
            streetInput={<input {...register('originStreet')} className={inputClass} placeholder="Ej., Av. Corrientes 1234" />}
            cityInput={<input {...register('originCity')} className={inputClass} placeholder="Ej., Buenos Aires" />}
            stateInput={<input {...register('originState')} className={inputClass} placeholder="Ej., CABA" />}
            postalCodeInput={<input {...register('originPostalCode')} className={inputClass} placeholder="Ej., C1043AAU" />}
            latInput={<input type="number" step="any" {...register('originLat')} className={inputClass} placeholder="-34.6037" />}
            lngInput={<input type="number" step="any" {...register('originLng')} className={inputClass} placeholder="-58.3816" />}
          />

          <LocationCard
            title="Destino"
            mode={destMode}
            onModeChange={setDestMode}
            streetInput={<input {...register('destStreet')} className={inputClass} placeholder="Ej., Av. San Martín 567" />}
            cityInput={<input {...register('destCity')} className={inputClass} placeholder="Ej., Córdoba" />}
            stateInput={<input {...register('destState')} className={inputClass} placeholder="Ej., Córdoba" />}
            postalCodeInput={<input {...register('destPostalCode')} className={inputClass} placeholder="Ej., X5000" />}
            latInput={<input type="number" step="any" {...register('destLat')} className={inputClass} placeholder="-31.4201" />}
            lngInput={<input type="number" step="any" {...register('destLng')} className={inputClass} placeholder="-64.1888" />}
          />

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">Fechas</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Recogida <span className="text-red-500">*</span></label>
                <input type="datetime-local" {...register('pickupDate', { required: 'Requerido' })} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Entrega (opcional)</label>
                <input type="datetime-local" {...register('deliveryDate')} className={inputClass} />
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
    </DashboardLayout>
  );
}

function LocationCard({
  title,
  mode,
  onModeChange,
  streetInput,
  cityInput,
  stateInput,
  postalCodeInput,
  latInput,
  lngInput,
}: {
  title: string;
  mode: LocationMode;
  onModeChange: (m: LocationMode) => void;
  streetInput: React.ReactNode;
  cityInput: React.ReactNode;
  stateInput: React.ReactNode;
  postalCodeInput: React.ReactNode;
  latInput: React.ReactNode;
  lngInput: React.ReactNode;
}) {
  const tabClass = (active: boolean) =>
    `flex-1 text-sm py-2 rounded-md transition ${
      active ? 'bg-white text-primary-700 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold text-gray-700">{title}</h2>
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1" role="tablist" aria-label={`Modo de entrada de ${title}`}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'address'}
            className={tabClass(mode === 'address')}
            onClick={() => onModeChange('address')}
          >
            Dirección
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'coords'}
            className={tabClass(mode === 'coords')}
            onClick={() => onModeChange('coords')}
          >
            Coordenadas
          </button>
        </div>
      </div>

      <div className="space-y-3" style={{ display: mode === 'address' ? 'block' : 'none' }}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Calle <span className="text-red-500">*</span></label>
          {streetInput}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad <span className="text-red-500">*</span></label>
            {cityInput}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
            {stateInput}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Código Postal</label>
          {postalCodeInput}
        </div>
        <p className="text-xs text-gray-500">
          Calle y Ciudad son obligatorias. Las coordenadas se obtienen automáticamente al crear la carga.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4" style={{ display: mode === 'coords' ? 'grid' : 'none' }}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Latitud <span className="text-red-500">*</span></label>
          {latInput}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Longitud <span className="text-red-500">*</span></label>
          {lngInput}
        </div>
      </div>
    </div>
  );
}
