'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usersApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { User as UserIcon, Check } from 'lucide-react';
import type { User } from '@/types';

interface ProfileForm {
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
}

const inputClass =
  'w-full px-4 py-2.5 bg-surface-raised border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const role = user?.role;
  const isCompany = role === 'COMPANY_ADMIN';
  const showCompanyName = role === 'CARGO_GENERATOR';

  const { data: profile } = useQuery<User>({
    queryKey: ['profile'],
    queryFn: () => usersApi.getProfile().then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>();
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      reset({
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        phone: profile.phone ?? '',
        companyName: profile.companyName ?? '',
      });
    }
  }, [profile, reset]);

  const profileMutation = useMutation({
    mutationFn: (data: Partial<ProfileForm>) => usersApi.updateProfile(data).then((r) => r.data),
    onSuccess: (updated: User) => {
      updateUser({ firstName: updated.firstName, lastName: updated.lastName });
      reset({
        firstName: updated.firstName ?? '',
        lastName: updated.lastName ?? '',
        phone: updated.phone ?? '',
        companyName: updated.companyName ?? '',
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    },
  });

  const onSaveProfile = (data: ProfileForm) => {
    // Sólo enviamos los campos que aplican al rol (evita pisar con vacíos).
    const payload: Partial<ProfileForm> = isCompany
      ? { firstName: data.firstName.trim(), phone: data.phone.trim() }
      : {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          phone: data.phone.trim(),
          ...(showCompanyName ? { companyName: data.companyName.trim() } : {}),
        };
    profileMutation.mutate(payload);
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-8">
        <div>
          <p className="eyebrow">Cuenta</p>
          <h1 className="mt-1 font-display text-[28px] leading-tight flex items-center gap-2">
            <UserIcon size={24} /> Mi perfil
          </h1>
          <p className="text-ink-500 mt-1 text-sm">
            Mantené actualizada tu información de contacto.
          </p>
        </div>

        <section className="bg-surface-raised rounded-xl shadow-sm border border-ink-100 p-6">
          <h2 className="font-medium text-[15px] mb-1">
            {isCompany ? 'Datos de la empresa' : 'Datos personales'}
          </h2>
          <p className="text-ink-500 text-sm mb-4">
            Tu correo actual es <span className="font-medium text-ink-700">{profile?.email}</span>.
            Para cambiarlo, contactá a un administrador.
          </p>
          <form onSubmit={handleSubmit(onSaveProfile)} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
                {isCompany ? 'Nombre de la empresa' : 'Nombre'}
              </label>
              <input
                className={inputClass}
                {...register('firstName', {
                  required: isCompany ? 'El nombre de la empresa es obligatorio' : 'El nombre es obligatorio',
                })}
              />
              {errors.firstName && (
                <p className="text-danger-600 text-xs mt-1">{errors.firstName.message}</p>
              )}
            </div>

            {!isCompany && (
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Apellido</label>
                <input
                  className={inputClass}
                  {...register('lastName', { required: 'El apellido es obligatorio' })}
                />
                {errors.lastName && (
                  <p className="text-danger-600 text-xs mt-1">{errors.lastName.message}</p>
                )}
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-ink-700 mb-1.5">Teléfono</label>
              <input
                className={inputClass}
                {...register('phone', {
                  required: 'El teléfono es obligatorio',
                  pattern: { value: /^\+?[\d\s\-().]{7,20}$/, message: 'Teléfono inválido' },
                })}
              />
              {errors.phone && <p className="text-danger-600 text-xs mt-1">{errors.phone.message}</p>}
            </div>

            {showCompanyName && (
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5">
                  Empresa <span className="text-ink-400">(opcional)</span>
                </label>
                <input className={inputClass} {...register('companyName')} />
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={profileMutation.isPending || !isDirty}
                className="bg-ink-900 hover:bg-ink-800 text-surface-raised font-medium px-5 py-2.5 rounded-lg transition disabled:opacity-50 text-[14px]"
              >
                {profileMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
              {profileSaved && (
                <span className="text-green-600 text-sm flex items-center gap-1">
                  <Check size={15} /> Guardado
                </span>
              )}
              {profileMutation.isError && (
                <span className="text-danger-600 text-sm">
                  {(profileMutation.error as any)?.response?.data?.message || 'Error al guardar'}
                </span>
              )}
            </div>
          </form>
        </section>
      </div>
    </DashboardLayout>
  );
}
