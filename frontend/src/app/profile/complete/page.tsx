'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import DocumentRow from '@/components/transporter-profile/DocumentRow';
import { transporterProfileApi, usersApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import {
  DOCUMENT_TYPES,
  LICENSE_CATEGORIES,
  VEHICLE_TYPES,
  describeMissing,
  isNotExpired,
  todayIsoDate,
  useProfileStatus,
} from '@/lib/transporterProfile';
import { ClipboardCheck, CheckCircle2 } from 'lucide-react';
import type { DocumentType, TransporterDocument, User, Vehicle, VehicleType } from '@/types';

const inputClass =
  'w-full px-4 py-2.5 bg-surface-raised border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition';

// Versión del texto de la declaración jurada — se guarda junto a la fecha de
// aceptación para poder demostrar qué versión aceptó cada usuario si el texto
// cambia más adelante.
const TERMS_VERSION = '2026-09-22';

interface PersonalForm {
  cuit: string;
  licenseCategory: string;
  licenseExpiresAt: string;
}

interface VehicleForm {
  plate: string;
  brand: string;
  model: string;
  year: number;
  type: VehicleType;
  maxWeightKg: number;
  maxVolumeM3?: number;
  heightCm?: number;
  widthCm?: number;
  lengthCm?: number;
  refrigerated: boolean;
  hazardousMaterials: boolean;
  bulkLiquid: boolean;
  insuranceExpiresAt?: string;
  vtvExpiresAt?: string;
}

export default function CompleteProfilePage() {
  const role = useAuthStore((s) => s.user?.role);
  const queryClient = useQueryClient();

  const statusQuery = useProfileStatus();

  const { data: profile } = useQuery<User>({
    queryKey: ['profile'],
    queryFn: () => usersApi.getProfile().then((r) => r.data),
    enabled: role === 'TRANSPORTER',
  });

  const { data: documents = [] } = useQuery<TransporterDocument[]>({
    queryKey: ['transporter-documents'],
    queryFn: () => transporterProfileApi.listDocuments().then((r) => r.data),
    enabled: role === 'TRANSPORTER',
  });

  const { data: vehicle } = useQuery<Vehicle | null>({
    queryKey: ['transporter-vehicle'],
    queryFn: () => transporterProfileApi.getVehicle().then((r) => r.data),
    enabled: role === 'TRANSPORTER',
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['transporter-profile-status'] });
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['transporter-documents'] });
    queryClient.invalidateQueries({ queryKey: ['transporter-vehicle'] });
  };

  // --- Datos personales ---
  const personalForm = useForm<PersonalForm>();
  useEffect(() => {
    if (profile) {
      personalForm.reset({
        cuit: profile.cuit ?? '',
        licenseCategory: profile.licenseCategory ?? '',
        licenseExpiresAt: profile.licenseExpiresAt ? profile.licenseExpiresAt.slice(0, 10) : '',
      });
    }
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const personalMutation = useMutation({
    mutationFn: (data: PersonalForm) => usersApi.updateProfile(data).then((r) => r.data),
    onSuccess: invalidateAll,
  });

  // --- Documentos ---
  const uploadMutation = useMutation({
    mutationFn: ({ type, file }: { type: DocumentType; file: File }) =>
      transporterProfileApi.uploadDocument(type, file),
    onSuccess: invalidateAll,
  });
  const documentByType = new Map(documents.map((d) => [d.type, d]));

  // --- Vehículo ---
  const vehicleForm = useForm<VehicleForm>({
    defaultValues: {
      type: 'CAMION',
      refrigerated: false,
      hazardousMaterials: false,
      bulkLiquid: false,
    },
  });
  useEffect(() => {
    if (vehicle) {
      vehicleForm.reset({
        plate: vehicle.plate,
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
        type: vehicle.type,
        maxWeightKg: vehicle.maxWeightKg,
        maxVolumeM3: vehicle.maxVolumeM3 ?? undefined,
        heightCm: vehicle.heightCm ?? undefined,
        widthCm: vehicle.widthCm ?? undefined,
        lengthCm: vehicle.lengthCm ?? undefined,
        refrigerated: vehicle.refrigerated,
        hazardousMaterials: vehicle.hazardousMaterials,
        bulkLiquid: vehicle.bulkLiquid,
        insuranceExpiresAt: vehicle.insuranceExpiresAt ? vehicle.insuranceExpiresAt.slice(0, 10) : undefined,
        vtvExpiresAt: vehicle.vtvExpiresAt ? vehicle.vtvExpiresAt.slice(0, 10) : undefined,
      });
    }
  }, [vehicle]); // eslint-disable-line react-hooks/exhaustive-deps

  const vehicleMutation = useMutation({
    mutationFn: (data: VehicleForm) =>
      transporterProfileApi.upsertVehicle({
        ...data,
        year: Number(data.year),
        maxWeightKg: Number(data.maxWeightKg),
        maxVolumeM3: data.maxVolumeM3 ? Number(data.maxVolumeM3) : undefined,
        heightCm: data.heightCm ? Number(data.heightCm) : undefined,
        widthCm: data.widthCm ? Number(data.widthCm) : undefined,
        lengthCm: data.lengthCm ? Number(data.lengthCm) : undefined,
      }),
    onSuccess: invalidateAll,
  });

  // --- Declaración jurada ---
  const [termsChecked, setTermsChecked] = useState(false);
  const termsMutation = useMutation({
    mutationFn: () => transporterProfileApi.acceptTerms(TERMS_VERSION),
    onSuccess: invalidateAll,
  });

  if (role !== 'TRANSPORTER') {
    return (
      <DashboardLayout>
        <p className="text-ink-500">Esta sección es solo para transportistas.</p>
      </DashboardLayout>
    );
  }

  const status = statusQuery.data;

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <p className="eyebrow">Perfil de transportista</p>
          <h1 className="mt-1 font-display text-[28px] leading-tight flex items-center gap-2">
            <ClipboardCheck size={24} /> Completar perfil
          </h1>
          <p className="text-ink-500 mt-1 text-sm">
            Necesitamos estos datos para habilitarte a postularte a cargas.
          </p>
        </div>

        {status && (
          <section
            className={`rounded-xl border p-4 ${
              status.complete
                ? 'bg-success-50 border-success-600/20 text-success-700'
                : 'bg-warning-50 border-warning-600/20 text-warning-700'
            }`}
          >
            {status.complete ? (
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 size={16} /> Tu perfil está completo. Ya podés postularte a cargas.
              </p>
            ) : (
              <div className="text-sm">
                <p className="font-medium mb-1.5">Te falta completar:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {status.missing.map((code) => (
                    <li key={code}>{describeMissing(code)}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Datos personales */}
        <section className="bg-surface-raised rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-medium text-[15px] mb-4">Datos personales</h2>
          <form
            onSubmit={personalForm.handleSubmit((data) => personalMutation.mutate(data))}
            className="space-y-4"
          >
            <div>
              <label className="block text-[12px] font-medium text-ink-700 mb-1.5">CUIT/CUIL</label>
              <input
                className={inputClass}
                placeholder="20-12345678-3"
                {...personalForm.register('cuit', { required: 'El CUIT/CUIL es obligatorio' })}
              />
              {personalForm.formState.errors.cuit && (
                <p className="text-danger-600 text-xs mt-1">{personalForm.formState.errors.cuit.message}</p>
              )}
            </div>
            <div>
              <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Categoría de licencia</label>
              <select
                className={inputClass}
                defaultValue=""
                {...personalForm.register('licenseCategory', { required: 'La categoría es obligatoria' })}
              >
                <option value="" disabled>
                  Elegí una categoría
                </option>
                {LICENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {personalForm.formState.errors.licenseCategory && (
                <p className="text-danger-600 text-xs mt-1">
                  {personalForm.formState.errors.licenseCategory.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Vencimiento de la licencia</label>
              <input
                type="date"
                min={todayIsoDate()}
                className={inputClass}
                {...personalForm.register('licenseExpiresAt', {
                  required: 'El vencimiento es obligatorio',
                  validate: (v) => isNotExpired(v) || 'La licencia está vencida — poné la fecha del próximo vencimiento',
                })}
              />
              {personalForm.formState.errors.licenseExpiresAt && (
                <p className="text-danger-600 text-xs mt-1">
                  {personalForm.formState.errors.licenseExpiresAt.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={personalMutation.isPending}
              className="bg-ink-900 hover:bg-ink-800 text-surface-raised font-medium px-5 py-2.5 rounded-lg transition disabled:opacity-50 text-[14px]"
            >
              {personalMutation.isPending ? 'Guardando…' : 'Guardar datos personales'}
            </button>
          </form>
        </section>

        {/* Documentos */}
        <section className="bg-surface-raised rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-medium text-[15px] mb-1">Documentos</h2>
          <p className="text-ink-500 text-sm mb-2">Formatos aceptados: JPG, PNG o PDF, hasta 5MB.</p>
          <div>
            {DOCUMENT_TYPES.map(({ type, label }) => (
              <DocumentRow
                key={type}
                type={type}
                label={label}
                document={documentByType.get(type)}
                uploading={uploadMutation.isPending}
                onUpload={(t, file) => uploadMutation.mutate({ type: t, file })}
              />
            ))}
          </div>
          {uploadMutation.isError && (
            <p className="text-danger-600 text-xs mt-3">
              {(uploadMutation.error as any)?.response?.data?.message || 'Error al subir el archivo'}
            </p>
          )}
        </section>

        {/* Vehículo */}
        <section className="bg-surface-raised rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-medium text-[15px] mb-4">Vehículo</h2>
          <form
            onSubmit={vehicleForm.handleSubmit((data) => vehicleMutation.mutate(data))}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Dominio</label>
                <input
                  className={inputClass}
                  placeholder="AB123CD"
                  {...vehicleForm.register('plate', { required: 'El dominio es obligatorio' })}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Tipo de vehículo</label>
                <select className={inputClass} {...vehicleForm.register('type', { required: true })}>
                  {VEHICLE_TYPES.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Marca</label>
                <input
                  className={inputClass}
                  {...vehicleForm.register('brand', { required: 'La marca es obligatoria' })}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Modelo</label>
                <input
                  className={inputClass}
                  {...vehicleForm.register('model', { required: 'El modelo es obligatorio' })}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Año</label>
                <input
                  type="number"
                  className={inputClass}
                  {...vehicleForm.register('year', { required: 'El año es obligatorio' })}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
                  Capacidad de carga (kg)
                </label>
                <input
                  type="number"
                  className={inputClass}
                  {...vehicleForm.register('maxWeightKg', { required: 'La capacidad es obligatoria' })}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
                  Volumen (m³) <span className="text-ink-400">(opcional)</span>
                </label>
                <input type="number" step="any" className={inputClass} {...vehicleForm.register('maxVolumeM3')} />
              </div>
              <div />
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
                  Alto (cm) <span className="text-ink-400">(opcional)</span>
                </label>
                <input type="number" className={inputClass} {...vehicleForm.register('heightCm')} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
                  Ancho (cm) <span className="text-ink-400">(opcional)</span>
                </label>
                <input type="number" className={inputClass} {...vehicleForm.register('widthCm')} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
                  Largo (cm) <span className="text-ink-400">(opcional)</span>
                </label>
                <input type="number" className={inputClass} {...vehicleForm.register('lengthCm')} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
                  Vencimiento del seguro <span className="text-ink-400">(opcional)</span>
                </label>
                <input
                  type="date"
                  min={todayIsoDate()}
                  className={inputClass}
                  {...vehicleForm.register('insuranceExpiresAt', {
                    validate: (v) => !v || isNotExpired(v) || 'El seguro está vencido',
                  })}
                />
                {vehicleForm.formState.errors.insuranceExpiresAt && (
                  <p className="text-danger-600 text-xs mt-1">
                    {vehicleForm.formState.errors.insuranceExpiresAt.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
                  Vencimiento de la VTV <span className="text-ink-400">(opcional)</span>
                </label>
                <input
                  type="date"
                  min={todayIsoDate()}
                  className={inputClass}
                  {...vehicleForm.register('vtvExpiresAt', {
                    validate: (v) => !v || isNotExpired(v) || 'La VTV está vencida',
                  })}
                />
                {vehicleForm.formState.errors.vtvExpiresAt && (
                  <p className="text-danger-600 text-xs mt-1">
                    {vehicleForm.formState.errors.vtvExpiresAt.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-[13px] text-ink-700">
                <input type="checkbox" {...vehicleForm.register('refrigerated')} /> Refrigerado
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink-700">
                <input type="checkbox" {...vehicleForm.register('hazardousMaterials')} /> Cargas peligrosas
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink-700">
                <input type="checkbox" {...vehicleForm.register('bulkLiquid')} /> A granel/líquidos
              </label>
            </div>

            {vehicleMutation.isError && (
              <p className="text-danger-600 text-xs">
                {(vehicleMutation.error as any)?.response?.data?.message || 'Error al guardar el vehículo'}
              </p>
            )}

            <button
              type="submit"
              disabled={vehicleMutation.isPending}
              className="bg-ink-900 hover:bg-ink-800 text-surface-raised font-medium px-5 py-2.5 rounded-lg transition disabled:opacity-50 text-[14px]"
            >
              {vehicleMutation.isPending ? 'Guardando…' : 'Guardar vehículo'}
            </button>
          </form>
        </section>

        {/* Declaración jurada */}
        <section className="bg-surface-raised rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-medium text-[15px] mb-2">Declaración jurada</h2>
          {profile?.termsAcceptedAt ? (
            <p className="text-success-700 text-sm flex items-center gap-2">
              <CheckCircle2 size={16} /> Aceptada el{' '}
              {new Date(profile.termsAcceptedAt).toLocaleDateString('es-AR')}.
            </p>
          ) : (
            <>
              <p className="text-ink-600 text-sm mb-3">
                Declaro bajo juramento que la documentación que subí es auténtica, está vigente, y que
                acepto los Términos y Condiciones y la Política de Privacidad de CargoLink.
              </p>
              <label className="flex items-start gap-2 text-[13px] text-ink-700 mb-3">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={termsChecked}
                  onChange={(e) => setTermsChecked(e.target.checked)}
                />
                Leí y acepto la declaración jurada de arriba.
              </label>
              {termsMutation.isError && (
                <p className="text-danger-600 text-xs mb-2">
                  {(termsMutation.error as any)?.response?.data?.message || 'Error al aceptar'}
                </p>
              )}
              <button
                type="button"
                disabled={!termsChecked || termsMutation.isPending}
                onClick={() => termsMutation.mutate()}
                className="bg-ink-900 hover:bg-ink-800 text-surface-raised font-medium px-5 py-2.5 rounded-lg transition disabled:opacity-50 text-[14px]"
              >
                {termsMutation.isPending ? 'Guardando…' : 'Aceptar declaración jurada'}
              </button>
            </>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
