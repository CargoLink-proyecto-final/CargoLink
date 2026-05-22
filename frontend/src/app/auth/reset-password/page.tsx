'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, CheckCircle } from 'lucide-react';
import { authApi } from '@/lib/api';

interface ResetForm {
  newPassword: string;
  confirmPassword: string;
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ResetForm>();
  const passwordValue = watch('newPassword');

  const onSubmit = async (data: ResetForm) => {
    if (!token) {
      setError('El enlace de recuperación no es válido o ya expiró.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword(token, data.newPassword);
      setSuccess(true);
      setTimeout(() => router.push('/auth/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'El enlace expiró o ya fue usado. Solicitá uno nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <p className="eyebrow mb-3">Error</p>
          <h1 className="font-display text-[28px] font-semibold mb-4">Enlace inválido</h1>
          <p className="text-ink-500 text-sm mb-6">
            Este enlace de recuperación no es válido o ya expiró.
          </p>
          <Link
            href="/auth/forgot-password"
            className="inline-block bg-ink-900 hover:bg-ink-800 text-surface-raised font-medium py-2.5 px-6 rounded-lg transition text-[14px]"
          >
            Solicitar nuevo enlace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Link href="/auth/login" className="font-display font-semibold text-[24px] text-ink-900">
            CargoLink
          </Link>
          <p className="eyebrow mt-4">Recuperación</p>
          <h1 className="mt-2 font-display text-[34px] leading-tight">
            Nueva <span className="font-semibold text-primary-700">contraseña</span>
          </h1>
          <p className="text-ink-500 mt-2 text-[14px]">
            Elegí una contraseña segura para tu cuenta.
          </p>
        </div>

        {success ? (
          <div className="bg-success-50 border border-success-600/15 rounded-xl p-6 text-center">
            <CheckCircle size={40} className="text-success-600 mx-auto mb-3" />
            <p className="font-medium text-success-700 text-[15px]">Contraseña actualizada</p>
            <p className="text-success-600 text-sm mt-1">Redirigiendo al inicio de sesión…</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-danger-50 border border-danger-600/15 text-danger-700 p-3.5 rounded-lg mb-5 text-sm">
                <p>{error}</p>
                <Link href="/auth/forgot-password" className="mt-1 inline-block text-xs font-medium underline">
                  Solicitar nuevo enlace
                </Link>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5 tracking-wide">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    {...register('newPassword', {
                      required: 'La contraseña es obligatoria',
                      minLength: { value: 6, message: 'Mínimo 6 caracteres' },
                    })}
                    className="w-full px-4 py-2.5 pr-10 bg-surface-raised border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.newPassword && <p className="text-danger-600 text-xs mt-1">{errors.newPassword.message}</p>}
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink-700 mb-1.5 tracking-wide">
                  Repetir contraseña
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    {...register('confirmPassword', {
                      required: 'Repetí la contraseña',
                      validate: (v) => v === passwordValue || 'Las contraseñas no coinciden',
                    })}
                    className="w-full px-4 py-2.5 pr-10 bg-surface-raised border border-ink-200 rounded-lg text-[14px] focus:ring-4 focus:ring-primary-600/15 focus:border-primary-600 outline-none transition"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="text-danger-600 text-xs mt-1">{errors.confirmPassword.message}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-ink-900 hover:bg-ink-800 text-surface-raised font-medium py-3 rounded-lg transition disabled:opacity-50 text-[14px]"
              >
                {loading ? 'Actualizando…' : 'Cambiar contraseña'}
              </button>
            </form>
          </>
        )}

        <p className="text-center text-sm text-ink-500 mt-7">
          <Link href="/auth/login" className="text-primary-700 hover:text-primary-800 font-medium hover:underline">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
