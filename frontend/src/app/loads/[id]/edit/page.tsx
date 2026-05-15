'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { loadsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import Link from 'next/link';

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

function toDatetimeLocal(iso: string | undefined | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EditLoadPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const id = params.id as string;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<LoadForm>();

  const { data: load, isLoading } = useQuery({
    queryKey: ['load', id],
    queryFn: () => loadsApi.getById(id).then((r) => r.data),
  });

  useEffect(() => {
    if (load) {
      reset({
        title: load.title,
        description: load.description || '',
        originAddress: load.originAddress,
        originLat: load.originLat,
        originLng: load.originLng,
        destAddress: load.destAddress,
        destLat: load.destLat,
        destLng: load.destLng,
        cargoType: load.cargoType,
        weight: load.weight,
        volume: load.volume || undefined,
        pickupDate: toDatetimeLocal(load.pickupDate),
        deliveryDate: toDatetimeLocal(load.deliveryDate),
        price: load.price,
      });
    }
  }, [load, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: LoadForm) =>
      loadsApi.update(id, {
        ...data,
        originLat: Number(data.originLat),
        originLng: Number(data.originLng),
        destLat: Number(data.destLat),
        destLng: Number(data.destLng),
        weight: Number(data.weight),
        volume: data.volume ? Number(data.volume) : undefined,
        price: Number(data.price),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['load', id] });
      router.push(`/loads/${id}`);
    },
  });

  const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none';

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (!load) {
    return (
      <DashboardLayout>
        <div className="text-center py-20 text-gray-400">Carga no encontrada</div>
      </DashboardLayout>
    );
  }

  if (load.status !== 'PUBLISHED') {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-20">
          <p className="text-gray-500 text-lg mb-4">
            Solo se pueden editar cargas con estado PUBLISHED.
          </p>
          <Link
            href={`/loads/${id}`}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Volver al detalle
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Editar Carga</h1>
          <Link
            href={`/loads/${id}`}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Volver
          </Link>
        </div>

        {updateMutation.isError && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {(updateMutation.error as any)?.response?.data?.message || 'Error al actualizar la carga'}
          </div>
        )}

        <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
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

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">Origen</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección <span className="text-red-500">*</span></label>
              <input {...register('originAddress', { required: 'Requerido' })} className={inputClass} placeholder="Dirección de origen" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitud <span className="text-red-500">*</span></label>
                <input type="number" step="any" {...register('originLat', { required: 'Requerido' })} className={inputClass} placeholder="-34.6037" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitud <span className="text-red-500">*</span></label>
                <input type="number" step="any" {...register('originLng', { required: 'Requerido' })} className={inputClass} placeholder="-58.3816" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
            <h2 className="font-semibold text-gray-700">Destino</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección <span className="text-red-500">*</span></label>
              <input {...register('destAddress', { required: 'Requerido' })} className={inputClass} placeholder="Dirección de destino" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitud <span className="text-red-500">*</span></label>
                <input type="number" step="any" {...register('destLat', { required: 'Requerido' })} className={inputClass} placeholder="-31.4201" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitud <span className="text-red-500">*</span></label>
                <input type="number" step="any" {...register('destLng', { required: 'Requerido' })} className={inputClass} placeholder="-64.1888" />
              </div>
            </div>
          </div>

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
            disabled={updateMutation.isPending}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
