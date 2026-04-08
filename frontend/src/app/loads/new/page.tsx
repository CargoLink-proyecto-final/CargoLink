'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { loadsApi } from '@/lib/api';

interface LoadForm {
  title: string;
  description?: string;
  originAddress: string;
  originLat: number;
  originLng: number;
  destAddress: string;
  destLat: number;
  destLng: number;
  cargoType: string;
  weight: number;
  volume?: number;
  pickupDate: string;
  deliveryDate?: string;
  price: number;
}

export default function NewLoadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<LoadForm>();

  const onSubmit = async (data: LoadForm) => {
    setLoading(true);
    setError('');
    try {
      await loadsApi.create({
        ...data,
        originLat: Number(data.originLat),
        originLng: Number(data.originLng),
        destLat: Number(data.destLat),
        destLng: Number(data.destLng),
        weight: Number(data.weight),
        volume: data.volume ? Number(data.volume) : undefined,
        price: Number(data.price),
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
              <input {...register('title', { required: 'Requerido' })} className={inputClass} placeholder="Ej., Electrónica a Córdoba" />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea {...register('description')} className={inputClass} rows={3} placeholder="Detalles adicionales sobre la carga" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Carga</label>
                <input {...register('cargoType', { required: 'Requerido' })} className={inputClass} placeholder="Ej., Electrónica" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Peso (kg)</label>
                <input type="number" {...register('weight', { required: 'Requerido' })} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Volumen (m3, opcional)</label>
                <input type="number" step="0.1" {...register('volume')} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio (ARS)</label>
                <input type="number" {...register('price', { required: 'Requerido' })} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">Origen</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <input {...register('originAddress', { required: 'Requerido' })} className={inputClass} placeholder="Dirección de origen" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitud</label>
                <input type="number" step="any" {...register('originLat', { required: 'Requerido' })} className={inputClass} placeholder="-34.6037" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitud</label>
                <input type="number" step="any" {...register('originLng', { required: 'Requerido' })} className={inputClass} placeholder="-58.3816" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">Destino</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <input {...register('destAddress', { required: 'Requerido' })} className={inputClass} placeholder="Dirección de destino" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitud</label>
                <input type="number" step="any" {...register('destLat', { required: 'Requerido' })} className={inputClass} placeholder="-31.4201" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitud</label>
                <input type="number" step="any" {...register('destLng', { required: 'Requerido' })} className={inputClass} placeholder="-64.1888" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">Fechas</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Recogida</label>
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
